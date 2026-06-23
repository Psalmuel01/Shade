"use client";

import { useParams } from "next/navigation";
import { useReadContract } from "wagmi";
import { CheckCircle, XCircle, Clock, Lock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { BalanceProverABI } from "@/lib/abis/BalanceProver";
import { timeAgo } from "@/lib/format";
import { getAddress } from "@/lib/addresses";
import Link from "next/link";

const DEFAULT_CHAIN = 11155111;

export default function PublicProofPage() {
  const { address } = useParams();
  const proverAddr = getAddress(DEFAULT_CHAIN, "BalanceProver");

  const { data: proof, isLoading } = useReadContract({
    address: proverAddr,
    abi: BalanceProverABI,
    functionName: "getProof",
    args: [address as `0x${string}`],
  });

  const hasProof = proof && (proof as { exists: boolean }).exists;
  const result = hasProof ? (proof as { result: boolean }).result : null;
  const timestamp = hasProof ? Number((proof as { timestamp: bigint }).timestamp) : 0;

  return (
    <div className="min-h-dvh bg-[#080808] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <Link href="/">
            <ShadeLogoMark size={40} />
          </Link>
          <h1 className="text-lg font-semibold text-[#FAFAFA]">Balance Proof</h1>
          <AddressDisplay address={address as string} chars={8} />
        </div>

        {isLoading ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-16" />
          </>
        ) : hasProof ? (
          <>
            <GlassCard padding="lg" glow={result === true}>
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${result ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {result ? (
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-400" />
                  )}
                </div>

                <div className="text-center">
                  <p className="text-lg font-semibold text-[#FAFAFA]">
                    Balance {result ? "≥" : "<"} threshold
                  </p>
                  <p className="text-sm text-white/40 mt-1">
                    Verified on-chain via Zama fhEVM
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-white/30">
                  <Clock className="h-3 w-3" />
                  {timeAgo(timestamp)}
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="md">
              <div className="flex flex-col gap-2">
                <SectionLabel>Privacy Note</SectionLabel>
                <p className="text-xs text-white/40 text-center leading-relaxed">
                  The actual balance is never revealed. Only whether it meets the threshold — proven cryptographically by Zama&apos;s FHE network.
                </p>
              </div>
            </GlassCard>
          </>
        ) : (
          <GlassCard padding="lg">
            <div className="flex flex-col items-center gap-3">
              <Lock className="h-8 w-8 text-white/20" />
              <p className="text-sm text-white/40 text-center">No proof found for this address</p>
            </div>
          </GlassCard>
        )}

        <p className="text-center text-2xs text-white/20">
          Powered by{" "}
          <Link href="/" className="text-amber-400 hover:underline">
            Shade Protocol
          </Link>{" "}
          · Zama fhEVM
        </p>
      </div>
    </div>
  );
}
