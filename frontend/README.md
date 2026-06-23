# Shade Frontend

Next.js 14 mobile-first app for the Shade confidential payments protocol. Connects to five UUPS-proxy contracts on Sepolia via wagmi v2 + viem, and uses the Zama fhEVM relayer SDK for client-side encryption.

---

## Stack

| Layer | Library |
|---|---|
| Framework | Next.js 14 (App Router) |
| Wallet / chain | wagmi v2 + viem |
| FHE encryption | `@zama-fhe/relayer-sdk` (browser entry: `/web`) |
| Styling | Tailwind CSS v3 |
| Animation | Framer Motion |
| Notifications | react-hot-toast |
| Icons | lucide-react |

---

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in your RPC URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect MetaMask to Sepolia.

### Environment variables

```env
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_SEPOLIA_RPC_URL=        # Alchemy or Infura recommended for event log range support
NEXT_PUBLIC_CONFIDENTIAL_USDC=0xc3b6aD97263f65B04A9BcBd636296a92f24F974f
NEXT_PUBLIC_PAYROLL_VAULT=0x3Fe44FA9791789f286e2103a7B969104950D09D7
NEXT_PUBLIC_PRIVATE_ESCROW=0x6BC6b1f60C3450d11d912Cacf6FCdFcaBd57d0d9
NEXT_PUBLIC_BALANCE_PROVER=0x41BAd1E943ED2d6339143E6A1b8738283151b4e1
NEXT_PUBLIC_STEALTH_SEND=0x2a87Fb8E1d54126ab96E02A1Ab408bDecff5634e
NEXT_PUBLIC_RELAYER_URL=https://relayer.testnet.zama.org/v2
```

> **RPC note:** Public RPCs (publicnode, drpc) cap `eth_getLogs` block ranges at ~2k blocks. Use a dedicated Alchemy or Infura endpoint for the activity feed to work correctly across the full deployment history.

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing / connect wallet |
| `/dashboard` | Balance card, quick actions, real-time activity feed |
| `/shield` | Shield USDC → cUSDC, request and finalize unshield |
| `/send` | 3-step flow: recipient → amount → confirm (standard or stealth) |
| `/payroll` | Employer: create templates, run payroll in steps (create → fund → execute). Employee: claim accumulated payroll. |
| `/escrow` | Create, fund, release, dispute, and resolve escrows |
| `/prove` | Generate and publish a verifiable balance proof on-chain |
| `/prove/[address]` | Public read-only view of any address's published proof |
| `/profile` | Wallet info, network, disconnect |

---

## Key flows

### Shield / Unshield
Shielding wraps plain USDC into encrypted cUSDC in one transaction (approve + shield).

Unshield is two steps due to async KMS decryption:
1. `requestUnshield` — burns encrypted cUSDC, submits decryption request to the KMS
2. `finalizeUnshield` — after the KMS signs (30–120 s), submits the plaintext + proof on-chain to release USDC

Pending requests persist in localStorage and are shown in the Unshield tab.

### Send
Standard send encrypts the amount client-side and calls `ConfidentialUSDC.transfer`. Stealth send additionally encrypts the recipient address as an `eaddress` and routes through `StealthSend`, so only the intended recipient can claim.

Balance must be revealed (via user-decrypt permit) before sending, to enforce a client-side max check.

### Payroll (employer)
1. **Create template** — define the employee roster (addresses). Reusable across multiple pay cycles.
2. **Create run** — encrypt each employee's salary individually, submit to chain. Salaries are cached in localStorage so the vault can be funded in a later session.
3. **Fund run** — approve the vault for the total salary amount, then call `fundRun`. The vault pulls cUSDC via encrypted `transferFrom`.
4. **Execute run** — credits each employee's encrypted pending claim on-chain. Employees can claim at any time after this.

Each step is separate and can be done in a different session.

### Balance proof
1. Authorize the prover contract to read your balance (`authorizeBalanceRead`)
2. Encrypt the threshold and call `proveAbove` — waits for on-chain confirmation
3. Read the stored handle (`pendingHandle`), submit to the Zama KMS for public decryption (30–60 s, retried up to 12×)
4. Call `publishProof` with the KMS-signed result — stores a public `bool` on-chain
5. Result card shows "Balance ≥ X cUSDC ✓" or "Balance < X cUSDC ✗". Anyone can verify at `/prove/[address]`.

---

## Architecture notes

- **No global state library.** All state is local React state + wagmi hooks + custom hooks. The send flow passes data via URL search params between steps.
- **FHE SDK initialised once.** `useFhevm` wraps a singleton `FhevmInstance` in React context, lazily created on wallet connect. WASM loads via dynamic import.
- **Transaction confirmation.** `useTrackedWrite.writeContractAsync` returns the tx hash and records it in the pending tx list. For flows that read contract state immediately after writing (prove, payroll), the page explicitly calls `client.waitForTransactionReceipt({ hash })` before proceeding.
- **Activity feed.** `useActivity` fetches all relevant events from the deploy block (`11120683`) using a single `getLogs` call, caches results in localStorage, and polls for new blocks every 12 s. Payroll events are cross-referenced in two passes: `TemplateCreated` → employer's template IDs → `RunCreated` → employer's run IDs → `RunFunded` / `RunExecuted`.
- **Contracts are UUPS proxies.** On Etherscan, use "Read as Proxy" / "Write as Proxy" to interact with the correct ABI.

---

## Build

```bash
npm run build
npm start
```
