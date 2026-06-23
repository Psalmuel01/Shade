// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

/// @title  PrivateEscrow
/// @notice Two-party escrow whose locked amount stays an encrypted `euint64`
///         through every state. An optional arbiter can resolve disputes without
///         ever learning the amount. No plaintext amount appears at any stage.
contract PrivateEscrow is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    ConfidentialUSDC public cusdc;

    enum EscrowState {
        CREATED, // shell created, not yet funded
        FUNDED, // depositor has locked cUSDC
        RELEASED, // funds sent to recipient
        DISPUTED, // either party flagged a dispute
        REFUNDED, // funds returned to depositor
        CANCELLED // cancelled before funding
    }

    struct Escrow {
        address depositor;
        address recipient;
        address arbiter; // address(0) if none
        euint64 amount; // always encrypted
        EscrowState state;
        uint256 createdAt;
        uint256 timeoutAt; // after this, depositor can self-refund a FUNDED escrow
    }

    uint256 public escrowCount;
    mapping(uint256 => Escrow) private _escrows;

    event EscrowCreated(uint256 indexed id, address indexed depositor, address indexed recipient, address arbiter);
    event EscrowFunded(uint256 indexed id);
    event EscrowReleased(uint256 indexed id);
    event EscrowDisputed(uint256 indexed id, address indexed by);
    event EscrowRefunded(uint256 indexed id);
    event EscrowCancelled(uint256 indexed id);

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

    /// @notice Create an escrow shell. `arbiter` may be address(0).
    /// @param timeoutSeconds Seconds from now after which the depositor can self-refund.
    function createEscrow(address recipient, address arbiter, uint256 timeoutSeconds) external returns (uint256 id) {
        require(recipient != address(0), "recipient=0");
        id = ++escrowCount;
        Escrow storage e = _escrows[id];
        e.depositor = msg.sender;
        e.recipient = recipient;
        e.arbiter = arbiter;
        e.state = EscrowState.CREATED;
        e.createdAt = block.timestamp;
        e.timeoutAt = block.timestamp + timeoutSeconds;
        emit EscrowCreated(id, msg.sender, recipient, arbiter);
    }

    /// @notice Lock encrypted cUSDC into the escrow.
    /// @dev Depositor must first `cusdc.approve(escrow, >= amount)`.
    function fund(uint256 id, externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.CREATED, "bad state");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(amount, address(cusdc));
        euint64 moved = cusdc.transferFrom(msg.sender, address(this), amount);

        e.amount = moved;
        e.state = EscrowState.FUNDED;

        FHE.allowThis(moved);
        FHE.allow(moved, e.depositor);
        FHE.allow(moved, e.recipient);
        if (e.arbiter != address(0)) {
            FHE.allow(moved, e.arbiter);
        }
        emit EscrowFunded(id);
    }

    /// @notice Recipient confirms delivery; funds are released to them.
    function release(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.recipient, "not recipient");
        require(e.state == EscrowState.FUNDED, "bad state");
        e.state = EscrowState.RELEASED;
        _payout(e.amount, e.recipient);
        emit EscrowReleased(id);
    }

    /// @notice Either party flags a dispute (requires an arbiter to be set).
    function dispute(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor || msg.sender == e.recipient, "not a party");
        require(e.state == EscrowState.FUNDED, "bad state");
        require(e.arbiter != address(0), "no arbiter");
        e.state = EscrowState.DISPUTED;
        emit EscrowDisputed(id, msg.sender);
    }

    /// @notice Arbiter awards the escrow to the recipient.
    function resolveToRecipient(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.arbiter, "not arbiter");
        require(e.state == EscrowState.DISPUTED, "bad state");
        e.state = EscrowState.RELEASED;
        _payout(e.amount, e.recipient);
        emit EscrowReleased(id);
    }

    /// @notice Arbiter returns the escrow to the depositor.
    function resolveToDepositor(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.arbiter, "not arbiter");
        require(e.state == EscrowState.DISPUTED, "bad state");
        e.state = EscrowState.REFUNDED;
        _payout(e.amount, e.depositor);
        emit EscrowRefunded(id);
    }

    /// @notice After the timeout, the depositor can self-refund a still-FUNDED escrow.
    function timeout(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.FUNDED, "bad state");
        require(block.timestamp >= e.timeoutAt, "too early");
        e.state = EscrowState.REFUNDED;
        _payout(e.amount, e.depositor);
        emit EscrowRefunded(id);
    }

    /// @notice Cancel an unfunded escrow.
    function cancel(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.CREATED, "bad state");
        e.state = EscrowState.CANCELLED;
        emit EscrowCancelled(id);
    }

    /// @dev Move the escrowed encrypted amount out to `to`.
    function _payout(euint64 amount, address to) internal {
        FHE.allowTransient(amount, address(cusdc));
        cusdc.transfer(to, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getEscrow(uint256 id)
        external
        view
        returns (
            address depositor,
            address recipient,
            address arbiter,
            EscrowState state,
            uint256 createdAt,
            uint256 timeoutAt
        )
    {
        Escrow storage e = _escrows[id];
        return (e.depositor, e.recipient, e.arbiter, e.state, e.createdAt, e.timeoutAt);
    }

    /// @notice Encrypted escrow amount (only parties + arbiter have ACL).
    function escrowAmount(uint256 id) external view returns (euint64) {
        return _escrows[id].amount;
    }
}
