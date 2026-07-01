"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

const SECTIONS = [
  { id: "introduction",   label: "Introduction" },
  { id: "getting-started", label: "Getting Started" },
  { id: "contracts",      label: "Contracts" },
  { id: "how-fhe-works",  label: "How FHE Works" },
  { id: "faq",            label: "FAQ" },
];

const SEPOLIA_ADDRESSES: Record<string, string> = {
  ConfidentialUSDC: "0xc3b6aD97263f65B04A9BcBd636296a92f24F974f",
  PayrollVault:     "0x3Fe44FA9791789f286e2103a7B969104950D09D7",
  PrivateEscrow:    "0x6BC6b1f60C3450d11d912Cacf6FCdFcaBd57d0d9",
  BalanceProver:    "0x41BAd1E943ED2d6339143E6A1b8738283151b4e1",
  StealthSend:      "0x2a87Fb8E1d54126ab96E02A1Ab408bDecff5634e",
};

function Code({ children }: { children: string }) {
  return (
    <code className="inline-block px-1.5 py-0.5 rounded-md bg-white/[0.07] font-mono text-[0.82em] text-amber-300/90">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5 text-xs font-mono text-white/70 leading-relaxed">
      {children}
    </pre>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-semibold text-[#FAFAFA] mt-14 mb-5 scroll-mt-24 first:mt-0">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-[#FAFAFA] mt-8 mb-3">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-white/55 leading-relaxed mb-4">{children}</p>;
}

function AddressRow({ name, addr }: { name: string; addr: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-3 border-b border-white/[0.05] last:border-0">
      <span className="text-sm font-medium text-[#FAFAFA]">{name}</span>
      <a
        href={`https://sepolia.etherscan.io/address/${addr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-amber-400/80 hover:text-amber-400 transition-colors break-all"
      >
        {addr}
      </a>
    </div>
  );
}

export default function DocsPage() {
  const [activeId, setActiveId] = useState("introduction");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-[#080808] text-[#FAFAFA]">
      <div className="grain-overlay" />

      {/* Top nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-75 transition-opacity">
            <ShadeLogoMark size={24} showBg />
            <span className="text-sm font-semibold">Shade</span>
            <ChevronRight className="h-3.5 w-3.5 text-white/25" />
            <span className="text-sm text-white/40">Docs</span>
          </Link>
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors"
          >
            Launch App <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto flex pt-14">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-4 border-r border-white/[0.05]">
          <p className="text-2xs font-mono uppercase tracking-widest text-white/25 mb-4 px-2">Contents</p>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeId === id
                    ? "bg-amber-500/10 text-amber-400 font-medium"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Mobile section picker */}
        <div className="lg:hidden fixed bottom-6 right-4 z-30">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1a1a1a] border border-white/10 text-sm text-white/70 shadow-xl"
          >
            {SECTIONS.find((s) => s.id === activeId)?.label ?? "Contents"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {sidebarOpen && (
            <div className="absolute bottom-12 right-0 w-48 rounded-2xl bg-[#111] border border-white/10 py-2 shadow-2xl">
              {SECTIONS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => setSidebarOpen(false)}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    activeId === id ? "text-amber-400" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 lg:px-12 py-10 pb-32 max-w-3xl">

          {/* Introduction */}
          <H2 id="introduction">Introduction</H2>
          <P>
            Shade is a financial privacy layer built on top of Zama&apos;s fhEVM. It lets you send, receive,
            and lock USDC in escrow while keeping every amount permanently encrypted on-chain — visible to
            no one except the parties you authorise, not even validators.
          </P>
          <H3>The trust model</H3>
          <P>
            Shade doesn&apos;t rely on trusted parties, off-chain relayers, or separate privacy infrastructure.
            Privacy is enforced by Fully Homomorphic Encryption running natively inside the EVM. The math
            is the trust — there is no operator key that could be compromised, and no bridge custody.
          </P>
          <H3>The privacy model</H3>
          <P>
            Shade encrypts <em>amounts only</em>. Counterparty addresses remain fully public, which means
            on-chain auditability is preserved — you can verify that a payment was made to a given address
            without knowing how much. This is the right trade-off for payments and payroll: the <em>who</em>{" "}
            is public; the <em>how much</em> is private.
          </P>
          <P>
            All balances are stored as <Code>euint64</Code> — an encrypted 64-bit unsigned integer — in
            the <Code>ConfidentialUSDC</Code> contract. Every transfer, approval, and escrow operation
            operates on ciphertexts end-to-end. No plaintext amount ever appears in any transaction, log,
            or state variable.
          </P>

          {/* Getting Started */}
          <H2 id="getting-started">Getting Started</H2>
          <H3>1. Shield USDC</H3>
          <P>
            Shielding converts plain ERC-20 USDC into encrypted cUSDC at a 1:1 ratio. Go to the{" "}
            <strong>Shield</strong> tab, enter an amount, and approve two transactions: a standard ERC-20
            approval on USDC, then the shield call which moves your USDC into the contract and mints an
            encrypted <Code>euint64</Code> balance for your address.
          </P>
          <P>
            Your cUSDC balance is never visible in plaintext on-chain. To view it in the app, you
            generate a short-lived decryption permit — a signed EIP-712 message — which the Zama gateway
            uses to decrypt and return only your balance, only to you.
          </P>
          <H3>2. Send privately</H3>
          <P>
            Go to <strong>Send</strong>, enter a recipient address and an amount. Two modes are available:
          </P>
          <P>
            <strong>Standard send</strong> — calls <Code>transfer(to, handle, proof)</Code> on ConfidentialUSDC.
            The recipient address is visible on-chain; the amount is not.
          </P>
          <P>
            <strong>Stealth send</strong> — additionally encrypts the recipient address so neither the
            amount nor the destination is readable by observers. The recipient scans for incoming stealth
            payments using the <Code>StealthSend</Code> contract.
          </P>
          <H3>3. Use escrow</H3>
          <P>
            Go to <strong>Escrow</strong> and create a new escrow. Set a recipient, an optional arbiter,
            and a timeout. Then fund it. The flow from there:
          </P>
          <Pre>{`Depositor creates → funds escrow       (CREATED → FUNDED)
Recipient delivers → markCompleted     (FUNDED → COMPLETED)
Depositor reviews → release            (COMPLETED → RELEASED)

If depositor stalls past 10 minutes:
  With arbiter  → recipient disputes   (DISPUTED, arbiter resolves)
  Without arbiter → recipient claims   (auto RELEASED via claimAfterWindow)

No delivery → depositor waits for timeout → reclaims (REFUNDED)`}</Pre>
          <H3>4. Unshield USDC</H3>
          <P>
            Go to the <strong>Unshield</strong> tab under Shield. Enter the amount, submit the request,
            then wait for the Zama gateway to produce a public decryption proof. Once the proof is
            available, finalise the unshield — your USDC is returned to your wallet as plain ERC-20.
          </P>

          {/* Contracts */}
          <H2 id="contracts">Contracts</H2>
          <P>
            All contracts are deployed on Sepolia testnet. Each is a UUPS upgradeable proxy owned by the
            deployer. Source code is available on GitHub.
          </P>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 mb-8">
            {Object.entries(SEPOLIA_ADDRESSES).map(([name, addr]) => (
              <AddressRow key={name} name={name} addr={addr} />
            ))}
          </div>

          <H3>ConfidentialUSDC</H3>
          <P>
            A UUPS proxy wrapping an encrypted ERC-20. Balances are stored as <Code>euint64</Code>.
            Implements <Code>shield</Code> (plain USDC in, encrypted balance), <Code>requestUnshield</Code>{" "}
            + <Code>finalizeUnshield</Code> (encrypted balance out, plain USDC returned),{" "}
            <Code>transfer</Code>, <Code>approve</Code>, and <Code>transferFrom</Code> — all operating on
            encrypted values. <Code>balanceOf</Code> returns an encrypted handle that only the owner can
            decrypt.
          </P>

          <H3>PrivateEscrow</H3>
          <P>
            Holds cUSDC between a depositor and recipient. The locked amount is an <Code>euint64</Code>{" "}
            throughout its entire lifecycle — even the arbiter never sees the plaintext. Key functions:
          </P>
          <Pre>{`createEscrow(recipient, arbiter, timeoutSeconds)
fund(id, encryptedAmount, inputProof)
markCompleted(id, proofURI)      // recipient signals delivery
release(id)                      // depositor releases to recipient
disputeWithProof(id, proofURI)   // recipient opens dispute after window
claimAfterWindow(id)             // recipient auto-claims (no arbiter path)
timeout(id)                      // depositor reclaims if no delivery
resolveToRecipient(id)           // arbiter: pay recipient
resolveToDepositor(id)           // arbiter: refund depositor`}</Pre>

          <H3>PayrollVault</H3>
          <P>
            Employer creates a template (list of employee addresses) and a run (encrypted salary per
            employee). Once funded and executed, each employee can call <Code>claim()</Code> to pull
            their encrypted salary into their cUSDC balance. No employee can see another&apos;s salary.
          </P>

          <H3>BalanceProver</H3>
          <P>
            Generates an on-chain proof that a given cUSDC balance exceeds a threshold — without
            revealing either the balance or the threshold. The result is a public boolean stored
            on-chain that anyone can read at <Code>/prove/[address]</Code>.
          </P>

          <H3>StealthSend</H3>
          <P>
            Extends private sends by also encrypting the recipient address. The sender encrypts both
            amount and recipient into a single proof. The intended recipient scans for incoming payments
            and claims them.
          </P>

          {/* How FHE Works */}
          <H2 id="how-fhe-works">How FHE Works</H2>
          <H3>What is a euint64?</H3>
          <P>
            <Code>euint64</Code> is a Solidity type added by Zama&apos;s fhEVM library. Under the hood it
            is a 32-byte handle — a reference to a ciphertext stored by the FHE coprocessor. When you
            write <Code>balances[alice] = FHE.add(balances[alice], amount)</Code> in Solidity, you are
            not computing anything in the EVM. You are emitting a request. The Zama coprocessor picks up
            that request, performs the actual FHE addition on the ciphertexts, and posts the resulting
            handle back.
          </P>
          <H3>Why amounts stay encrypted</H3>
          <P>
            FHE (Fully Homomorphic Encryption) allows arbitrary computation on ciphertexts without ever
            decrypting them. That means the EVM can add, subtract, and compare encrypted balances without
            any plaintext ever appearing in the execution trace, logs, or state. Even validators see only
            handles — opaque 32-byte identifiers.
          </P>
          <H3>The ACL — who can read what</H3>
          <P>
            Each ciphertext handle has an Access Control List managed by Zama&apos;s ACL contract. Only
            addresses explicitly permitted — via <Code>FHE.allow(handle, address)</Code> — can request
            decryption of that value. When Shade calls{" "}
            <Code>FHE.allow(amount, recipient)</Code> during a transfer, it grants only the recipient the
            right to decrypt the incoming amount.
          </P>
          <H3>What the Zama gateway does</H3>
          <P>
            When a user wants to see their balance, the app requests a decryption through the Zama
            gateway — a threshold network of KMS nodes. The user signs an EIP-712 permit authorising the
            gateway to decrypt their specific handle. The KMS nodes co-sign the decryption result and
            submit it on-chain, where the <Code>KMSVerifier</Code> contract checks the signature before
            releasing the plaintext. No single node can decrypt on its own — the threshold requires
            consensus.
          </P>
          <H3>Input proofs</H3>
          <P>
            When you encrypt an amount client-side (e.g. before calling <Code>fund</Code> on the escrow),
            the SDK produces both a ciphertext handle and a zero-knowledge input proof. The proof
            demonstrates that you correctly encrypted a valid 64-bit value for the target contract, without
            revealing the value. The contract verifies this proof on-chain before accepting the handle.
          </P>

          {/* FAQ */}
          <H2 id="faq">FAQ</H2>
          <H3>Can anyone see my balance?</H3>
          <P>
            No. Your cUSDC balance is an encrypted handle on-chain. The only way to obtain the plaintext
            is to hold an address that has been ACL-permitted for that handle <em>and</em> request
            decryption through the Zama gateway. By default only your own address is permitted.
          </P>
          <H3>Does the arbiter in an escrow see the locked amount?</H3>
          <P>
            No. The arbiter address is ACL-permitted to decrypt the handle (so it could request
            decryption via the gateway if needed), but the arbiter never sees the amount during normal
            operation. The contract emits the arbiter address in an event so the arbiter knows which
            escrows they have been assigned to.
          </P>
          <H3>Is Shade audited?</H3>
          <P>
            Shade is on Sepolia testnet and has not yet been audited. Do not use it for mainnet funds.
            Zama&apos;s underlying fhEVM library is undergoing continuous review by Zama&apos;s security team.
          </P>
          <H3>What happens if I lose my wallet?</H3>
          <P>
            cUSDC balances are tied to your wallet address just like any ERC-20. If you lose access to
            your private key, the funds are unrecoverable. There is no social recovery mechanism at this time.
          </P>
          <H3>Can I use Shade on mainnet?</H3>
          <P>
            Not yet. Shade is deployed on Sepolia testnet only. A mainnet deployment will follow once
            Zama&apos;s fhEVM is stable on Ethereum mainnet and the contracts have been audited.
          </P>
          <H3>Where is the source code?</H3>
          <P>
            The contracts and frontend are open source on{" "}
            <a href="https://github.com/psalmuel01/shade" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">
              GitHub
            </a>.
          </P>
        </main>
      </div>
    </div>
  );
}
