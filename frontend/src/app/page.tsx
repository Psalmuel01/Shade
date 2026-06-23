"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { Button } from "@/components/ui/Button";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { useConnect } from "wagmi";

export default function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (isConnected) router.replace("/dashboard");
  }, [isConnected, router]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#080808] px-6">
      <motion.div
        className="flex flex-col items-center gap-8 text-center max-w-sm w-full"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Logo */}
        <div className="relative">
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />
          <ShadeLogoMark size={72} showBg />
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold text-[#FAFAFA] tracking-tight">
            Private by default.
          </h1>
          <p className="text-sm text-white/50 leading-relaxed">
            Send, receive, and manage USDC with encrypted amounts. No one sees the numbers — not even on-chain.
          </p>
        </div>

        {/* FHE badge */}
        <FHEStatusPill status="idle" />

        {/* Three pillars */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {[
            { label: "Stealth\nSend", sub: "Hidden recipient" },
            { label: "Private\nEscrow", sub: "Zero-knowledge" },
            { label: "Payroll\nVault", sub: "Per-employee" },
          ].map(({ label, sub }) => (
            <div
              key={label}
              className="glass-card p-3 flex flex-col gap-1"
            >
              <span className="text-xs font-medium text-[#FAFAFA] whitespace-pre-line leading-tight">{label}</span>
              <span className="text-2xs text-white/30">{sub}</span>
            </div>
          ))}
        </div>

        {/* Connect */}
        <div className="flex flex-col gap-3 w-full">
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              if (connectors[0]) connect({ connector: connectors[0] });
            }}
          >
            Connect Wallet
          </Button>
          <p className="text-2xs text-white/20">
            Powered by Zama fhEVM · Amounts encrypted on-chain
          </p>
        </div>
      </motion.div>
    </div>
  );
}
