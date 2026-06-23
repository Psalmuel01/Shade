"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { encrypt64 } from "@/lib/shade";
import toast from "react-hot-toast";

const USDC_DECIMALS = 6;

const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

type Tab = "shield" | "unshield";

export default function ShieldPage() {
  const [tab, setTab] = useState<Tab>("shield");
  const [amount, setAmount] = useState("");
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [isTxing, setIsTxing] = useState(false);
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const { writeContractAsync } = useWriteContract();

  const cid = chainId ?? 31337;
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");
  const usdcAddr = getAddress(cid, "USDC");

  const { data: usdcBalance } = useReadContract({
    address: usdcAddr,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const amountRaw = amount ? parseUnits(amount, USDC_DECIMALS) : 0n;
  const usdcBalanceFmt = usdcBalance
    ? (Number(usdcBalance) / 10 ** USDC_DECIMALS).toFixed(2)
    : "—";

  async function handleShield() {
    if (!address || !amount || amountRaw === 0n) return;
    setIsTxing(true);
    setSteps([
      { id: "approve", label: "Approve USDC spend", status: "active" },
      { id: "shield", label: "Shield into cUSDC", status: "pending" },
    ]);
    try {
      await writeContractAsync({
        address: usdcAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [cusdcAddr, amountRaw],
      });
      setSteps((s) => s.map((x) => x.id === "approve" ? { ...x, status: "done" } : x.id === "shield" ? { ...x, status: "active" } : x));

      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "shield",
        args: [amountRaw],
      });
      setSteps((s) => s.map((x) => x.id === "shield" ? { ...x, status: "done" } : x));
      toast.success(`${amount} USDC shielded`);
      setAmount("");
      setTimeout(() => setSteps([]), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg.slice(0, 80));
      setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally {
      setIsTxing(false);
    }
  }

  async function handleUnshield() {
    if (!address || !amount || amountRaw === 0n || !instance) return;
    setIsTxing(true);
    setSteps([
      { id: "encrypt", label: "Encrypt amount", status: "active" },
      { id: "request", label: "Request unshield", status: "pending" },
      { id: "wait", label: "Awaiting KMS decryption", status: "pending" },
    ]);
    try {
      const { handle, proof } = await encrypt64(instance, cusdcAddr, address, amountRaw);
      setSteps((s) => s.map((x) => x.id === "encrypt" ? { ...x, status: "done" } : x.id === "request" ? { ...x, status: "active" } : x));

      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "requestUnshield",
        args: [handle, proof],
      });
      setSteps((s) => s.map((x) => x.id === "request" ? { ...x, status: "done" } : x.id === "wait" ? { ...x, status: "active" } : x));
      toast("Unshield requested — KMS will finalize shortly", { icon: "🔓" });
      setAmount("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg.slice(0, 80));
      setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally {
      setIsTxing(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Shield / Unshield" showBack={false} />

      <div className="flex flex-col gap-5 px-4">
        {/* Tab pills */}
        <div className="flex gap-2 p-1 glass-card rounded-2xl">
          {(["shield", "unshield"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount(""); setSteps([]); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all duration-200 ${
                tab === t
                  ? "bg-amber-500 text-black shadow-accent-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Balance info */}
        {tab === "shield" && (
          <div className="flex justify-between items-center text-xs text-white/40">
            <span>USDC balance</span>
            <span className="font-mono">{usdcBalanceFmt} USDC</span>
          </div>
        )}

        {/* Keypad */}
        <GlassCard padding="md">
          <NumericKeypad value={amount} onChange={setAmount} />
        </GlassCard>

        {/* FHE badge */}
        <div className="flex justify-center">
          <FHEStatusPill status={isTxing ? "encrypting" : "idle"} />
        </div>

        {/* Tx steps */}
        {steps.length > 0 && (
          <GlassCard padding="md">
            <TxStatus steps={steps} />
          </GlassCard>
        )}

        {/* Note for unshield */}
        {tab === "unshield" && (
          <SectionLabel>Two-step process</SectionLabel>
        )}
        {tab === "unshield" && (
          <p className="text-xs text-white/30 text-center leading-relaxed px-2">
            Unshielding requires the Zama KMS to sign the decrypted amount. The USDC release happens after finalization.
          </p>
        )}

        {/* CTA */}
        <Button
          fullWidth
          size="lg"
          isLoading={isTxing}
          disabled={!amount || amountRaw === 0n || (tab === "unshield" && !isReady)}
          onClick={tab === "shield" ? handleShield : handleUnshield}
        >
          {tab === "shield" ? `Shield ${amount || "0"} USDC` : `Request Unshield`}
        </Button>
      </div>
    </AppShell>
  );
}
