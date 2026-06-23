"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Lock, Send } from "lucide-react";

type SendMode = "standard" | "stealth";

export default function SendRecipientPage() {
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<SendMode>("standard");
  const router = useRouter();

  const isValid = isAddress(recipient);

  function next() {
    if (!isValid) return;
    router.push(`/send/amount?to=${recipient}&mode=${mode}`);
  }

  return (
    <AppShell>
      <PageHeader title="Send cUSDC" showBack={false} />

      <div className="flex flex-col gap-5 px-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${n <= 1 ? "bg-amber-400" : "bg-white/[0.08]"}`} />
            </div>
          ))}
        </div>
        <span className="text-xs text-white/30 -mt-2">Step 1 of 3 — Recipient</span>

        {/* Recipient input */}
        <GlassCard padding="md">
          <Input
            label="Recipient address"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            error={recipient && !isValid ? "Invalid Ethereum address" : undefined}
            className="font-mono"
          />
        </GlassCard>

        {/* Mode selector */}
        <SectionLabel>Send Mode</SectionLabel>

        <div className="flex flex-col gap-3">
          <GlassCard
            hover
            padding="md"
            onClick={() => setMode("standard")}
            className={`cursor-pointer transition-all ${mode === "standard" ? "border-amber-500/40" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === "standard" ? "bg-amber-500/15" : "bg-white/[0.05]"}`}>
                <Send className={`h-4.5 w-4.5 ${mode === "standard" ? "text-amber-400" : "text-white/30"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#FAFAFA]">Standard Send</span>
                  {mode === "standard" && (
                    <span className="shade-pill bg-amber-500/10 border-amber-500/20 text-amber-400 text-2xs">Selected</span>
                  )}
                </div>
                <p className="text-xs text-white/30 mt-0.5">Recipient visible — amount encrypted</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard
            hover
            padding="md"
            onClick={() => setMode("stealth")}
            className={`cursor-pointer transition-all ${mode === "stealth" ? "border-amber-500/40" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === "stealth" ? "bg-amber-500/15" : "bg-white/[0.05]"}`}>
                <Lock className={`h-4.5 w-4.5 ${mode === "stealth" ? "text-amber-400" : "text-white/30"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#FAFAFA]">Stealth Send</span>
                  {mode === "stealth" && (
                    <span className="shade-pill bg-amber-500/10 border-amber-500/20 text-amber-400 text-2xs">Selected</span>
                  )}
                </div>
                <p className="text-xs text-white/30 mt-0.5">Recipient & amount both encrypted on-chain</p>
              </div>
            </div>
          </GlassCard>
        </div>

        <Button
          fullWidth
          size="lg"
          disabled={!isValid}
          onClick={next}
        >
          Continue
        </Button>
      </div>
    </AppShell>
  );
}
