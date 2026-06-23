// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, eaddress, ebool, externalEuint64, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

/// @title  StealthSend
/// @notice Shade's "Stealth Send": the recipient address itself is encrypted as
///         an `eaddress`, so even the destination is hidden on-chain (the amount
///         is always hidden too). The intended recipient claims by proving, in
///         FHE, that their address matches the encrypted recipient.
///
/// @dev    This is what makes Shade technically distinct from coprocessor-based
///         payment systems: `eaddress` lets recipients stay hidden on-chain.
///         No revert leaks anything — a non-recipient `claim` silently moves 0.
contract StealthSend is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    ConfidentialUSDC public cusdc;

    struct StealthTransfer {
        address sender; // public: the tx is signed by them
        eaddress recipient; // encrypted destination
        euint64 amount; // encrypted, decremented to 0 once claimed
    }

    uint256 public transferCount;
    mapping(uint256 => StealthTransfer) private _transfers;

    event StealthSent(uint256 indexed id, address indexed sender);
    event StealthClaimAttempt(uint256 indexed id, address indexed claimer);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address cusdcAddress, address owner_) public initializer {
        require(cusdcAddress != address(0), "cusdc=0");
        __Ownable_init(owner_);
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());
        cusdc = ConfidentialUSDC(cusdcAddress);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // -------------------------------------------------------------------------

    /// @notice Create a stealth transfer with an encrypted amount and encrypted
    ///         recipient. Both handles come from a single relayer input, so they
    ///         share one `inputProof`.
    /// @dev Sender must first `cusdc.approve(stealthSend, >= amount)`.
    function send(
        externalEuint64 encryptedAmount,
        externalEaddress encryptedRecipient,
        bytes calldata inputProof
    ) external returns (uint256 id) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        eaddress recipient = FHE.fromExternal(encryptedRecipient, inputProof);

        // Lock the funds in this contract.
        FHE.allowTransient(amount, address(cusdc));
        euint64 moved = cusdc.transferFrom(msg.sender, address(this), amount);

        id = ++transferCount;
        StealthTransfer storage s = _transfers[id];
        s.sender = msg.sender;
        s.recipient = recipient;
        s.amount = moved;

        FHE.allowThis(s.amount);
        FHE.allow(s.amount, msg.sender); // sender can audit what they locked
        FHE.allowThis(s.recipient);
        FHE.allow(s.recipient, msg.sender); // only the sender can read the recipient

        emit StealthSent(id, msg.sender);
    }

    /// @notice Claim a stealth transfer. Succeeds (moves the funds) only if the
    ///         caller's address matches the encrypted recipient. A non-match
    ///         moves 0 and leaks nothing.
    function claim(uint256 id) external {
        StealthTransfer storage s = _transfers[id];
        require(s.sender != address(0), "no transfer");

        // FHE equality of the encrypted recipient against the (public) caller.
        ebool isRecipient = FHE.eq(s.recipient, msg.sender);
        euint64 toSend = FHE.select(isRecipient, s.amount, FHE.asEuint64(0));

        // Decrement first (self-guards double-claims); then pay out.
        s.amount = FHE.sub(s.amount, toSend);
        FHE.allowThis(s.amount);
        FHE.allow(s.amount, s.sender);

        FHE.allowTransient(toSend, address(cusdc));
        cusdc.transfer(msg.sender, toSend);

        emit StealthClaimAttempt(id, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Views (ACL-gated)
    // -------------------------------------------------------------------------

    function sentBy(uint256 id) external view returns (address) {
        return _transfers[id].sender;
    }

    /// @notice Encrypted recipient (only the sender has ACL).
    function stealthRecipient(uint256 id) external view returns (eaddress) {
        return _transfers[id].recipient;
    }

    /// @notice Encrypted remaining amount (sender has ACL).
    function stealthAmount(uint256 id) external view returns (euint64) {
        return _transfers[id].amount;
    }
}
