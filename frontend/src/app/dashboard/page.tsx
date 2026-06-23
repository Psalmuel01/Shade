"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ArrowUpDown, Send, ShieldCheck, Briefcase, Settings } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { useBalance } from "@/hooks/useBalance";
import Link from "next/link";

const QUICK_ACTIONS = [
  { href: "/shield", icon: ArrowUpDown, label: "Shield" },
  { href: "/send", icon: Send, label: "Send" },
  { href: "/escrow", icon: ShieldCheck, label: "Escrow" },
  { href: "/payroll", icon: Briefcase, label: "Payroll" },
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
        <div className="grid grid-cols-4 gap-3">
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

function ActivityFeed({ address, chainId }: { address?: string; chainId?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Placeholder empty state */}
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center">
          <Send className="h-5 w-5 text-white/20" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm text-white/40">No transactions yet</span>
          <span className="text-xs text-white/20">Your activity will appear here</span>
        </div>
      </div>
    </div>
  );
}
