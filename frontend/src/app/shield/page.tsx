"use client";

import { useState } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import { parseUnits, formatUnits } from "viem";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { FHEStatusPill } from "@/components/ui/FHEStatusPill";
import { TxStatus, TxStep } from "@/components/ui/TxStatus";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { useBalance } from "@/hooks/useBalance";
import { usePendingUnshield, savePendingUnshield } from "@/hooks/usePendingUnshield";
import { encrypt64 } from "@/lib/shade";
import { Clock, Loader2, ExternalLink } from "lucide-react";
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
  const { writeContractAsync } = useTrackedWrite();
  const { isRevealed, decryptedValue, reveal, isLoading: balanceLoading } = useBalance();
  const { pending, finalize, isFinalizing, finalizingId } = usePendingUnshield();
  const client = usePublicClient();

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

  const usdcBalanceFmt = usdcBalance !== undefined
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toFixed(2)
    : undefined;

  const shieldExceedsBalance =
    tab === "shield" && usdcBalance !== undefined && amountRaw > 0n && amountRaw > usdcBalance;
  const unshieldExceedsBalance =
    tab === "unshield" && isRevealed && decryptedValue != null && amount
      ? parseFloat(amount) > parseFloat(decryptedValue.replace(/,/g, ""))
      : false;

  const validationError =
    shieldExceedsBalance ? "Exceeds USDC balance" :
    unshieldExceedsBalance ? "Exceeds cUSDC balance" :
    undefined;

  function handleMax() {
    if (tab === "shield" && usdcBalance !== undefined) {
      setAmount(formatUnits(usdcBalance, USDC_DECIMALS));
    } else if (tab === "unshield" && isRevealed && decryptedValue) {
      setAmount(decryptedValue.replace(/,/g, ""));
    }
  }

  async function handleShield() {
    if (!address || !amount || amountRaw === 0n || shieldExceedsBalance) return;
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
      }, "Approve USDC");
      setSteps((s) => s.map((x) =>
        x.id === "approve" ? { ...x, status: "done" } :
        x.id === "shield" ? { ...x, status: "active" } : x
      ));
      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "shield",
        args: [amountRaw],
      }, `Shield ${amount} USDC`);
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
    if (!address || !amount || amountRaw === 0n || !instance || !client || unshieldExceedsBalance || !chainId) return;
    setIsTxing(true);
    setSteps([
      { id: "encrypt", label: "Encrypt amount", status: "active" },
      { id: "request", label: "Request unshield", status: "pending" },
    ]);
    try {
      // Read current nonce so we can predict the requestId
      const currentNonce = await client.readContract({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "unshieldNonce",
      });
      const requestId = (currentNonce as bigint) + 1n;

      const { handle, proof } = await encrypt64(instance, cusdcAddr, address, amountRaw);
      setSteps((s) => s.map((x) =>
        x.id === "encrypt" ? { ...x, status: "done" } :
        x.id === "request" ? { ...x, status: "active" } : x
      ));

      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "requestUnshield",
        args: [handle, proof],
      }, `Unshield ${amount} cUSDC (step 1)`);

      setSteps((s) => s.map((x) => x.id === "request" ? { ...x, status: "done" } : x));

      // Save for finalization — user must come back and tap Finalize after KMS processes
      savePendingUnshield(requestId, address, chainId);
      toast("Step 1 done — cUSDC burned. Tap Finalize below once KMS is ready to release your USDC.", { duration: 8000, icon: "🔓" });
      setAmount("");
      setTimeout(() => setSteps([]), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg.slice(0, 80));
      setSteps((s) => s.map((x) => x.status === "active" ? { ...x, status: "error" } : x));
    } finally {
      setIsTxing(false);
    }
  }

  const canMax =
    (tab === "shield" && usdcBalance !== undefined && usdcBalance > 0n) ||
    (tab === "unshield" && isRevealed && !!decryptedValue);

  return (
    <AppShell>
      <PageHeader title="Shield / Unshield" showBack={false} />

      <div className="flex flex-col gap-5 px-4 pb-6 w-full md:max-w-2xl md:mx-auto md:px-8 md:pb-8">
        {/* Tab pills */}
        <div className="flex gap-2 p-1 glass-card rounded-2xl">
          {(["shield", "unshield"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (isTxing) { toast("Transaction in progress — wait for confirmation", { icon: "⏳" }); return; }
                setTab(t); setAmount(""); setSteps([]);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all duration-200 ${
                tab === t
                  ? "bg-amber-500 text-black shadow-accent-sm"
                  : isTxing
                  ? "text-white/20 cursor-not-allowed"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Pending unshields — show on unshield tab */}
        {tab === "unshield" && pending.length > 0 && (
          <>
            <SectionLabel>Pending Finalization</SectionLabel>
            {pending.map((entry) => (
              <GlassCard key={entry.requestId} padding="md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#FAFAFA]">Unshield request #{entry.requestId}</p>
                    <p className="text-xs text-white/40 mt-0.5">cUSDC burned — waiting for KMS to release USDC</p>
                  </div>
                  <Button
                    size="sm"
                    isLoading={isFinalizing && finalizingId === entry.requestId}
                    disabled={isFinalizing || !isReady}
                    onClick={() => finalize(entry.requestId)}
                  >
                    {isFinalizing && finalizingId === entry.requestId ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> KMS…</>
                    ) : "Finalize"}
                  </Button>
                </div>
              </GlassCard>
            ))}
          </>
        )}

        {/* Balance row — USDC on shield tab, cUSDC on unshield tab */}
        {tab === "shield" && (
          <>
            <GlassCard padding="sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/40">USDC balance</span>
                <span className="text-sm font-mono text-[#FAFAFA]">
                  {usdcBalanceFmt !== undefined ? `${usdcBalanceFmt} USDC` : "—"}
                </span>
              </div>
            </GlassCard>
            <div className="flex flex-col gap-1.5 px-1">
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between hover:bg-white/[0.03] rounded-lg px-1 py-0.5 transition-colors"
              >
                <span className="text-xs text-white/30">Need test USDC?</span>
                <span className="text-xs text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors">
                  Circle faucet <ExternalLink className="h-3 w-3" />
                </span>
              </a>
              <a
                href="https://faucet.quicknode.com/ethereum/sepolia"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between hover:bg-white/[0.03] rounded-lg px-1 py-0.5 transition-colors"
              >
                <span className="text-xs text-white/30">Need Sepolia ETH for gas?</span>
                <span className="text-xs text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors">
                  QuickNode faucet <ExternalLink className="h-3 w-3" />
                </span>
              </a>
            </div>
          </>
        )}
        {tab === "unshield" && (
          <GlassCard padding="sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/40">cUSDC balance</span>
              <EncryptedBadge
                size="sm"
                value={decryptedValue ?? undefined}
                isRevealed={isRevealed}
                onReveal={reveal}
                isLoading={balanceLoading}
              />
            </div>
          </GlassCard>
        )}

        {/* Keypad */}
        <GlassCard padding="md">
          <NumericKeypad
            value={amount}
            onChange={setAmount}
            unit={tab === "shield" ? "USDC" : "cUSDC"}
            disabled={tab === "unshield" && !isRevealed}
            maxValue={
              tab === "shield"
                ? usdcBalanceFmt
                : isRevealed && decryptedValue
                ? decryptedValue
                : undefined
            }
            onMax={canMax ? handleMax : undefined}
            error={validationError}
          />
        </GlassCard>

        {/* FHE badge */}
        <div className="flex justify-center">
          <FHEStatusPill status={isTxing ? "encrypting" : "idle"} />
        </div>

        {steps.length > 0 && (
          <GlassCard padding="md">
            <TxStatus steps={steps} />
          </GlassCard>
        )}

        {tab === "unshield" && !isRevealed ? (
          <Button fullWidth size="lg" onClick={reveal} isLoading={balanceLoading}>
            Reveal Balance to Continue
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            isLoading={isTxing}
            disabled={!amount || amountRaw === 0n || !!validationError || (tab === "unshield" && !isReady)}
            onClick={tab === "shield" ? handleShield : handleUnshield}
          >
            {tab === "shield" ? `Shield ${amount || "0"} USDC` : `Request Unshield`}
          </Button>
        )}

        {tab === "unshield" && !isRevealed && (
          <p className="text-xs text-white/40 text-center -mt-2 leading-relaxed">
            Balance must be revealed so we can verify you have enough to unshield.
          </p>
        )}

        {tab === "unshield" && isRevealed && (
          <>
            <SectionLabel>Two-step process</SectionLabel>
            <p className="text-xs text-white/30 text-center leading-relaxed px-2">
              Request burns your cUSDC and submits a decryption request to the Zama KMS.
              Finalize must be done separately — the KMS typically takes 30–120 seconds to sign.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
