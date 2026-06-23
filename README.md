# Shade — Private Payments for Public Chains

> Only the amount is hidden.

Shade is a confidential payments protocol on Zama's fhEVM. Every transaction
amount is an encrypted `euint64` ciphertext living on-chain. Senders, receivers,
timestamps and finality stay public and auditable — only the number is hidden.

**Trust model:** Shade runs FHE natively inside the EVM. There is no off-chain
FHE coprocessor node in the trust model — the math is the trust.

---

## Status — all contracts done & tested (28 tests passing)

Built in the spec's order; each contract is fully tested in the fhEVM mock.

| Contract            | Status | What it does |
| ------------------- | ------ | ------------ |
| `ConfidentialUSDC`  | ✅ | Foundation. Encrypted balances/allowances/supply. shield / transfer / transferFrom / approve / two-step unshield, + internal-handle overloads for composability. |
| `PayrollVault`      | ✅ | One run pays many employees; no employee sees another's salary. |
| `PrivateEscrow`     | ✅ | Encrypted-amount escrow across 6 states; arbiter never learns the amount. |
| `BalanceProver`     | ✅ | Publishes a verifiable public bool "balance ≥ threshold" without revealing the balance (async public decrypt). |
| `StealthSend`       | ✅ | **Core differentiator.** Recipient encrypted as `eaddress`; claimed by FHE address-equality. |

```
$ npx hardhat test
  BalanceProver ......... 4 passing
  ConfidentialUSDC ...... 8 passing
  PayrollVault .......... 6 passing
  PrivateEscrow ......... 6 passing
  StealthSend ........... 4 passing
  28 passing
```

Architecture note: the feature contracts move cUSDC by passing **internal
`euint64` handles** into `ConfidentialUSDC.transfer/transferFrom`, granting
`FHE.allowTransient(handle, address(cUSDC))` first (spec Rule 5). `BalanceProver`
additionally relies on `cUSDC.authorizeBalanceRead(prover)` so it has ACL to
compare a user's balance.

Run the test suite:

```sh
npm install
npx hardhat test
```

Deploy (writes `deployments/<network>.json`):

```sh
cp .env.example .env   # fill in PRIVATE_KEY, SEPOLIA_RPC_URL
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## Stack note: this targets `@fhevm/solidity` v0.11 (the Zama Protocol)

The Shade spec's Solidity snippets use the **legacy** fhEVM API (`TFHE`,
`einput`, `GatewayContract`, `gateway.requestDecryption` + callback). The
current package the spec itself pins (v0.9+) has since become v0.11 with a
different API. This repo is built on the **real, installed** API. The key
translations:

| Spec (legacy)                         | This repo (v0.11)                              |
| ------------------------------------- | ---------------------------------------------- |
| `import "...TFHE.sol"` / `TFHE.*`     | `import {FHE,...} from "@fhevm/solidity/lib/FHE.sol"` / `FHE.*` |
| `einput`                              | `externalEuint64` / `externalEaddress`         |
| `TFHE.asEuint64(einput, proof)`       | `FHE.fromExternal(externalEuint64, proof)`     |
| `TFHE.allow(x, address(this))`        | `FHE.allowThis(x)`                             |
| `TFHE.allow(x, addr)`                 | `FHE.allow(x, addr)`                           |
| `TFHE.gte(...)`                       | `FHE.ge(...)`                                  |
| `TFHE.select(...)`                    | `FHE.select(...)`  (unchanged)                 |
| inherit `GatewayContract`             | set `FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig())` |
| `gateway.requestDecryption` + callback| `FHE.makePubliclyDecryptable` → relayer → `FHE.checkSignatures` |

### Two design points the spec glosses over

1. **UUPS + fhEVM config.** The coprocessor config is stored at an ERC-7201
   namespaced slot — i.e. in **proxy** storage. So it is set inside
   `initialize()` (proxy context), not via a constructor on the implementation.

2. **`unshield` cannot be a single call.** Releasing real USDC needs the burn
   amount in plaintext, which on the Zama Protocol is an *asynchronous public
   decryption*. So unshield is two steps:
   - `requestUnshield(...)` — vets & burns the encrypted amount, marks the
     burned ciphertext publicly decryptable.
   - `finalizeUnshield(requestId, cleartexts, decryptionProof)` — anyone submits
     the KMS-signed cleartext; the contract verifies it with `FHE.checkSignatures`
     and releases exactly that many USDC. (The withdrawn amount is necessarily
     public — it is a plain ERC20 transfer out.)

   The same async pattern drives `BalanceProver`. Both are fully tested in the
   Hardhat mock: `hre.fhevm.publicDecrypt([handle])` returns
   `{ abiEncodedClearValues, decryptionProof }` which feed straight into the
   contract's `checkSignatures` — so the request→publish roundtrip is exercised
   end-to-end in CI, not just on Sepolia.

---

## Privacy model

| Public on-chain                         | Encrypted on-chain                    |
| --------------------------------------- | ------------------------------------- |
| Sender / receiver (standard send)       | Transaction amount (`euint64`)        |
| Timestamp, tx hash, that a transfer happened | Sender & receiver balances       |
| Gas paid                                | Allowances, total supply              |
| —                                       | Receiver address (stealth send, `eaddress`) |

**Rules enforced in code:** no synchronous decryption in a state-changing
function; insufficient balance handled with `FHE.select` (silent, no revert, no
leak); every ciphertext gets explicit ACL grants; events never carry amounts.
