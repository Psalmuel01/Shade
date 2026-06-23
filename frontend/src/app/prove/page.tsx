"use client";

import { useState } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
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
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { encrypt64 } from "@/lib/shade";
import { timeAgo } from "@/lib/format";
import toast from "react-hot-toast";

async function retryPublicDecrypt(
  instance: NonNullable<ReturnType<typeof useFhevm>["instance"]>,
  handle: string,
  maxAttempts = 12,
  delayMs = 5000,
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await instance.publicDecrypt([handle]);
    } catch {
      if (i === maxAttempts - 1) throw new Error("KMS timeout — the network took too long. Try again in a few minutes.");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("KMS timeout");
}

export default function ProvePage() {
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const { writeContractAsync } = useTrackedWrite();
  const client = usePublicClient();
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
    if (!address || !instance || !threshold || !client) return;
    setIsProving(true);
    setSteps([
      { id: "authorize", label: "Authorize balance read", status: "active" },
      { id: "encrypt", label: "Encrypt threshold", status: "pending" },
      { id: "prove", label: "Submit proof request (on-chain)", status: "pending" },
      { id: "kms", label: "Await KMS decryption (30–60s)", status: "pending" },
      { id: "publish", label: "Publish proof on-chain", status: "pending" },
    ]);

    try {
      // Step 1: authorize
      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "authorizeBalanceRead",
        args: [proverAddr],
      }, "Authorize Balance Read");
      setSteps((s) => s.map((x) => x.id === "authorize" ? { ...x, status: "done" } : x.id === "encrypt" ? { ...x, status: "active" } : x));

      // Step 2: encrypt threshold
      const thresholdRaw = BigInt(Math.round(parseFloat(threshold) * 1e6));
      const { handle, proof: inputProof } = await encrypt64(instance, proverAddr, address, thresholdRaw);
      setSteps((s) => s.map((x) => x.id === "encrypt" ? { ...x, status: "done" } : x.id === "prove" ? { ...x, status: "active" } : x));

      // Step 3: proveAbove — computes balance >= threshold on-chain, marks ebool for KMS
      await writeContractAsync({
        address: proverAddr,
        abi: BalanceProverABI,
        functionName: "proveAbove",
        args: [handle, inputProof],
      }, `Prove Balance ≥ ${threshold}`);
      setSteps((s) => s.map((x) => x.id === "prove" ? { ...x, status: "done" } : x.id === "kms" ? { ...x, status: "active" } : x));

      // Step 4: read the ebool handle the contract stored, then publicDecrypt
      const pendingHandle = await client.readContract({
        address: proverAddr,
        abi: BalanceProverABI,
        functionName: "pendingHandle",
        args: [address],
      }) as `0x${string}`;

      if (!pendingHandle || pendingHandle === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        throw new Error("No pending handle found — proveAbove may not have stored the handle yet");
      }

      toast("KMS processing — this takes 30–60 seconds…", { duration: 60000 });
      const { abiEncodedClearValues, decryptionProof } = await retryPublicDecrypt(instance, pendingHandle);
      setSteps((s) => s.map((x) => x.id === "kms" ? { ...x, status: "done" } : x.id === "publish" ? { ...x, status: "active" } : x));

      // Step 5: publishProof — verifies KMS signature and writes result on-chain
      await writeContractAsync({
        address: proverAddr,
        abi: BalanceProverABI,
        functionName: "publishProof",
        args: [address, abiEncodedClearValues, decryptionProof],
      }, "Publish Balance Proof");
      setSteps((s) => s.map((x) => x.id === "publish" ? { ...x, status: "done" } : x));

      toast.success("Proof published!");
      setThreshold("");
      await refetchProof();
      setTimeout(() => setSteps([]), 3000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast.error(msg.slice(0, 100));
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
                Share your address to let anyone verify at{" "}
                <span className="font-mono text-amber-400">/prove/{address?.slice(0, 10)}…</span>
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
                  }, "Clear Proof");
                  refetchProof();
                }}
              >
                Clear Proof
              </Button>
            </div>
          </GlassCard>
        )}

        <SectionLabel>Prove Balance Above Threshold</SectionLabel>

        <GlassCard padding="md">
          <NumericKeypad value={threshold} onChange={setThreshold} unit="cUSDC" />
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
          Proves your balance meets the threshold without revealing the actual amount.
          The KMS decryption step takes 30–60 seconds on Sepolia.
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
