"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
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

// States: CREATED=0, FUNDED=1, COMPLETED=2, RELEASED=3, DISPUTED=4, REFUNDED=5, CANCELLED=6
const STATE_STEPS = [
  { state: 0, label: "Created" },
  { state: 1, label: "Funded" },
  { state: 2, label: "Completed" },
  { state: 3, label: "Released" },
];

const SIDE_STATE: Record<number, { label: string; color: string; icon: React.ElementType }> = {
  4: { label: "Disputed",  color: "text-orange-400", icon: ShieldAlert },
  5: { label: "Refunded",  color: "text-blue-400",   icon: CheckCircle2 },
  6: { label: "Cancelled", color: "text-white/30",   icon: XCircle },
};

const RELEASE_WINDOW_SECS = 10 * 60;

export default function EscrowDetailPage() {
  const { id } = useParams();
  const { address, chainId } = useAccount();
  const { instance } = useFhevm();
  const client = usePublicClient();
  const cid = chainId ?? 31337;
  const escrowAddr = getAddress(cid, "PrivateEscrow");
  const cusdcAddr  = getAddress(cid, "ConfidentialUSDC");
  const { writeContractAsync } = useTrackedWrite();
  const escrowId = BigInt(id as string);

  const [showFund,           setShowFund]           = useState(false);
  const [fundAmount,         setFundAmount]         = useState("");
  const [isFunding,          setIsFunding]          = useState(false);

  const [showMarkComplete,   setShowMarkComplete]   = useState(false);
  const [markCompleteProof,  setMarkCompleteProof]  = useState("");
  const [isMarkingComplete,  setIsMarkingComplete]  = useState(false);

  const [showDispute,        setShowDispute]        = useState(false);
  const [proofURI,           setProofURI]           = useState("");
  const [isDisputing,        setIsDisputing]        = useState(false);

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

  const [depositor, recipient, arbiter, state, , timeoutAt, completedAt] = escrow;
  const stateNum     = Number(state);
  const now          = BigInt(Math.floor(Date.now() / 1000));
  const isDepositor  = address?.toLowerCase() === depositor.toLowerCase();
  const isRecipient  = address?.toLowerCase() === recipient.toLowerCase();
  const hasArbiter   = arbiter !== "0x0000000000000000000000000000000000000000";
  const isArbiter    = hasArbiter && address?.toLowerCase() === arbiter.toLowerCase();
  const isPastTimeout      = timeoutAt > 0n && now > timeoutAt;
  const isPastReleaseWindow = completedAt > 0n && now >= completedAt + BigInt(RELEASE_WINDOW_SECS);
  const releaseDeadline    = completedAt > 0n ? Number(completedAt) + RELEASE_WINDOW_SECS : 0;

  const isHappyPath = stateNum <= 3;
  const isTerminal  = stateNum === 3 || stateNum === 5 || stateNum === 6;

  // ── simple one-arg actions ──────────────────────────────────────────────────
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
      toast.error(err instanceof Error ? err.message : "Transaction failed", { duration: 8000 });
    }
  }

  // ── fund escrow ─────────────────────────────────────────────────────────────
  async function fundEscrow() {
    if (!address || !instance || !fundAmount || !client) return;
    setIsFunding(true);
    try {
      const amountRaw = BigInt(Math.round(parseFloat(fundAmount) * 1e6));
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
      toast.error(err instanceof Error ? err.message : "Funding failed", { duration: 8000 });
    } finally {
      setIsFunding(false);
    }
  }

  // ── mark completed (recipient) ──────────────────────────────────────────────
  async function submitMarkComplete() {
    if (!markCompleteProof.trim()) { toast.error("Provide proof of delivery before submitting"); return; }
    setIsMarkingComplete(true);
    try {
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "markCompleted",
        args: [escrowId, markCompleteProof.trim()],
      }, `Mark Escrow #${id} Completed`);
      toast.success("Marked as completed — depositor has 10 minutes to release");
      setShowMarkComplete(false);
      setMarkCompleteProof("");
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    } finally {
      setIsMarkingComplete(false);
    }
  }

  // ── dispute with proof (recipient, after release window) ────────────────────
  async function submitDispute() {
    if (!proofURI.trim()) { toast.error("Provide a proof URI before submitting"); return; }
    setIsDisputing(true);
    try {
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "disputeWithProof",
        args: [escrowId, proofURI.trim()],
      }, `Dispute Escrow #${id}`);
      toast.success("Dispute submitted — arbiter has been notified via on-chain event");
      setShowDispute(false);
      setProofURI("");
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    } finally {
      setIsDisputing(false);
    }
  }

  const sideState = SIDE_STATE[stateNum];

  return (
    <AppShell>
      <PageHeader title={`Escrow #${id}`} />
      <div className="flex flex-col gap-5 px-4 pb-6 md:px-8 md:pb-8">

        {/* ── State indicator ─────────────────────────────────────────────── */}
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
        ) : sideState ? (
          <GlassCard padding="md">
            <div className="flex items-center gap-3">
              <sideState.icon className={`h-4 w-4 shrink-0 ${sideState.color}`} strokeWidth={1.8} />
              <span className={`text-sm font-medium ${sideState.color}`}>{sideState.label}</span>
              {stateNum === 4 && (
                <span className="ml-auto text-xs text-white/30">Awaiting arbiter review</span>
              )}
            </div>
          </GlassCard>
        ) : null}

        {/* ── Details card ────────────────────────────────────────────────── */}
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
            {hasArbiter ? (
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40">Arbiter{isArbiter ? " (you)" : ""}</span>
                <AddressDisplay address={arbiter} chars={6} />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400/70 shrink-0" />
                <span className="text-xs text-orange-400/70">No arbiter — disputes not possible</span>
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
            {/* Show escrow timeout while FUNDED */}
            {stateNum === 1 && timeoutAt > 0n && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Timeout
                </span>
                <span className={`text-xs font-mono ${isPastTimeout ? "text-orange-400 font-medium" : "text-white/60"}`}>
                  {isPastTimeout ? "Expired" : formatCountdown(Number(timeoutAt))}
                </span>
              </div>
            )}
            {/* Show release window while COMPLETED */}
            {stateNum === 2 && completedAt > 0n && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Release window
                </span>
                <span className={`text-xs font-mono ${isPastReleaseWindow ? "text-orange-400 font-medium" : "text-white/60"}`}>
                  {isPastReleaseWindow ? "Expired" : formatCountdown(releaseDeadline)}
                </span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Actions ─────────────────────────────────────────────────────── */}

        {/* CREATED — depositor funds or cancels */}
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

        {/* FUNDED — depositor: wait for recipient to mark completed; can reclaim after timeout */}
        {stateNum === 1 && isDepositor && (
          <div className="flex flex-col gap-3">
            <div className="glass-card p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-white/30 shrink-0" />
                <span className="text-sm font-medium text-white/60">Waiting for delivery</span>
              </div>
              <p className="text-xs text-white/35 leading-relaxed">
                The recipient needs to mark delivery completed before you can release funds.
              </p>
            </div>
            {isPastTimeout ? (
              <Button variant="secondary" fullWidth onClick={() => act("timeout", "Reclaim via Timeout")}>
                Timeout Expired — Reclaim Funds
              </Button>
            ) : (
              <p className="text-xs text-white/25 text-center">
                No delivery? You can reclaim after timeout expires ({formatCountdown(Number(timeoutAt))}).
              </p>
            )}
          </div>
        )}

        {/* FUNDED — recipient: mark delivery completed */}
        {stateNum === 1 && isRecipient && !isDepositor && (
          <div className="flex flex-col gap-3">
            {isPastTimeout ? (
              <div className="glass-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  <span className="text-sm font-medium text-red-400">Timeout has expired</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  The depositor can now reclaim funds. Contact them directly to resolve.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400/80">
                    Mark delivery before timeout — <span className="font-medium">{formatCountdown(Number(timeoutAt))} left</span>
                  </p>
                </div>
                <Button variant="primary" fullWidth onClick={() => setShowMarkComplete(true)}>
                  <PackageCheck className="h-4 w-4" />
                  Mark Delivery Completed
                </Button>
              </>
            )}
          </div>
        )}

        {/* COMPLETED — depositor: release within window */}
        {stateNum === 2 && isDepositor && (
          <div className="flex flex-col gap-3">
            {!isPastReleaseWindow ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/[0.07] border border-blue-500/20">
                  <PackageCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-400/80">
                    Recipient marked delivery — review and release within{" "}
                    <span className="font-medium">{formatCountdown(releaseDeadline)}</span>
                  </p>
                </div>
                <Button variant="primary" fullWidth onClick={() => act("release", "Release Payment")}>
                  <ShieldCheck className="h-4 w-4" />
                  Release Payment to Recipient
                </Button>
              </>
            ) : (
              <div className="glass-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
                  <span className="text-sm font-medium text-orange-400">Release window expired</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  The 10-minute release window has passed. The recipient can now{" "}
                  {hasArbiter ? "open a dispute with the arbiter" : "claim the funds directly"}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* COMPLETED — recipient: wait or act after window */}
        {stateNum === 2 && isRecipient && !isDepositor && (
          <div className="flex flex-col gap-3">
            {!isPastReleaseWindow ? (
              <div className="glass-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-sm font-medium text-blue-400">Waiting for depositor</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  Depositor has <span className="font-medium text-white/60">{formatCountdown(releaseDeadline)}</span> to review
                  your delivery proof and release payment. If they don&apos;t,{" "}
                  {hasArbiter ? "you can open a dispute" : "you can claim automatically"}.
                </p>
              </div>
            ) : hasArbiter ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/[0.07] border border-orange-500/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  <p className="text-xs text-orange-400/80">
                    Release window expired — the arbiter can now resolve in your favour.
                  </p>
                </div>
                <Button variant="secondary" fullWidth onClick={() => setShowDispute(true)}>
                  <ShieldAlert className="h-4 w-4" />
                  Open Dispute with Arbiter
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/[0.07] border border-green-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <p className="text-xs text-green-400/80">
                    Release window has expired — you can now claim the funds directly.
                  </p>
                </div>
                <Button variant="primary" fullWidth onClick={() => act("claimAfterWindow", "Claim Payment")}>
                  <ShieldCheck className="h-4 w-4" />
                  Claim Payment
                </Button>
              </>
            )}
          </div>
        )}

        {/* DISPUTED — arbiter resolves */}
        {stateNum === 4 && isArbiter && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/40 text-center">
              Review the proof URI from the on-chain event log, then resolve.
            </p>
            <div className="flex gap-3">
              <Button variant="primary" fullWidth onClick={() => act("resolveToRecipient", "Resolve → Recipient")}>
                Delivered — Pay Recipient
              </Button>
              <Button variant="secondary" fullWidth onClick={() => act("resolveToDepositor", "Resolve → Depositor")}>
                Not Delivered — Refund
              </Button>
            </div>
          </div>
        )}
        {stateNum === 4 && !isArbiter && (
          <div className="glass-card p-4 flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-orange-400 shrink-0" />
            <p className="text-xs text-white/50 leading-relaxed">
              Dispute in progress. The arbiter is reviewing the submitted evidence and will resolve on-chain.
            </p>
          </div>
        )}
      </div>

      {/* ── Fund modal ──────────────────────────────────────────────────────── */}
      <Modal open={showFund} onClose={() => !isFunding && setShowFund(false)} title={`Fund Escrow #${id}`}>
        <p className="text-xs text-white/40 leading-relaxed">
          Enter the amount to lock in escrow. You will sign two transactions: an approval, then the fund transfer.
        </p>
        <GlassCard padding="sm">
          <NumericKeypad value={fundAmount} onChange={setFundAmount} unit="cUSDC" />
        </GlassCard>
        <Button fullWidth size="lg" isLoading={isFunding} disabled={!fundAmount} onClick={fundEscrow}>
          Approve & Fund
        </Button>
      </Modal>

      {/* ── Mark Completed modal (recipient, FUNDED state) ──────────────────── */}
      <Modal open={showMarkComplete} onClose={() => !isMarkingComplete && setShowMarkComplete(false)} title="Mark Delivery Completed">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-white/50 leading-relaxed">
            Provide a URI pointing to evidence of delivery — an IPFS hash, GitHub link, or any public URL.
            This is written on-chain for the depositor (and arbiter if needed) to review.
          </p>
          <div className="flex items-center gap-2 mt-1 px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400/80">
              Once submitted, the depositor has <strong>10 minutes</strong> to release.
              After that window, you can{hasArbiter ? " open a dispute" : " claim automatically"}.
            </p>
          </div>
        </div>
        <Input
          label="Proof of Delivery URI"
          placeholder="ipfs://Qm... or https://..."
          value={markCompleteProof}
          onChange={(e) => setMarkCompleteProof(e.target.value)}
        />
        <Button
          fullWidth
          size="lg"
          isLoading={isMarkingComplete}
          disabled={!markCompleteProof.trim()}
          onClick={submitMarkComplete}
        >
          <PackageCheck className="h-4 w-4" />
          Submit Delivery Proof
        </Button>
      </Modal>

      {/* ── Dispute-with-proof modal (recipient, COMPLETED + past window) ────── */}
      <Modal open={showDispute} onClose={() => !isDisputing && setShowDispute(false)} title="Open Dispute with Arbiter">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-white/50 leading-relaxed">
            Provide any additional proof URI to supplement the delivery evidence already on-chain.
            The arbiter will review both and resolve on-chain.
          </p>
          <div className="flex items-center gap-2 mt-1 px-3 py-2.5 rounded-xl bg-orange-500/[0.08] border border-orange-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
            <p className="text-xs text-orange-400/80">
              This action is irreversible. The escrow will enter DISPUTED state.
            </p>
          </div>
        </div>
        <Input
          label="Additional Proof URI (optional)"
          placeholder="ipfs://Qm... or https://..."
          value={proofURI}
          onChange={(e) => setProofURI(e.target.value)}
        />
        <Button
          fullWidth
          size="lg"
          variant="danger"
          isLoading={isDisputing}
          disabled={!proofURI.trim()}
          onClick={submitDispute}
        >
          Submit Dispute On-Chain
        </Button>
      </Modal>
    </AppShell>
  );
}
