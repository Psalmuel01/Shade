"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ArrowUpDown, Send, ShieldCheck, Briefcase, Settings, ScanLine, ArrowDownLeft, ArrowUpRight, Lock, Unlock, Clock, CheckCircle, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBalance } from "@/hooks/useBalance";
import { useActivity, ActivityItem, ActivityType } from "@/hooks/useActivity";
import { timeAgo } from "@/lib/format";
import Link from "next/link";

const QUICK_ACTIONS = [
  { href: "/shield", icon: ArrowUpDown, label: "Shield" },
  { href: "/send", icon: Send, label: "Send" },
  { href: "/escrow", icon: ShieldCheck, label: "Escrow" },
  { href: "/payroll", icon: Briefcase, label: "Payroll" },
  { href: "/prove", icon: ScanLine, label: "Prove" },
];

export default function DashboardPage() {
  const { address, isConnected, chainId } = useAccount();
  const router = useRouter();
  const { isRevealed, decryptedValue, reveal, isLoading } = useBalance();

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-5 px-4 pt-14 pb-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <ShadeLogoMark size={28} showBg={false} />
          <Link href="/profile">
            <div className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
              <Settings className="h-4.5 w-4.5 text-white/40" />
            </div>
          </Link>
        </div>

        {/* Greeting */}
        <div className="flex flex-col gap-0.5">
          <span className="text-base text-white/40">{greeting()}</span>
          <AddressDisplay address={address ?? ""} chars={5} showCopy />
        </div>

        {/* Balance card */}
        <GlassCard padding="lg" glow={isRevealed}>
          <div className="flex flex-col items-center gap-5">
            <FHEStatusPill status="idle" />

            <EncryptedBadge
              size="lg"
              value={decryptedValue ?? undefined}
              isRevealed={isRevealed}
              onReveal={reveal}
              isLoading={isLoading}
              label="cUSDC Balance"
              unit="cUSDC"
            />
          </div>
        </GlassCard>

        {/* Quick actions */}
        <div className="grid grid-cols-5 gap-2">
          {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.94 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center hover:bg-white/[0.08] transition-colors">
                  <Icon className="h-5 w-5 text-amber-400" strokeWidth={1.8} />
                </div>
                <span className="text-xs text-white/50">{label}</span>
              </motion.div>
            </Link>
          ))}
        </div>

        {/* Activity */}
        <SectionLabel>Recent Activity</SectionLabel>

        <ActivityFeed address={address} chainId={chainId} />
      </div>
    </AppShell>
  );
}

const ACTIVITY_ICON: Record<ActivityType, React.ElementType> = {
  shield: Lock,
  unshield_request: Clock,
  unshield: Unlock,
  transfer_in: ArrowDownLeft,
  transfer_out: ArrowUpRight,
  escrow_created: ShieldCheck,
  escrow_funded: ShieldCheck,
  escrow_released: CheckCircle,
  stealth_sent: Send,
  proof_published: ScanLine,
  payroll_claimed: Briefcase,
  template_created: Briefcase,
  run_created: Briefcase,
  run_funded: Briefcase,
  run_executed: CheckCircle,
};

const ACTIVITY_COLOR: Record<ActivityType, string> = {
  shield: "text-amber-400 bg-amber-500/10",
  unshield_request: "text-orange-400 bg-orange-500/10",
  unshield: "text-green-400 bg-green-500/10",
  transfer_in: "text-green-400 bg-green-500/10",
  transfer_out: "text-blue-400 bg-blue-500/10",
  escrow_created: "text-purple-400 bg-purple-500/10",
  escrow_funded: "text-purple-400 bg-purple-500/10",
  escrow_released: "text-green-400 bg-green-500/10",
  stealth_sent: "text-blue-400 bg-blue-500/10",
  proof_published: "text-amber-400 bg-amber-500/10",
  payroll_claimed: "text-green-400 bg-green-500/10",
  template_created: "text-blue-400 bg-blue-500/10",
  run_created: "text-blue-400 bg-blue-500/10",
  run_funded: "text-amber-400 bg-amber-500/10",
  run_executed: "text-green-400 bg-green-500/10",
};

function ActivityRow({ item, chainId }: { item: ActivityItem; chainId?: number }) {
  const Icon = ACTIVITY_ICON[item.type];
  const colorClass = ACTIVITY_COLOR[item.type];
  const explorerBase = chainId === 11155111 ? "https://sepolia.etherscan.io/tx/" : "https://etherscan.io/tx/";

  return (
    <a
      href={`${explorerBase}${item.txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/[0.04] transition-colors group"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#FAFAFA] truncate">{item.label}</p>
        {item.sublabel && (
          <p className="text-xs text-white/30 truncate mt-0.5">{item.sublabel}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {item.ts && (
          <span className="text-xs text-white/25">{timeAgo(item.ts)}</span>
        )}
        <ExternalLink className="h-3 w-3 text-white/10 group-hover:text-white/30 transition-colors" />
      </div>
    </a>
  );
}

function ActivityFeed({ address, chainId }: { address?: string; chainId?: number }) {
  const { items, isLoading } = useActivity();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center">
          <Send className="h-5 w-5 text-white/20" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-white/40">No transactions yet</span>
          <span className="text-xs text-white/20">Your activity will appear here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} chainId={chainId} />
      ))}
    </div>
  );
}
