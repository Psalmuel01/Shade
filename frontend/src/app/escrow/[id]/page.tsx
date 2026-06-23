"use client";

import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ESCROW_STATE_LABEL, formatCountdown } from "@/lib/format";
import { PrivateEscrowABI } from "@/lib/abis/PrivateEscrow";
import { getAddress } from "@/lib/addresses";
import toast from "react-hot-toast";

const STATE_STEPS = [
  { state: 0, label: "Created" },
  { state: 1, label: "Funded" },
  { state: 2, label: "Released" },
];

export default function EscrowDetailPage() {
  const { id } = useParams();
  const { address, chainId } = useAccount();
  const cid = chainId ?? 31337;
  const escrowAddr = getAddress(cid, "PrivateEscrow");
  const { writeContractAsync } = useWriteContract();
  const escrowId = BigInt(id as string);

  const { data: escrow, refetch } = useReadContract({
    address: escrowAddr,
    abi: PrivateEscrowABI,
    functionName: "getEscrow",
    args: [escrowId],
    query: { refetchInterval: 8000 },
  });

  if (!escrow) {
    return (
      <AppShell>
        <PageHeader title={`Escrow #${id}`} />
        <div className="px-4 flex flex-col gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-20" />
        </div>
      </AppShell>
    );
  }

  const [depositor, recipient, arbiter, state, createdAt, timeoutAt] = escrow;
  const stateNum = Number(state);
  const isDepositor = address?.toLowerCase() === depositor.toLowerCase();
  const isRecipient = address?.toLowerCase() === recipient.toLowerCase();
  const isArbiter = arbiter !== "0x0000000000000000000000000000000000000000" && address?.toLowerCase() === arbiter.toLowerCase();

  async function act(fn: string) {
    try {
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: fn as "release",
        args: [escrowId],
      });
      toast.success(`${fn} successful`);
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    }
  }

  return (
    <AppShell>
      <PageHeader title={`Escrow #${id}`} />
      <div className="flex flex-col gap-5 px-4">
        {/* State stepper */}
        <GlassCard padding="md">
          <div className="flex items-center">
            {STATE_STEPS.map((step, i) => (
              <div key={step.state} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    stateNum >= step.state
                      ? "border-amber-400 bg-amber-500/20 text-amber-400"
                      : "border-white/20 text-white/20"
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-2xs ${stateNum >= step.state ? "text-amber-400" : "text-white/20"}`}>
                    {step.label}
                  </span>
                </div>
                {i < STATE_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${stateNum > step.state ? "bg-amber-400/40" : "bg-white/[0.06]"}`} />
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Details */}
        <GlassCard padding="md">
          <div className="flex flex-col gap-3">
            <SectionLabel>Parties</SectionLabel>
            <div className="flex justify-between">
              <span className="text-xs text-white/40">Depositor</span>
              <AddressDisplay address={depositor} chars={6} />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-white/40">Recipient</span>
              <AddressDisplay address={recipient} chars={6} />
            </div>
            {arbiter !== "0x0000000000000000000000000000000000000000" && (
              <div className="flex justify-between">
                <span className="text-xs text-white/40">Arbiter</span>
                <AddressDisplay address={arbiter} chars={6} />
              </div>
            )}
            <div className="h-px bg-white/[0.06]" />
            <div className="flex justify-between">
              <span className="text-xs text-white/40">Amount</span>
              <EncryptedBadge size="sm" />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-white/40">Status</span>
              <span className="text-xs font-medium text-[#FAFAFA]">{ESCROW_STATE_LABEL[stateNum]}</span>
            </div>
            {timeoutAt > 0n && stateNum < 2 && (
              <div className="flex justify-between">
                <span className="text-xs text-white/40">Timeout</span>
                <span className="text-xs font-mono text-white/60">{formatCountdown(Number(timeoutAt))}</span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Actions */}
        {stateNum === 1 && isDepositor && (
          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => act("release")}>Release</Button>
            <Button variant="danger" fullWidth onClick={() => act("dispute")}>Dispute</Button>
          </div>
        )}
        {stateNum === 3 && isArbiter && (
          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => act("resolveToRecipient")}>Resolve → Recipient</Button>
            <Button variant="secondary" fullWidth onClick={() => act("resolveToDepositor")}>→ Depositor</Button>
          </div>
        )}
        {stateNum === 1 && timeoutAt > 0n && BigInt(Math.floor(Date.now() / 1000)) > timeoutAt && (
          <Button variant="secondary" fullWidth onClick={() => act("timeout")}>Trigger Timeout</Button>
        )}
        {stateNum === 0 && isDepositor && (
          <Button variant="danger" fullWidth onClick={() => act("cancel")}>Cancel</Button>
        )}
      </div>
    </AppShell>
  );
}
