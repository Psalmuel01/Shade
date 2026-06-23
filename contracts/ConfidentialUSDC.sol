// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title  ConfidentialUSDC (cUSDC)
/// @notice Wrapped USDC where every balance, allowance and the total supply are
///         encrypted `euint64` ciphertexts living on-chain. This is the foundation
///         of Shade: all other Shade contracts operate on cUSDC, never raw USDC.
///
/// @dev    Privacy model (Shade): the *amount* is always hidden. Sender and
///         receiver addresses are public (they sign / are indexed in events).
///         No amount ever appears in an event or in plaintext on-chain.
///
///         Built on the Zama Protocol fhEVM (fhevm-solidity v0.11). Key rules
///         enforced here:
///           - No synchronous decryption inside a state-changing function.
///           - Insufficient-balance is handled with `FHE.select` (silent, no
///             revert) so a failed transfer leaks nothing about the balance.
///           - Every encrypted value gets explicit ACL grants (`allowThis` for
///             the contract, `allow` for each party permitted to read it).
contract ConfidentialUSDC is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice The public USDC token backing cUSDC (assumed 6 decimals).
    IERC20 public usdc;

    /// @dev Encrypted balances. Readable only by the contract and the holder.
    mapping(address account => euint64) private _balances;

    /// @dev Encrypted allowances. Readable by contract, owner and spender.
    mapping(address owner => mapping(address spender => euint64)) private _allowances;

    /// @dev Encrypted total supply (sum of all shielded USDC).
    euint64 private _totalSupply;

    // --- unshield (async public decryption) bookkeeping ---
    struct PendingUnshield {
        address user;
        bytes32 amountHandle; // handle of the encrypted burn amount to be decrypted
        bool finalized;
    }

    uint256 public unshieldNonce;
    mapping(uint256 requestId => PendingUnshield) public pendingUnshields;

    // --- events (never carry amounts) ---
    event Shielded(address indexed account);
    event UnshieldRequested(address indexed account, uint256 indexed requestId);
    event Unshielded(address indexed account, uint256 indexed requestId);
    event Transfer(address indexed from, address indexed to);
    event Approval(address indexed owner, address indexed spender);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param usdcAddress The backing public USDC token.
    /// @param owner_      Initial owner (can authorize upgrades).
    function initialize(address usdcAddress, address owner_) public initializer {
        require(usdcAddress != address(0), "usdc=0");
        __Ownable_init(owner_);

        // The fhEVM coprocessor config is stored at an ERC-7201 namespaced slot,
        // i.e. in *proxy* storage, so it must be set here (proxy context) rather
        // than in a constructor on the implementation.
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());

        usdc = IERC20(usdcAddress);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // -------------------------------------------------------------------------
    // Shield: public USDC -> encrypted cUSDC
    // -------------------------------------------------------------------------

    /// @notice Deposit `amount` public USDC and mint the same amount of cUSDC.
    /// @dev The deposit amount is public (it is a plain ERC20 transfer); only the
    ///      resulting balance is encrypted. Caller must `approve` USDC first.
    function shield(uint256 amount) external {
        require(amount > 0 && amount <= type(uint64).max, "bad amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        euint64 enc = FHE.asEuint64(uint64(amount));
        _balances[msg.sender] = FHE.add(_balances[msg.sender], enc);
        _totalSupply = FHE.add(_totalSupply, enc);

        FHE.allowThis(_balances[msg.sender]);
        FHE.allow(_balances[msg.sender], msg.sender);
        FHE.allowThis(_totalSupply);

        emit Shielded(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Transfers (fully encrypted)
    // -------------------------------------------------------------------------

    /// @notice Private P2P transfer. Amount is encrypted end-to-end.
    function transfer(address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _transfer(msg.sender, to, amount);
    }

    /// @notice Approved transfer pulling from `from`'s encrypted allowance.
    function transferFrom(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        euint64 allowed = _allowances[from][msg.sender];
        // Spend only if BOTH the allowance and the balance cover the amount.
        ebool canSpend = FHE.and(FHE.ge(allowed, amount), FHE.ge(_balances[from], amount));
        euint64 toSend = FHE.select(canSpend, amount, FHE.asEuint64(0));

        _allowances[from][msg.sender] = FHE.sub(allowed, toSend);
        _moveBalance(from, to, toSend);

        FHE.allowThis(_allowances[from][msg.sender]);
        FHE.allow(_allowances[from][msg.sender], from);
        FHE.allow(_allowances[from][msg.sender], msg.sender);

        emit Transfer(from, to);
    }

    /// @dev Internal transfer with silent (no-leak) insufficient-balance handling.
    function _transfer(address from, address to, euint64 amount) internal {
        ebool enough = FHE.ge(_balances[from], amount);
        euint64 toSend = FHE.select(enough, amount, FHE.asEuint64(0));
        _moveBalance(from, to, toSend);
        emit Transfer(from, to);
    }

    /// @dev Moves an already-vetted encrypted amount and re-grants ACL on both balances.
    function _moveBalance(address from, address to, euint64 toSend) internal {
        _balances[from] = FHE.sub(_balances[from], toSend);
        _balances[to] = FHE.add(_balances[to], toSend);

        FHE.allowThis(_balances[from]);
        FHE.allow(_balances[from], from);
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[to], to);
    }

    // -------------------------------------------------------------------------
    // Allowances (encrypted)
    // -------------------------------------------------------------------------

    /// @notice Set an encrypted allowance for `spender`.
    function approve(address spender, externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _allowances[msg.sender][spender] = amount;

        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        FHE.allow(amount, spender);

        emit Approval(msg.sender, spender);
    }

    // -------------------------------------------------------------------------
    // Unshield: encrypted cUSDC -> public USDC (two-step, async decryption)
    // -------------------------------------------------------------------------
    //
    // Releasing real USDC requires the burn amount in *plaintext*, which on the
    // Zama Protocol means an asynchronous public decryption. So unshield is two
    // steps:
    //   1) requestUnshield: vet & burn the encrypted amount, mark the burned
    //      ciphertext as publicly decryptable.
    //   2) finalizeUnshield: anyone submits the KMS-signed cleartext; the
    //      contract verifies it with FHE.checkSignatures and releases that exact
    //      amount of public USDC. The withdrawn amount becomes public here, which
    //      is unavoidable — it is a plain ERC20 transfer out.

    /// @notice Step 1: burn (up to) `encryptedAmount` of cUSDC from the caller.
    /// @return requestId Identifier to pass to {finalizeUnshield}.
    function requestUnshield(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (uint256 requestId) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        ebool enough = FHE.ge(_balances[msg.sender], amount);
        euint64 toBurn = FHE.select(enough, amount, FHE.asEuint64(0));

        _balances[msg.sender] = FHE.sub(_balances[msg.sender], toBurn);
        _totalSupply = FHE.sub(_totalSupply, toBurn);

        FHE.allowThis(_balances[msg.sender]);
        FHE.allow(_balances[msg.sender], msg.sender);
        FHE.allowThis(_totalSupply);

        // Publish the burned amount for public decryption so finalize can release
        // exactly the right number of USDC.
        FHE.makePubliclyDecryptable(toBurn);

        requestId = ++unshieldNonce;
        pendingUnshields[requestId] = PendingUnshield({
            user: msg.sender,
            amountHandle: FHE.toBytes32(toBurn),
            finalized: false
        });

        emit UnshieldRequested(msg.sender, requestId);
    }

    /// @notice Step 2: release public USDC for a finalized burn.
    /// @param cleartexts      ABI-encoded decrypted value(s) from the relayer.
    /// @param decryptionProof KMS signatures proving `cleartexts` decrypt the handle.
    function finalizeUnshield(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        PendingUnshield storage p = pendingUnshields[requestId];
        require(p.user != address(0), "no request");
        require(!p.finalized, "finalized");

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = p.amountHandle;
        // Reverts unless the KMS signatures verify against this handle/cleartext.
        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        uint64 amount = abi.decode(cleartexts, (uint64));
        p.finalized = true;

        if (amount > 0) {
            usdc.safeTransfer(p.user, amount);
        }
        emit Unshielded(p.user, requestId);
    }

    // -------------------------------------------------------------------------
    // Encrypted views (caller needs ACL permission to actually decrypt)
    // -------------------------------------------------------------------------

    /// @notice Returns the caller-readable handle to `account`'s encrypted balance.
    function balanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    /// @notice Returns the encrypted allowance handle.
    function allowance(address owner_, address spender) external view returns (euint64) {
        return _allowances[owner_][spender];
    }

    /// @notice Returns the encrypted total supply handle.
    function encryptedTotalSupply() external view returns (euint64) {
        return _totalSupply;
    }
}
