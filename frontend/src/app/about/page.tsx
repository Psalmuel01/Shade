import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, Shield, Users, Briefcase, Globe } from "lucide-react";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-[#080808] text-[#FAFAFA]">
      <div className="grain-overlay" />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-75 transition-opacity">
            <ShadeLogoMark size={24} showBg />
            <span className="text-sm font-semibold">Shade</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm text-white/50 hover:text-white transition-colors">Docs</Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors"
            >
              Launch App <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-14">

        {/* Hero */}
        <section className="pt-24 pb-20 px-6">
          <div className="max-w-3xl mx-auto text-center flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.05] text-xs text-amber-400/70 font-mono mx-auto">
              Private payments for public chains
            </div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
              Finance has always needed<br />
              <span className="text-amber-400">selective privacy.</span>
            </h1>
            <p className="text-base text-white/50 leading-relaxed max-w-xl mx-auto">
              You wouldn&apos;t hand your bank statement to a stranger on the street.
              Yet every payment on a public blockchain is permanently, irrevocably visible to anyone
              who cares to look. Shade fixes that — without hiding who you paid, only how much.
            </p>
          </div>
        </section>

        {/* The problem — two columns */}
        <section className="py-16 px-6 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-mono text-amber-400/50 uppercase tracking-widest text-center mb-10">The problem</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Transparency trap */}
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 flex flex-col gap-5">
                <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-red-400" strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold mb-3">The transparency trap</h2>
                  <p className="text-sm text-white/45 leading-relaxed">
                    Public blockchains expose every transaction to everyone, forever. Your salary, your
                    vendor payments, your investment positions — all permanently readable by competitors,
                    data harvesters, and anyone with a block explorer. This level of financial transparency
                    has no equivalent in traditional finance, and most organisations would never accept it
                    if they fully understood what they were publishing.
                  </p>
                </div>
              </div>

              {/* Opacity trap */}
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 flex flex-col gap-5">
                <div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                  <EyeOff className="h-5 w-5 text-orange-400" strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold mb-3">The opacity trap</h2>
                  <p className="text-sm text-white/45 leading-relaxed">
                    Existing privacy solutions — mixers, shielded pools, ZK-based privacy coins — solve
                    transparency by hiding everything. You lose the auditability that makes blockchains
                    useful in the first place. Counterparties can&apos;t verify who they paid. Compliance
                    becomes impossible. Smart contract composability breaks. You swap one problem for another.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Shade approach */}
        <section className="py-16 px-6 border-t border-white/[0.06]">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-mono text-amber-400/50 uppercase tracking-widest text-center mb-10">The approach</p>
            <div className="flex flex-col gap-6 text-center items-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-amber-400" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold leading-tight">
                Encrypt the amount.<br />Keep everything else public.
              </h2>
              <p className="text-base text-white/50 leading-relaxed max-w-xl">
                Shade takes a surgical approach: addresses stay fully visible on-chain, but amounts are
                encrypted using Fully Homomorphic Encryption. This means you can verify that a payment
                was made from wallet A to wallet B — but you cannot read how much was sent. Counterparties
                remain auditable. Amounts stay confidential.
              </p>
              <p className="text-base text-white/50 leading-relaxed max-w-xl">
                The result: a system where payroll can be distributed without exposing individual salaries,
                escrow can be settled without revealing the locked sum to third parties, and payments can
                be made without your transaction history becoming a public business intelligence dataset.
              </p>
            </div>
          </div>
        </section>

        {/* Trust model */}
        <section className="py-16 px-6 border-t border-white/[0.06]">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-mono text-amber-400/50 uppercase tracking-widest text-center mb-10">Trust model</p>
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-10 flex flex-col gap-6">
              <div className="flex flex-col gap-3 text-center items-center">
                <Shield className="h-8 w-8 text-amber-400" strokeWidth={1.5} />
                <h2 className="text-xl font-semibold">The math is the trust.</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
                {[
                  {
                    title: "No off-chain operators",
                    desc: "FHE computation runs natively inside the EVM via Zama's coprocessor. There is no separate privacy infrastructure for you to trust.",
                  },
                  {
                    title: "No operator keys",
                    desc: "There is no private key that could be stolen to decrypt your balances. The encryption is enforced by mathematics, not by a trusted party.",
                  },
                  {
                    title: "No bridge custody",
                    desc: "Your USDC stays in smart contracts on Ethereum. There is no bridge, no wrapped token, and no custodian holding your funds.",
                  },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex flex-col gap-2">
                    <div className="h-px bg-white/[0.06] sm:hidden mb-2" />
                    <p className="text-sm font-semibold text-[#FAFAFA]">{title}</p>
                    <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/40 text-center leading-relaxed border-t border-white/[0.06] pt-6">
                Shade inherits its security guarantees entirely from Zama&apos;s fhEVM — a production
                implementation of Fully Homomorphic Encryption running inside the Ethereum Virtual Machine.
                Encryption is enforced at the protocol level. No configuration, no trust assumptions, no
                operator.
              </p>
            </div>
          </div>
        </section>

        {/* Who it is for */}
        <section className="py-16 px-6 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-mono text-amber-400/50 uppercase tracking-widest text-center mb-10">Who it&apos;s for</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: Briefcase,
                  color: "text-amber-400 bg-amber-500/10",
                  title: "Web3 teams",
                  desc: "Pay contributors and vendors without publishing your treasury's payment history to competitors.",
                },
                {
                  icon: Users,
                  color: "text-blue-400 bg-blue-500/10",
                  title: "DAOs",
                  desc: "Run payroll with per-person encrypted salaries. No member can see another's compensation on-chain.",
                },
                {
                  icon: Globe,
                  color: "text-purple-400 bg-purple-500/10",
                  title: "Freelancers",
                  desc: "Invoice and get paid in USDC without your entire client list and rate card becoming public record.",
                },
                {
                  icon: Shield,
                  color: "text-green-400 bg-green-500/10",
                  title: "Protocols",
                  desc: "Need encrypted escrow in your settlement layer? Integrate PrivateEscrow directly into your contracts.",
                },
              ].map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 flex flex-col gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1.5">{title}</p>
                    <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Built on Zama */}
        <section className="py-16 px-6 border-t border-white/[0.06]">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-mono text-amber-400/50 uppercase tracking-widest text-center mb-10">Built on</p>
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-10 flex flex-col items-center gap-6 text-center">
              {/* Zama + Shade logos */}
              <div className="flex items-center gap-5">
                <ShadeLogoMark size={44} showBg />
                <span className="text-white/20 text-xl">×</span>
                <div className="w-11 h-11 rounded-2xl bg-[#1a1a1a] flex items-center justify-center border border-white/10">
                  <span className="text-xs font-bold tracking-tight text-white">ZAMA</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Shade is powered by Zama&apos;s fhEVM</h2>
                <p className="text-sm text-white/45 leading-relaxed max-w-md">
                  Zama is the company that built the Fully Homomorphic Encryption toolchain that makes
                  Shade possible. Their fhEVM library extends Solidity with native encrypted types —
                  <code className="text-amber-400/80 text-xs mx-1 px-1 py-0.5 rounded bg-white/[0.06]">euint64</code>,
                  <code className="text-amber-400/80 text-xs mx-1 px-1 py-0.5 rounded bg-white/[0.06]">ebool</code>, and
                  more — and their coprocessor handles FHE computations off the EVM hot path.
                  Without Zama, none of this is possible.
                </p>
                <a
                  href="https://www.zama.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors mx-auto"
                >
                  Learn about Zama <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-20 px-6 border-t border-white/[0.06]">
          <div className="max-w-xl mx-auto text-center flex flex-col gap-6">
            <h2 className="text-2xl font-semibold">Ready to pay privately?</h2>
            <p className="text-sm text-white/45">Connect your wallet and shield your first USDC.</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors mx-auto"
            >
              Launch App <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10 px-6 border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShadeLogoMark size={22} showBg />
              <span className="text-sm font-semibold">Shade</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/35">
              <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
              <a href="https://docs.zama.ai/fhevm" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">Zama fhEVM</a>
              <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
