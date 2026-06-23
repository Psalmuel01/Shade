# Shade — Private Payments on Zama fhEVM

Shade is a confidential payments protocol built on [Zama's fhEVM](https://docs.zama.ai/fhevm). Every balance and transaction amount is an encrypted `euint64` ciphertext stored on-chain. Senders, receivers, timestamps and finality remain public — only the numbers are hidden.

**Trust model:** FHE runs natively inside the EVM. There is no off-chain coprocessor in the trust model — the math is the trust.

---

## Contracts

Five UUPS-upgradeable contracts, all deployed on Sepolia.

| Contract | Address | What it does |
|---|---|---|
| `ConfidentialUSDC` | `0xc3b6aD97263f65B04A9BcBd636296a92f24F974f` | Encrypted balances, allowances, and supply. Wraps Circle's Sepolia USDC. Two-step unshield via async KMS decryption. |
| `PayrollVault` | `0x3Fe44FA9791789f286e2103a7B969104950D09D7` | Employer creates reusable templates (employee rosters), runs payroll cycles with encrypted per-employee salaries. No employee can see another's salary. |
| `PrivateEscrow` | `0x6BC6b1f60C3450d11d912Cacf6FCdFcaBd57d0d9` | Six-state escrow where the locked amount stays encrypted throughout — even the arbiter never learns it. |
| `BalanceProver` | `0x41BAd1E943ED2d6339143E6A1b8738283151b4e1` | Publishes a verifiable on-chain boolean: "balance ≥ threshold" — without revealing the balance or the threshold. Powered by async public decryption. |
| `StealthSend` | `0x2a87Fb8E1d54126ab96E02A1Ab408bDecff5634e` | Recipient address is encrypted as `eaddress`. Only the intended recipient can claim by proving address equality under FHE. |

Underlying USDC (Sepolia): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

### Test suite

```
npx hardhat test

  BalanceProver ......... 4 passing
  ConfidentialUSDC ...... 8 passing
  PayrollVault .......... 6 passing
  PrivateEscrow ......... 6 passing
  StealthSend ........... 4 passing
  28 passing
```

---

## Architecture

### How contracts compose

Feature contracts never hold cUSDC directly. They move it by passing internal `euint64` handles into `ConfidentialUSDC.transfer` / `transferFrom`, first granting `FHE.allowTransient(handle, address(cUSDC))`. `BalanceProver` additionally calls `cUSDC.authorizeBalanceRead(prover)` so the prover contract has ACL access to compare a user's balance.

### Two-step async operations

Two flows cannot complete in a single transaction because they need a plaintext value that must be produced by the Zama KMS off-chain:

**Unshield** (`ConfidentialUSDC`)
1. `requestUnshield(handle, proof)` — validates, burns the encrypted amount, marks it publicly decryptable
2. `finalizeUnshield(requestId, abiEncodedClearValues, decryptionProof)` — anyone submits the KMS-signed plaintext; the contract verifies with `FHE.checkSignatures` and releases that many USDC

**Balance proof** (`BalanceProver`)
1. `proveAbove(handle, proof)` — stores the comparison result as an encrypted handle
2. Off-chain: `publicDecrypt([handle])` via the fhEVM SDK → KMS returns `abiEncodedClearValues` + `decryptionProof`
3. `publishProof(user, abiEncodedClearValues, decryptionProof)` — verifies and stores the bool result on-chain

### UUPS + fhEVM initialisation

The coprocessor config lives in proxy storage (ERC-7201 namespaced slot), so `FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig())` is called inside `initialize()`, not in a constructor.

### API version — fhEVM v0.11

| Legacy API (spec snippets) | This repo (v0.11) |
|---|---|
| `TFHE.*` | `FHE.*` |
| `einput` | `externalEuint64` / `externalEaddress` |
| `TFHE.asEuint64(einput, proof)` | `FHE.fromExternal(ext, proof)` |
| `TFHE.allow(x, address(this))` | `FHE.allowThis(x)` |
| `TFHE.gte(...)` | `FHE.ge(...)` |
| `GatewayContract` + callback | `FHE.makePubliclyDecryptable` → relayer → `FHE.checkSignatures` |

### Privacy model

| Public on-chain | Encrypted on-chain |
|---|---|
| Sender / receiver address (standard send) | Transaction amount (`euint64`) |
| That a transfer happened | All balances and allowances |
| Timestamp, tx hash | Total supply |
| Gas paid | Receiver address (stealth send, `eaddress`) |

Rules enforced in code: no synchronous decryption in state-changing functions; insufficient balance handled via `FHE.select` (silent, no revert, no leak); every ciphertext gets explicit ACL grants; events never carry amounts.

---

## Quick start

### Contracts

```bash
npm install
cp .env.example .env        # fill PRIVATE_KEY and SEPOLIA_RPC_URL
npx hardhat test            # run full suite against fhEVM mock
npx hardhat run scripts/deploy.ts --network sepolia
```

Deployment writes `deployments/sepolia.json` with all proxy addresses.

### Frontend

See [`frontend/README.md`](frontend/README.md) for setup.

---

## Repo structure

```
contracts/          Solidity source (5 contracts + MockUSDC)
test/               Hardhat tests (fhEVM mock)
scripts/            Deploy script
deployments/        JSON address files per network
frontend/           Next.js 14 app (see frontend/README.md)
```
