"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ESCROW_STATE_LABEL, formatCountdown } from "@/lib/format";
import { PrivateEscrowABI } from "@/lib/abis/PrivateEscrow";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import toast from "react-hot-toast";

const STATE_STEPS = [
  { state: 0, label: "Created" },
  { state: 1, label: "Funded" },
  { state: 2, label: "Released" },
];

const SIDE_STATE_COLOR: Record<number, string> = {
  3: "text-orange-400",
  4: "text-blue-400",
  5: "text-white/30",
};

const SIDE_STATE_DOT: Record<number, string> = {
  3: "bg-orange-400",
  4: "bg-blue-400",
  5: "bg-white/20",
};

export default function EscrowDetailPage() {
  const { id } = useParams();
  const { address, chainId } = useAccount();
  const { instance } = useFhevm();
  const client = usePublicClient();
  const cid = chainId ?? 31337;
  const escrowAddr = getAddress(cid, "PrivateEscrow");
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");
  const { writeContractAsync } = useTrackedWrite();
  const escrowId = BigInt(id as string);

  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);

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

  const [depositor, recipient, arbiter, state, , timeoutAt] = escrow;
  const stateNum = Number(state);
  const isDepositor = address?.toLowerCase() === depositor.toLowerCase();
  const isRecipient = address?.toLowerCase() === recipient.toLowerCase();
  const hasArbiter = arbiter !== "0x0000000000000000000000000000000000000000";
  const isArbiter = hasArbiter && address?.toLowerCase() === arbiter.toLowerCase();
  const isPastTimeout = timeoutAt > 0n && BigInt(Math.floor(Date.now() / 1000)) > timeoutAt;
  const isHappyPath = stateNum <= 2;

  async function act(fn: string, label: string) {
    try {
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: fn as "release",
        args: [escrowId],
      }, label);
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    }
  }

  async function fundEscrow() {
    if (!address || !instance || !fundAmount || !client) return;
    setIsFunding(true);
    try {
      const amountRaw = BigInt(Math.round(parseFloat(fundAmount) * 1e6));

      // Approve must confirm before fund can transferFrom
      // Proof must be bound to cusdcAddr (the contract that calls FHE.fromExternal for approve)
      const { handle, proof } = await encrypt64(instance, cusdcAddr, address, amountRaw);
      const approveHash = await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "approve",
        args: [escrowAddr, handle, proof],
      }, "Approve cUSDC");
      await client.waitForTransactionReceipt({ hash: approveHash });

      const fundEnc = await encrypt64(instance, escrowAddr, address, amountRaw);
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "fund",
        args: [escrowId, fundEnc.handle, fundEnc.proof],
      }, `Fund Escrow #${id}`);

      toast.success("Escrow funded");
      setShowFund(false);
      setFundAmount("");
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    } finally {
      setIsFunding(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title={`Escrow #${id}`} />
      <div className="flex flex-col gap-5 px-4 pb-6 md:px-8 md:pb-8">

        {/* State indicator */}
        {isHappyPath ? (
          <GlassCard padding="md">
            <div className="flex items-center">
              {STATE_STEPS.map((step, i) => (
                <div key={step.state} className="contents">
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
                    <div className={`flex-1 h-px mx-1 mb-3 ${stateNum > step.state ? "bg-amber-400/40" : "bg-white/[0.06]"}`} />
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        ) : (
          <GlassCard padding="md">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${SIDE_STATE_DOT[stateNum] ?? "bg-white/20"}`} />
              <span className={`text-sm font-medium ${SIDE_STATE_COLOR[stateNum] ?? "text-white/40"}`}>
                {ESCROW_STATE_LABEL[stateNum]}
              </span>
            </div>
          </GlassCard>
        )}

        {/* Details */}
        <GlassCard padding="md">
          <div className="flex flex-col gap-3">
            <SectionLabel>Parties</SectionLabel>
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Depositor{isDepositor ? " (you)" : ""}</span>
              <AddressDisplay address={depositor} chars={6} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Recipient{isRecipient ? " (you)" : ""}</span>
              <AddressDisplay address={recipient} chars={6} />
            </div>
            {hasArbiter && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40">Arbiter{isArbiter ? " (you)" : ""}</span>
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
                <span className={`text-xs font-mono ${isPastTimeout ? "text-orange-400" : "text-white/60"}`}>
                  {isPastTimeout ? "Expired" : formatCountdown(Number(timeoutAt))}
                </span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Actions by state ── */}

        {/* CREATED: depositor can fund or cancel */}
        {stateNum === 0 && isDepositor && (
          <div className="flex flex-col gap-3">
            <Button variant="primary" fullWidth onClick={() => setShowFund(true)}>
              Fund Escrow
            </Button>
            <Button variant="danger" fullWidth onClick={() => act("cancel", "Cancel Escrow")}>
              Cancel
            </Button>
          </div>
        )}

        {/* FUNDED: recipient releases; either party can dispute (if arbiter set) */}
        {stateNum === 1 && isRecipient && (
          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => act("release", "Release Escrow")}>
              Confirm & Release
            </Button>
            {hasArbiter && (
              <Button variant="danger" fullWidth onClick={() => act("dispute", "Dispute Escrow")}>
                Dispute
              </Button>
            )}
          </div>
        )}

        {/* FUNDED: depositor can dispute or trigger timeout */}
        {stateNum === 1 && isDepositor && !isRecipient && (
          <div className="flex flex-col gap-3">
            {hasArbiter && (
              <Button variant="danger" fullWidth onClick={() => act("dispute", "Dispute Escrow")}>
                Dispute
              </Button>
            )}
            {isPastTimeout && (
              <Button variant="secondary" fullWidth onClick={() => act("timeout", "Claim Timeout Refund")}>
                Timeout — Claim Refund
              </Button>
            )}
            {!hasArbiter && !isPastTimeout && (
              <p className="text-xs text-white/30 text-center">
                Waiting for recipient to release. Timeout {formatCountdown(Number(timeoutAt))}.
              </p>
            )}
          </div>
        )}

        {/* DISPUTED: arbiter resolves */}
        {stateNum === 3 && isArbiter && (
          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => act("resolveToRecipient", "Resolve → Recipient")}>
              → Recipient
            </Button>
            <Button variant="secondary" fullWidth onClick={() => act("resolveToDepositor", "Resolve → Depositor")}>
              → Depositor
            </Button>
          </div>
        )}
        {stateNum === 3 && !isArbiter && (
          <p className="text-xs text-orange-400/70 text-center px-2">
            Disputed — waiting for the arbiter to resolve.
          </p>
        )}
      </div>

      {/* Fund modal */}
      <Modal open={showFund} onClose={() => !isFunding && setShowFund(false)} title={`Fund Escrow #${id}`}>
        <p className="text-xs text-white/40 leading-relaxed">
          Approve the transfer, then lock the funds. Both steps require a wallet signature.
        </p>
        <GlassCard padding="sm">
          <NumericKeypad value={fundAmount} onChange={setFundAmount} unit="cUSDC" />
        </GlassCard>
        <Button fullWidth size="lg" isLoading={isFunding} disabled={!fundAmount} onClick={fundEscrow}>
          Approve & Fund
        </Button>
      </Modal>
    </AppShell>
  );
}
