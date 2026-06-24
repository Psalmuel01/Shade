"use client";

import { useAccount, useDisconnect, useChainId } from "wagmi";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, Shield, Activity, Copy, Check } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { useFhevm } from "@/lib/fhevm";

export default function ProfilePage() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { isReady } = useFhevm();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const chainName = chainId === 11155111 ? "Sepolia" : chainId === 31337 ? "Hardhat" : `Chain ${chainId}`;

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDisconnect() {
    disconnect();
    router.replace("/");
  }

  return (
    <AppShell>
      <PageHeader title="Profile" showBack={false} />

      <div className="flex flex-col gap-5 px-4 md:px-8 w-full md:max-w-2xl md:mx-auto">
        {/* Identity */}
        <GlassCard padding="md">
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: "radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%)", filter: "blur(12px)" }}
              />
              <ShadeLogoMark size={56} />
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#FAFAFA]">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—"}
                </span>
                <button onClick={copy} className="text-white/30 hover:text-amber-400 transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="shade-pill bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  {chainName}
                </span>
                <span className={`shade-pill border ${isReady ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-white/[0.04] border-white/[0.08] text-white/30"}`}>
                  <Shield className="h-2.5 w-2.5" />
                  fhEVM {isReady ? "Ready" : "Loading"}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Info */}
        <SectionLabel>Protocol</SectionLabel>

        <div className="flex flex-col gap-3">
          {[
            { label: "Encryption", value: "TFHE (Zama fhEVM v0.11)" },
            { label: "Privacy", value: "Amount-hidden on-chain" },
            { label: "Stealth", value: "eaddress recipient hiding" },
            { label: "Network", value: chainName },
          ].map(({ label, value }) => (
            <GlassCard key={label} padding="sm">
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40">{label}</span>
                <span className="text-xs font-mono text-white/60">{value}</span>
              </div>
            </GlassCard>
          ))}
        </div>

        <SectionLabel>Links</SectionLabel>

        <div className="flex flex-col gap-2">
          <a
            href={`https://sepolia.etherscan.io/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-white/50 hover:text-amber-400 transition-colors px-1"
          >
            <Activity className="h-4 w-4" />
            View on Etherscan
          </a>
        </div>

        <div className="pt-2">
          <Button variant="danger" fullWidth size="lg" onClick={handleDisconnect}>
            <LogOut className="h-4 w-4" />
            Disconnect
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
