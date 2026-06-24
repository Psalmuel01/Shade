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
///         through every state. Amount is never revealed in plaintext.
///
/// Flow:
///   1. Depositor creates shell → funds it (CREATED → FUNDED)
///   2. Recipient delivers → calls markCompleted with off-chain proof (FUNDED → COMPLETED)
///   3. Depositor reviews proof → calls release within RELEASE_WINDOW (COMPLETED → RELEASED)
///   4. If depositor stalls past RELEASE_WINDOW:
///        - With arbiter  → recipient calls disputeWithProof → arbiter resolves (DISPUTED)
///        - Without arbiter → recipient calls claimAfterWindow → auto-releases (RELEASED)
///   5. No delivery → depositor waits for timeout → reclaims (FUNDED → REFUNDED)
///      (timeout is automatically blocked once state = COMPLETED)
contract PrivateEscrow is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    ConfidentialUSDC public cusdc;

    /// @dev Time the depositor has to release after recipient marks completed.
    uint256 public constant RELEASE_WINDOW = 10 minutes;

    enum EscrowState {
        CREATED,   // 0 — shell created, not yet funded
        FUNDED,    // 1 — depositor locked cUSDC; timeout active
        COMPLETED, // 2 — recipient marked delivery; release window active; timeout blocked
        RELEASED,  // 3 — funds sent to recipient
        DISPUTED,  // 4 — arbiter called in
        REFUNDED,  // 5 — funds returned to depositor
        CANCELLED  // 6 — cancelled before funding
    }

    struct Escrow {
        address depositor;
        address recipient;
        address arbiter;      // address(0) if none
        euint64 amount;       // always encrypted
        EscrowState state;
        uint256 createdAt;
        uint256 timeoutAt;    // depositor can self-refund if still FUNDED past this
        uint256 completedAt;  // set when recipient calls markCompleted
    }

    uint256 public escrowCount;
    mapping(uint256 => Escrow) private _escrows;

    event EscrowCreated(uint256 indexed id, address indexed depositor, address indexed recipient, address arbiter);
    event EscrowFunded(uint256 indexed id);
    event EscrowCompleted(uint256 indexed id, address indexed by, string proofURI);
    event EscrowReleased(uint256 indexed id);
    event EscrowDisputed(uint256 indexed id, address indexed by, string proofURI);
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
    /// @param timeoutSeconds Seconds from now after which the depositor can self-refund if still FUNDED.
    function createEscrow(address recipient, address arbiter, uint256 timeoutSeconds)
        external
        returns (uint256 id)
    {
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
    /// @dev Depositor must first `cusdc.approve(escrowAddr, >= amount)`.
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
        if (e.arbiter != address(0)) FHE.allow(moved, e.arbiter);

        emit EscrowFunded(id);
    }

    /// @notice Recipient marks delivery complete and starts the RELEASE_WINDOW.
    ///         Once called, the escrow moves to COMPLETED — the depositor's timeout is blocked.
    ///         `proofURI` is off-chain evidence for the depositor (and arbiter if needed).
    function markCompleted(uint256 id, string calldata proofURI) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.recipient, "not recipient");
        require(e.state == EscrowState.FUNDED, "bad state");
        e.state = EscrowState.COMPLETED;
        e.completedAt = block.timestamp;
        emit EscrowCompleted(id, msg.sender, proofURI);
    }

    /// @notice Depositor releases funds to the recipient.
    ///         Callable from FUNDED (early, skipping mark) or COMPLETED (normal flow).
    function release(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.FUNDED || e.state == EscrowState.COMPLETED, "bad state");
        e.state = EscrowState.RELEASED;
        _payout(e.amount, e.recipient);
        emit EscrowReleased(id);
    }

    /// @notice Recipient escalates to the arbiter after the RELEASE_WINDOW expires.
    ///         Requires state COMPLETED (markCompleted was called) and an arbiter.
    ///         `proofURI` supplements or confirms the evidence from markCompleted.
    function disputeWithProof(uint256 id, string calldata proofURI) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.recipient, "not recipient");
        require(e.state == EscrowState.COMPLETED, "not completed");
        require(block.timestamp >= e.completedAt + RELEASE_WINDOW, "release window still active");
        require(e.arbiter != address(0), "no arbiter - use claimAfterWindow");
        e.state = EscrowState.DISPUTED;
        emit EscrowDisputed(id, msg.sender, proofURI);
    }

    /// @notice Recipient auto-claims when there is no arbiter and RELEASE_WINDOW has expired.
    ///         If you set an arbiter, use disputeWithProof instead.
    function claimAfterWindow(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.recipient, "not recipient");
        require(e.state == EscrowState.COMPLETED, "not completed");
        require(block.timestamp >= e.completedAt + RELEASE_WINDOW, "release window still active");
        require(e.arbiter == address(0), "arbiter set - use disputeWithProof");
        e.state = EscrowState.RELEASED;
        _payout(e.amount, e.recipient);
        emit EscrowReleased(id);
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

    /// @notice Depositor reclaims a FUNDED escrow after timeout. Blocked once recipient
    ///         calls markCompleted (state moves to COMPLETED, breaking the FUNDED requirement).
    function timeout(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.FUNDED, "bad state");
        require(block.timestamp >= e.timeoutAt, "too early");
        e.state = EscrowState.REFUNDED;
        _payout(e.amount, e.depositor);
        emit EscrowRefunded(id);
    }

    /// @notice Cancel an unfunded escrow shell.
    function cancel(uint256 id) external {
        Escrow storage e = _escrows[id];
        require(msg.sender == e.depositor, "not depositor");
        require(e.state == EscrowState.CREATED, "bad state");
        e.state = EscrowState.CANCELLED;
        emit EscrowCancelled(id);
    }

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
            uint256 timeoutAt,
            uint256 completedAt
        )
    {
        Escrow storage e = _escrows[id];
        return (e.depositor, e.recipient, e.arbiter, e.state, e.createdAt, e.timeoutAt, e.completedAt);
    }

    function escrowAmount(uint256 id) external view returns (euint64) {
        return _escrows[id].amount;
    }
}
