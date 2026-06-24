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
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { useBalance } from "@/hooks/useBalance";
import { Lock, Send } from "lucide-react";

function SendAmountInner() {
  const [amount, setAmount] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get("to") ?? "";
  const mode = params.get("mode") ?? "standard";

  const { isRevealed, decryptedValue, reveal, isLoading } = useBalance();

  const amountRaw = amount ? parseUnits(amount, 6) : 0n;
  const balanceNum = isRevealed && decryptedValue
    ? parseFloat(decryptedValue.replace(/,/g, ""))
    : null;
  const exceedsBalance = balanceNum !== null && parseFloat(amount || "0") > balanceNum;

  function handleMax() {
    if (balanceNum !== null) setAmount(String(balanceNum));
  }

  function next() {
    if (!amountRaw || exceedsBalance) return;
    router.push(`/send/confirm?to=${to}&mode=${mode}&amount=${amount}`);
  }

  return (
    <AppShell>
      <PageHeader title="Amount" />
      <div className="flex flex-col gap-5 px-4 md:px-8 md:max-w-2xl md:mx-auto">
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

        {/* Balance row */}
        <GlassCard padding="sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">Your cUSDC balance</span>
            <EncryptedBadge
              size="sm"
              value={decryptedValue ?? undefined}
              isRevealed={isRevealed}
              onReveal={reveal}
              isLoading={isLoading}
            />
          </div>
        </GlassCard>

        {/* Keypad */}
        <GlassCard padding="md">
          <NumericKeypad
            value={amount}
            onChange={setAmount}
            unit="cUSDC"
            disabled={!isRevealed}
            maxValue={isRevealed && decryptedValue ? decryptedValue : undefined}
            onMax={isRevealed && balanceNum !== null ? handleMax : undefined}
            error={exceedsBalance ? "Exceeds cUSDC balance" : undefined}
          />
        </GlassCard>

        <div className="flex justify-center">
          <FHEStatusPill status="idle" />
        </div>

        {!isRevealed ? (
          <Button fullWidth size="lg" onClick={reveal} isLoading={isLoading}>
            Reveal Balance to Continue
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            disabled={!amountRaw || exceedsBalance}
            onClick={next}
          >
            Preview Send
          </Button>
        )}

        {!isRevealed && (
          <p className="text-xs text-white/40 text-center -mt-2 leading-relaxed">
            Balance must be revealed so we can verify you have enough to send.
          </p>
        )}
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
