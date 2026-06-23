"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { BalanceProverABI } from "@/lib/abis/BalanceProver";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import { timeAgo } from "@/lib/format";
import toast from "react-hot-toast";

export default function ProvePage() {
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const { writeContractAsync } = useWriteContract();
  const [threshold, setThreshold] = useState("");
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [isProving, setIsProving] = useState(false);

  const cid = chainId ?? 31337;
  const proverAddr = getAddress(cid, "BalanceProver");
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");

  const { data: proof, refetch: refetchProof } = useReadContract({
    address: proverAddr,
    abi: BalanceProverABI,
    functionName: "getProof",
    args: [address!],
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  async function prove() {
    if (!address || !instance || !threshold) return;
    setIsProving(true);
    setSteps([
      { id: "authorize", label: "Authorize balance read", status: "active" },
      { id: "encrypt", label: "Encrypt threshold", status: "pending" },
      { id: "prove", label: "Submit proof request", status: "pending" },
      { id: "wait", label: "Awaiting KMS decryption", status: "pending" },
    ]);

    try {
      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "authorizeBalanceRead",
        args: [proverAddr],
      });
      setSteps((s) => s.map((x) => x.id === "authorize" ? { ...x, status: "done" } : x.id === "encrypt" ? { ...x, status: "active" } : x));

      const thresholdRaw = BigInt(Math.round(parseFloat(threshold) * 1e6));
      const { handle, proof: inputProof } = await encrypt64(instance, proverAddr, address, thresholdRaw);
      setSteps((s) => s.map((x) => x.id === "encrypt" ? { ...x, status: "done" } : x.id === "prove" ? { ...x, status: "active" } : x));

      await writeContractAsync({
        address: proverAddr,
        abi: BalanceProverABI,
        functionName: "proveAbove",
        args: [handle, inputProof],
      });
      setSteps((s) => s.map((x) => x.id === "prove" ? { ...x, status: "done" } : x.id === "wait" ? { ...x, status: "active" } : x));

      toast("Proof requested — KMS is computing…", { icon: "🔒" });
      setThreshold("");

      // Poll for proof completion
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await refetchProof();
        if (attempts > 30) {
          clearInterval(poll);
          setSteps((s) => s.map((x) => x.id === "wait" ? { ...x, status: "error" } : x));
          toast.error("KMS timeout — try again later");
        }
      }, 3000);

    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
      setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally {
      setIsProving(false);
    }
  }

  const hasProof = proof && (proof as { exists: boolean }).exists;

  return (
    <AppShell>
      <PageHeader title="Prove Balance" showBack={false} />

      <div className="flex flex-col gap-5 px-4">
        {/* Existing proof */}
        {hasProof && (
          <GlassCard padding="md" glow={(proof as { result: boolean }).result}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {(proof as { result: boolean }).result ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <span className="font-semibold text-[#FAFAFA]">
                  Balance {(proof as { result: boolean }).result ? "≥" : "<"} threshold
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <Clock className="h-3 w-3" />
                {timeAgo(Number((proof as { timestamp: bigint }).timestamp))}
              </div>
              <p className="text-xs text-white/40">
                Share your wallet address with anyone to let them verify this proof at{" "}
                <span className="font-mono text-amber-400">/prove/{address}</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await writeContractAsync({
                    address: proverAddr,
                    abi: BalanceProverABI,
                    functionName: "clearProof",
                    args: [],
                  });
                  refetchProof();
                }}
              >
                Clear Proof
              </Button>
            </div>
          </GlassCard>
        )}

        {/* New proof */}
        <SectionLabel>Prove Balance Above Threshold</SectionLabel>

        <GlassCard padding="md">
          <NumericKeypad value={threshold} onChange={setThreshold} />
        </GlassCard>

        <div className="flex justify-center">
          <FHEStatusPill status={isProving ? "encrypting" : "idle"} />
        </div>

        {steps.length > 0 && (
          <GlassCard padding="md">
            <TxStatus steps={steps} />
          </GlassCard>
        )}

        <p className="text-xs text-white/30 text-center leading-relaxed px-2">
          Proves your balance is at or above the threshold without revealing the actual amount. Result is publicly verifiable.
        </p>

        <Button
          fullWidth
          size="lg"
          isLoading={isProving}
          disabled={!threshold || !isReady}
          onClick={prove}
        >
          Generate Proof
        </Button>
      </div>
    </AppShell>
  );
}
