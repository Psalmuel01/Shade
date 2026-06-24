"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { motion } from "framer-motion";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { ArrowRight, ArrowUpDown, Briefcase, ShieldCheck, ScanLine, Shield, ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    num: "01",
    title: "Shield USDC",
    desc: "Wrap plain USDC into encrypted cUSDC in one click. Your balance lives on-chain as a ciphertext — no one can read it.",
    icon: ArrowUpDown,
  },
  {
    num: "02",
    title: "Transact Privately",
    desc: "Send payments, run payroll, lock escrow. Every amount stays encrypted through the entire transaction lifecycle.",
    icon: Lock,
  },
  {
    num: "03",
    title: "Prove Without Revealing",
    desc: "Generate a verifiable on-chain proof that your balance exceeds a threshold — without disclosing the balance or the threshold.",
    icon: ScanLine,
  },
];

const FEATURES = [
  {
    icon: ArrowUpDown,
    title: "Private Payments",
    desc: "Standard and stealth sends. The recipient is visible; the amount is permanently hidden from everyone including validators.",
    color: "text-amber-400 bg-amber-500/10",
  },
  {
    icon: Briefcase,
    title: "Confidential Payroll",
    desc: "Pay employees with encrypted per-person salaries. No colleague can see another's compensation on-chain.",
    color: "text-blue-400 bg-blue-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted Escrow",
    desc: "Funds are locked until release conditions are met. The amount stays encrypted even through dispute arbitration.",
    color: "text-purple-400 bg-purple-500/10",
  },
  {
    icon: ScanLine,
    title: "Balance Proof",
    desc: "Prove solvency on-chain without revealing your balance or the threshold. Share a public verification link with anyone.",
    color: "text-green-400 bg-green-500/10",
  },
];

export default function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const { connect, connectors } = useConnect();
  const justConnected = useRef(false);

  // Only redirect to dashboard when the user explicitly clicked Launch App
  useEffect(() => {
    if (isConnected && justConnected.current) {
      router.replace("/dashboard");
    }
  }, [isConnected, router]);

  function launch() {
    if (isConnected) {
      router.push("/dashboard");
      return;
    }
    justConnected.current = true;
    if (connectors[0]) connect({ connector: connectors[0] });
  }

  return (
    <div className="min-h-dvh bg-[#080808] text-[#FAFAFA] overflow-x-hidden">
      <div className="grain-overlay" />

      {/* Fixed nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShadeLogoMark size={28} showBg />
            <span className="text-base font-semibold">Shade</span>
          </div>
          <button
            onClick={launch}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
          >
            {isConnected ? "Go to App" : "Launch App"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-28 px-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center gap-8">
          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle, rgba(245,158,11,0.22) 0%, transparent 70%)",
                filter: "blur(48px)",
                transform: "scale(3)",
              }}
            />
            <ShadeLogoMark size={88} showBg />
          </motion.div>

          <motion.div
            className="flex flex-col gap-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1]">
              Encrypted by math,
              <br />
              <span className="text-amber-400">not by trust.</span>
            </h1>
            <p className="text-base md:text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
              Send, receive, and pay with USDC where only you see the amounts.
              Fully homomorphic encryption runs natively in the EVM — no off-chain operators, no custodians.
            </p>
          </motion.div>

          <motion.div
            className="flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28, ease: "easeOut" }}
          >
            <button
              onClick={launch}
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
            >
              {isConnected ? "Go to App" : "Launch App"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="https://docs.zama.ai/fhevm"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 font-medium text-sm transition-colors"
            >
              Read Docs
              <ExternalLink className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.div
            className="flex items-center gap-2 text-xs text-white/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
          >
            <span>Powered by</span>
            <span className="text-white/40 font-medium">Zama fhEVM v0.11</span>
            <span>·</span>
            <span>Sepolia testnet</span>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-amber-400/60 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-2xl md:text-3xl font-semibold">Three steps to private finance</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {STEPS.map(({ num, title, desc, icon: Icon }, i) => (
              <motion.div
                key={num}
                className="glass-card p-7 flex flex-col gap-5"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <div className="flex items-start justify-between">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-amber-400" strokeWidth={1.8} />
                  </div>
                  <span className="font-mono text-3xl font-bold text-white/[0.07]">{num}</span>
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-amber-400/60 uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-2xl md:text-3xl font-semibold">Everything encrypted, end to end</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div
                key={title}
                className="glass-card p-6 flex gap-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", color)}>
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust model */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            className="glass-card p-10 md:p-14 flex flex-col gap-6 items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Shield className="h-7 w-7 text-amber-400" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl md:text-3xl font-semibold">The math is the trust.</h2>
              <p className="text-white/45 leading-relaxed max-w-lg">
                FHE runs natively inside the EVM via Zama&apos;s coprocessor. There are no off-chain relayers in the
                security model, no bridge custody, and no operator keys — encryption is enforced by the protocol
                itself at the mathematical level.
              </p>
            </div>
            <div className="px-4 py-2 rounded-full border border-amber-500/20 bg-amber-500/[0.05]">
              <span className="text-xs text-amber-400/70 font-mono">EVM-native FHE · Zama fhEVM v0.11 · Sepolia</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <ShadeLogoMark size={26} showBg />
            <div>
              <p className="text-sm font-semibold">Shade</p>
              <p className="text-xs text-white/30">Encrypted by math, not by trust</p>
            </div>
          </div>
          <div className="flex items-center gap-7">
            <a
              href="https://docs.zama.ai/fhevm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/zama-ai/fhevm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.zama.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/45 transition-colors"
            >
              Built on <span className="font-semibold ml-1">Zama</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
