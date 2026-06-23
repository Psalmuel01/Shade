"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseUnits } from "viem";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { Lock, Send } from "lucide-react";

function SendAmountInner() {
  const [amount, setAmount] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get("to") ?? "";
  const mode = params.get("mode") ?? "standard";

  const amountRaw = amount ? parseUnits(amount, 6) : 0n;

  function next() {
    if (!amountRaw) return;
    router.push(`/send/confirm?to=${to}&mode=${mode}&amount=${amount}`);
  }

  return (
    <AppShell>
      <PageHeader title="Amount" />
      <div className="flex flex-col gap-5 px-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-1 flex-1 rounded-full transition-colors duration-300" style={{ background: n <= 2 ? "#F59E0B" : "rgba(255,255,255,0.08)" }} />
          ))}
        </div>
        <div className="flex items-center justify-between -mt-2">
          <span className="text-xs text-white/30">Step 2 of 3 — Amount</span>
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            {mode === "stealth" ? <Lock className="h-3 w-3 text-amber-400" /> : <Send className="h-3 w-3" />}
            <span className="capitalize">{mode}</span>
          </div>
        </div>

        {/* Recipient preview */}
        <GlassCard padding="sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">To</span>
            <AddressDisplay address={to} chars={8} />
          </div>
        </GlassCard>

        {/* Keypad */}
        <GlassCard padding="md">
          <NumericKeypad value={amount} onChange={setAmount} />
        </GlassCard>

        <div className="flex justify-center">
          <FHEStatusPill status="idle" />
        </div>

        <Button
          fullWidth
          size="lg"
          disabled={!amountRaw}
          onClick={next}
        >
          Preview Send
        </Button>
      </div>
    </AppShell>
  );
}

export default function SendAmountPage() {
  return (
    <Suspense>
      <SendAmountInner />
    </Suspense>
  );
}
