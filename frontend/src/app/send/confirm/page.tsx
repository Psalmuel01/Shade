"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Lock, CheckCircle } from "lucide-react";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { StealthSendABI } from "@/lib/abis/StealthSend";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64, encrypt64AndAddress } from "@/lib/shade";
import toast from "react-hot-toast";

function SendConfirmInner() {
  const params = useSearchParams();
  const to = params.get("to") ?? "";
  const mode = params.get("mode") ?? "standard";
  const amount = params.get("amount") ?? "0";
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const { writeContractAsync } = useWriteContract();
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [done, setDone] = useState(false);
  const [isTxing, setIsTxing] = useState(false);

  const cid = chainId ?? 31337;
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");
  const stealthAddr = getAddress(cid, "StealthSend");
  const amountRaw = parseUnits(amount, 6);

  async function submit() {
    if (!address || !instance) return;
    setIsTxing(true);

    if (mode === "standard") {
      setSteps([
        { id: "encrypt", label: "Encrypt amount", status: "active" },
        { id: "tx", label: "Send transaction", status: "pending" },
      ]);
      try {
        const { handle, proof } = await encrypt64(instance, cusdcAddr, address, amountRaw);
        setSteps((s) => s.map((x) => x.id === "encrypt" ? { ...x, status: "done" } : x.id === "tx" ? { ...x, status: "active" } : x));

        await writeContractAsync({
          address: cusdcAddr,
          abi: ConfidentialUSDCABI,
          functionName: "transfer",
          args: [to as `0x${string}`, handle, proof],
        });
        setSteps((s) => s.map((x) => x.id === "tx" ? { ...x, status: "done" } : x));
        setDone(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        toast.error(msg.slice(0, 80));
        setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
      }
    } else {
      setSteps([
        { id: "approve", label: "Approve StealthSend", status: "active" },
        { id: "encrypt", label: "Encrypt amount & recipient", status: "pending" },
        { id: "tx", label: "Send stealth transaction", status: "pending" },
      ]);
      try {
        const approveEnc = await encrypt64(instance, cusdcAddr, address, amountRaw);
        await writeContractAsync({
          address: cusdcAddr,
          abi: ConfidentialUSDCABI,
          functionName: "approve",
          args: [stealthAddr, approveEnc.handle, approveEnc.proof],
        });
        setSteps((s) => s.map((x) => x.id === "approve" ? { ...x, status: "done" } : x.id === "encrypt" ? { ...x, status: "active" } : x));

        const { amountHandle, recipientHandle, proof } = await encrypt64AndAddress(
          instance, stealthAddr, address, amountRaw, to
        );
        setSteps((s) => s.map((x) => x.id === "encrypt" ? { ...x, status: "done" } : x.id === "tx" ? { ...x, status: "active" } : x));

        await writeContractAsync({
          address: stealthAddr,
          abi: StealthSendABI,
          functionName: "send",
          args: [amountHandle, recipientHandle, proof],
        });
        setSteps((s) => s.map((x) => x.id === "tx" ? { ...x, status: "done" } : x));
        setDone(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        toast.error(msg.slice(0, 80));
        setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
      }
    }
    setIsTxing(false);
  }

  if (done) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[80dvh] px-4 gap-6">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"
          >
            <CheckCircle className="h-10 w-10 text-green-400" />
          </motion.div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-[#FAFAFA]">Sent</h2>
            <p className="text-sm text-white/40 mt-1">
              {amount} cUSDC sent{mode === "stealth" ? " stealthily" : ""}
            </p>
          </div>
          <Button size="lg" onClick={() => router.push("/dashboard")}>
            Back to Home
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Confirm Send" />
      <div className="flex flex-col gap-5 px-4">
        {/* Step indicator */}
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-1 flex-1 rounded-full bg-amber-400" />
          ))}
        </div>
        <span className="text-xs text-white/30 -mt-2">Step 3 of 3 — Confirm</span>

        {/* Summary card */}
        <GlassCard padding="md">
          <div className="flex flex-col gap-4">
            <SectionLabel>Transfer Details</SectionLabel>

            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">To</span>
              <AddressDisplay address={to} chars={8} />
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Amount</span>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-amber-400" />
                <span className="font-mono text-sm text-[#FAFAFA]">{amount} cUSDC</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Mode</span>
              <span className="text-xs font-medium capitalize text-white/60">
                {mode === "stealth" ? "Stealth (recipient hidden)" : "Standard"}
              </span>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="flex justify-center">
              <FHEStatusPill status={isTxing ? "encrypting" : "idle"} />
            </div>
          </div>
        </GlassCard>

        {/* Steps */}
        {steps.length > 0 && (
          <GlassCard padding="md">
            <TxStatus steps={steps} />
          </GlassCard>
        )}

        <Button
          fullWidth
          size="lg"
          isLoading={isTxing}
          disabled={!isReady}
          onClick={submit}
        >
          {mode === "stealth" ? "Send Stealthily" : "Send"}
        </Button>

        {!isReady && (
          <p className="text-xs text-white/30 text-center">Waiting for fhEVM to initialize…</p>
        )}
      </div>
    </AppShell>
  );
}

export default function SendConfirmPage() {
  return (
    <Suspense>
      <SendConfirmInner />
    </Suspense>
  );
}
