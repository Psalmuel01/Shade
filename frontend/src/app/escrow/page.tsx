"use client";

import { useState } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { isAddress } from "viem";
import { Plus, ShieldCheck, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { ESCROW_STATE_LABEL } from "@/lib/format";
import { PrivateEscrowABI } from "@/lib/abis/PrivateEscrow";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import toast from "react-hot-toast";
import Link from "next/link";

const TIMEOUT_OPTIONS = [
  { label: "1h", seconds: 3600 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "30d", seconds: 2592000 },
];

const STATE_COLORS: Record<number, string> = {
  0: "text-white/40",
  1: "text-amber-400",
  2: "text-blue-400",
  3: "text-green-400",
  4: "text-red-400",
  5: "text-white/40",
  6: "text-white/20",
};

export default function EscrowPage() {
  const { address, chainId } = useAccount();
  const { instance } = useFhevm();
  const client = usePublicClient();
  const { writeContractAsync } = useTrackedWrite();
  const [showCreate, setShowCreate] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [timeoutIdx, setTimeoutIdx] = useState(1);
  const [amount, setAmount] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const cid = chainId ?? 31337;
  const escrowAddr = getAddress(cid, "PrivateEscrow");
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");

  const { data: escrowCount } = useReadContract({
    address: escrowAddr,
    abi: PrivateEscrowABI,
    functionName: "escrowCount",
    query: { refetchInterval: 8000 },
  });

  async function createEscrow() {
    if (!address || !instance || !isAddress(recipient) || !amount || !client) return;
    setIsCreating(true);
    try {
      const timeoutSecs = BigInt(TIMEOUT_OPTIONS[timeoutIdx].seconds);
      const arbiterAddr: `0x${string}` = isAddress(arbiter)
        ? (arbiter as `0x${string}`)
        : "0x0000000000000000000000000000000000000000";

      // Step 1: Create escrow shell and wait for confirmation
      const createHash = await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "createEscrow",
        args: [recipient as `0x${string}`, arbiterAddr, timeoutSecs],
      }, "Create Escrow");
      await client.waitForTransactionReceipt({ hash: createHash });

      // Read the actual new ID from the confirmed on-chain state
      const newId = await client.readContract({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "escrowCount",
      }) as bigint;

      // Step 2: Approve — must be confirmed before fund can transferFrom
      // Proof must be bound to cusdcAddr (the contract that calls FHE.fromExternal for approve)
      const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6));
      const { handle, proof } = await encrypt64(instance, cusdcAddr, address, amountRaw);
      const approveHash = await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "approve",
        args: [escrowAddr, handle, proof],
      }, "Approve cUSDC");
      await client.waitForTransactionReceipt({ hash: approveHash });

      // Step 3: Fund the escrow
      const fundEnc = await encrypt64(instance, escrowAddr, address, amountRaw);
      await writeContractAsync({
        address: escrowAddr,
        abi: PrivateEscrowABI,
        functionName: "fund",
        args: [newId, fundEnc.handle, fundEnc.proof],
      }, `Fund Escrow #${newId}`);

      toast.success("Escrow created and funded");
      setShowCreate(false);
      setRecipient("");
      setAmount("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message.slice(0, 80) : "Failed");
    } finally {
      setIsCreating(false);
    }
  }

  const count = Number(escrowCount ?? 0n);
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));

  return (
    <AppShell>
      <PageHeader
        title="Escrow"
        showBack={false}
        right={
          <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        }
      />

      <div className="flex flex-col gap-5 px-4 pb-6 w-full md:max-w-2xl md:mx-auto md:px-8 md:pb-8">
        {ids.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-sm text-white/40">No escrows yet</p>
              <p className="text-xs text-white/20 mt-1">Create a private escrow to get started</p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Create Escrow
            </Button>
          </div>
        ) : (
          ids.map((id) => <EscrowCard key={id.toString()} id={id} escrowAddr={escrowAddr} address={address ?? ""} />)
        )}
      </div>

      <Modal open={showCreate} onClose={() => !isCreating && setShowCreate(false)} title="New Escrow">
        <Input label="Recipient" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />

        <div className="flex flex-col gap-1.5">
          <Input label="Arbiter (optional)" placeholder="0x... or leave blank" value={arbiter} onChange={(e) => setArbiter(e.target.value)} />
          {/* Warn clearly when no valid arbiter is set */}
          {!isAddress(arbiter) && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-orange-500/[0.08] border border-orange-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-400/80 leading-relaxed">
                Without an arbiter the recipient has <strong>no on-chain recourse</strong> if you withhold payment. Only omit this for fully trusted parties.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-white/50 uppercase tracking-wider">Timeout — depositor reclaims if no delivery</span>
          <div className="grid grid-cols-4 gap-2">
            {TIMEOUT_OPTIONS.map((o, i) => (
              <button
                key={o.label}
                onClick={() => setTimeoutIdx(i)}
                className={`py-2 rounded-xl text-sm font-medium transition-all ${i === timeoutIdx ? "bg-amber-500 text-black" : "bg-white/[0.05] text-white/40 hover:text-white/60"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <GlassCard padding="sm">
          <NumericKeypad value={amount} onChange={setAmount} />
        </GlassCard>

        <Button fullWidth size="lg" isLoading={isCreating} disabled={!isAddress(recipient) || !amount} onClick={createEscrow}>
          Create & Fund
        </Button>
      </Modal>
    </AppShell>
  );
}

function EscrowCard({ id, escrowAddr, address }: { id: bigint; escrowAddr: `0x${string}`; address: string }) {
  const { data: escrow } = useReadContract({
    address: escrowAddr,
    abi: PrivateEscrowABI,
    functionName: "getEscrow",
    args: [id],
  });

  if (!escrow) return null;
  const [depositor, recipient, arbiter, state] = escrow;
  const stateNum = Number(state);
  const isParty = address.toLowerCase() === depositor.toLowerCase() || address.toLowerCase() === recipient.toLowerCase();

  return (
    <Link href={`/escrow/${id}`}>
      <GlassCard hover padding="md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#FAFAFA]">Escrow #{id.toString()}</span>
              <span className={`text-2xs font-medium ${STATE_COLORS[stateNum]}`}>
                {ESCROW_STATE_LABEL[stateNum]}
              </span>
            </div>
            <AddressDisplay address={depositor} chars={5} showCopy={false} className="text-2xs mt-0.5" />
          </div>
          <EncryptedBadge size="sm" />
        </div>
      </GlassCard>
    </Link>
  );
}
