"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { useFhevm } from "@/lib/fhevm";
import { useTrackedWrite } from "@/hooks/useTrackedWrite";
import toast from "react-hot-toast";

const LS_KEY = "shade:pending_unshields";

type StoredUnshield = {
  requestId: string;
  address: string;
  chainId: number;
  ts: number;
};

function loadStored(address: string, chainId: number): StoredUnshield[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StoredUnshield[]).filter(
      (u) => u.address.toLowerCase() === address.toLowerCase() && u.chainId === chainId,
    );
  } catch { return []; }
}

export function savePendingUnshield(requestId: bigint, address: string, chainId: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all: StoredUnshield[] = raw ? JSON.parse(raw) : [];
    const entry: StoredUnshield = { requestId: requestId.toString(), address, chainId, ts: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify([...all, entry]));
  } catch {}
}

function removeStored(requestId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const next = (JSON.parse(raw) as StoredUnshield[]).filter((u) => u.requestId !== requestId);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {}
}

async function retryPublicDecrypt(
  instance: NonNullable<ReturnType<typeof useFhevm>["instance"]>,
  handle: string,
  maxAttempts = 12,
  delayMs = 5000,
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await instance.publicDecrypt([handle]);
    } catch (e) {
      if (i === maxAttempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("KMS timeout");
}

export function usePendingUnshield() {
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const { writeContractAsync } = useTrackedWrite();
  const client = usePublicClient();
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const cid = chainId ?? 31337;
  const cusdcAddr = getAddress(cid, "ConfidentialUSDC");
  const pending = address && chainId ? loadStored(address, chainId) : [];

  const finalize = useCallback(async (requestId: string) => {
    if (!instance || !client || !address) return;
    setIsFinalizing(true);
    setFinalizingId(requestId);
    try {
      // Read the handle from the contract
      const data = await client.readContract({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "pendingUnshields",
        args: [BigInt(requestId)],
      }) as [string, `0x${string}`, boolean];

      const [, amountHandle, finalized] = data;
      if (finalized) {
        toast("This unshield is already finalized");
        removeStored(requestId);
        return;
      }

      toast("Waiting for KMS decryption — this may take 30–60 seconds…", { duration: 30000 });
      const { abiEncodedClearValues, decryptionProof } = await retryPublicDecrypt(instance, amountHandle);

      await writeContractAsync({
        address: cusdcAddr,
        abi: ConfidentialUSDCABI,
        functionName: "finalizeUnshield",
        args: [BigInt(requestId), abiEncodedClearValues, decryptionProof],
      }, "Finalize Unshield");

      removeStored(requestId);
      toast.success("Unshield finalized — USDC returned to your wallet");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize failed";
      toast.error(msg.includes("KMS") ? "KMS timeout — try again in a few minutes" : msg.slice(0, 80));
    } finally {
      setIsFinalizing(false);
      setFinalizingId(null);
    }
  }, [instance, client, address, cusdcAddr, writeContractAsync]);

  return { pending, finalize, isFinalizing, finalizingId, isReady };
}
