// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

/// @title  BalanceProver
/// @notice Lets a user publish an on-chain, verifiable boolean proving their cUSDC
///         balance is at or above a threshold — without revealing the balance.
///         The result is public; the threshold and balance stay encrypted.
///
/// @dev    On the Zama Protocol there is no synchronous gateway callback. The flow
///         is async, in two steps:
///           1) proveAbove: compute `balance >= threshold` (an `ebool`) and mark
///              it publicly decryptable.
///           2) publishProof: anyone submits the KMS-signed cleartext; the
///              contract verifies it with `FHE.checkSignatures` and records the
///              public result.
///         Before step 1 the user must call
///         `cUSDC.authorizeBalanceRead(balanceProver)` so this contract has ACL
///         to compare their balance.
contract BalanceProver is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    ConfidentialUSDC public cusdc;

    struct ProofResult {
        bool result; // true => balance is >= threshold
        uint256 timestamp; // when published
        bool exists; // distinguishes "false" from "never proven"
    }

    mapping(address => ProofResult) public proofResults;
    mapping(address => bytes32) private _pendingHandle; // latest ebool awaiting publish

    event ProofRequested(address indexed prover, bytes32 handle);
    event ProofPublished(address indexed prover, bool result, uint256 timestamp);
    event ProofCleared(address indexed prover);

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

    /// @notice Step 1: compute `balance >= threshold` and publish it for decryption.
    /// @dev Caller must first call `cUSDC.authorizeBalanceRead(address(this))`.
    function proveAbove(externalEuint64 encryptedThreshold, bytes calldata inputProof) external {
        euint64 threshold = FHE.fromExternal(encryptedThreshold, inputProof);
        euint64 balance = cusdc.balanceOf(msg.sender);

        ebool isAbove = FHE.ge(balance, threshold);
        FHE.allowThis(isAbove);
        FHE.makePubliclyDecryptable(isAbove);

        bytes32 handle = FHE.toBytes32(isAbove);
        _pendingHandle[msg.sender] = handle;
        emit ProofRequested(msg.sender, handle);
    }

    /// @notice Step 2: record the publicly-decrypted result for `prover`.
    /// @param cleartexts      ABI-encoded decrypted bool from the relayer.
    /// @param decryptionProof KMS signatures proving the cleartext.
    function publishProof(address prover, bytes memory cleartexts, bytes memory decryptionProof) external {
        bytes32 handle = _pendingHandle[prover];
        require(handle != bytes32(0), "no pending proof");

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        FHE.checkSignatures(handles, cleartexts, decryptionProof); // reverts if invalid

        bool result = abi.decode(cleartexts, (bool));
        proofResults[prover] = ProofResult({result: result, timestamp: block.timestamp, exists: true});
        delete _pendingHandle[prover];
        emit ProofPublished(prover, result, block.timestamp);
    }

    /// @notice Any third party can read a user's latest proof result.
    function getProof(address user) external view returns (ProofResult memory) {
        return proofResults[user];
    }

    /// @notice The pending (not-yet-published) ebool handle for a prover, if any.
    function pendingHandle(address user) external view returns (bytes32) {
        return _pendingHandle[user];
    }

    /// @notice A user clears their own published proof.
    function clearProof() external {
        delete proofResults[msg.sender];
        emit ProofCleared(msg.sender);
    }
}
