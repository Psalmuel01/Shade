"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ExternalLink, ShieldCheck, Briefcase, Send, ScanLine, ArrowUpDown, Lock } from "lucide-react";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGlobalStats } from "@/hooks/useGlobalStats";
import { getAddress } from "@/lib/addresses";

const SEPOLIA_ID = 11155111;

function contractUrl(contract: string) {
  const addr = getAddress(SEPOLIA_ID, contract);
  return `https://sepolia.etherscan.io/address/${addr}`;
}

const STATS = [
  {
    key: "transferCount" as const,
    label: "Confidential Transfers",
    sub: "Encrypted sends where only sender and receiver know the amount",
    icon: Lock,
    color: "text-amber-400 bg-amber-500/10",
    contract: "ConfidentialUSDC",
  },
  {
    key: "shieldCount" as const,
    label: "Shield Operations",
    sub: "USDC shielded into encrypted cUSDC",
    icon: ArrowUpDown,
    color: "text-amber-400/70 bg-amber-500/[0.07]",
    contract: "ConfidentialUSDC",
  },
  {
    key: "runCount" as const,
    label: "Payroll Runs",
    sub: "Encrypted payroll disbursements executed",
    icon: Briefcase,
    color: "text-blue-400 bg-blue-500/10",
    contract: "PayrollVault",
  },
  {
    key: "escrowCount" as const,
    label: "Escrows Created",
    sub: "Private escrows locked on-chain",
    icon: ShieldCheck,
    color: "text-purple-400 bg-purple-500/10",
    contract: "PrivateEscrow",
  },
  {
    key: "stealthCount" as const,
    label: "Stealth Sends",
    sub: "Transfers with encrypted recipient",
    icon: Send,
    color: "text-green-400 bg-green-500/10",
    contract: "StealthSend",
  },
  {
    key: "proofCount" as const,
    label: "Balance Proofs",
    sub: "Threshold proofs published on-chain",
    icon: ScanLine,
    color: "text-teal-400 bg-teal-500/10",
    contract: "BalanceProver",
  },
];

export default function StatsPage() {
  const stats = useGlobalStats();

  return (
    <div className="min-h-dvh bg-[#080808] text-[#FAFAFA]">
      <div className="grain-overlay" />

      {/* Nav */}
      <nav className="border-b border-white/[0.06] bg-[#080808]/80 backdrop-blur-xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-75 transition-opacity">
          <ShadeLogoMark size={22} showBg />
          <span className="text-sm font-semibold">Shade</span>
        </Link>
        <Link href="/dashboard" className="text-xs text-amber-400/70 hover:text-amber-400 transition-colors">
          Open App →
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 flex flex-col gap-12">
        {/* Header */}
        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-xs font-mono text-amber-400/60 uppercase tracking-widest">Protocol Stats</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Activity on Sepolia
          </h1>
          <p className="text-white/45 leading-relaxed max-w-lg">
            All counts are derived from on-chain events, verifiable on Etherscan.
            Amounts are never revealed — not even here.
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <Lock className="h-3 w-3 text-amber-400/60" />
            <span className="text-xs text-white/30 font-mono">
              Every encrypted amount stays private
            </span>
          </div>
        </motion.div>

        {/* Stat grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {STATS.map(({ key, label, sub, icon: Icon, color, contract }, i) => (
            <motion.div
              key={key}
              className="glass-card p-5 flex flex-col gap-4 group"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
            >
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </div>
                <a
                  href={contractUrl(contract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/20 hover:text-amber-400/60 transition-colors"
                  title="View contract on Etherscan"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="flex flex-col gap-1">
                {stats.isLoading && stats[key] === 0 ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <span className="text-3xl font-mono font-semibold tabular-nums">
                    {stats[key].toLocaleString()}
                  </span>
                )}
                <span className="text-sm font-medium text-[#FAFAFA]">{label}</span>
                <span className="text-xs text-white/35 leading-relaxed">{sub}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer note */}
        <div className="flex flex-col gap-3 pt-4 border-t border-white/[0.06]">
          <p className="text-xs text-white/30 leading-relaxed">
            Stats are read directly from Sepolia smart contracts and event logs.
            Shield operations, stealth sends, and balance proofs are counted from
            on-chain events starting at deploy block 11,120,683.
          </p>
          <div className="flex flex-wrap gap-4">
            {["ConfidentialUSDC", "PrivateEscrow", "PayrollVault", "StealthSend", "BalanceProver"].map((c) => (
              <a
                key={c}
                href={contractUrl(c)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/25 hover:text-amber-400/60 flex items-center gap-1 transition-colors"
              >
                {c} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
