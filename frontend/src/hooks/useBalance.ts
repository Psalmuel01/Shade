"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { ConfidentialUSDCABI } from "@/lib/abis/ConfidentialUSDC";
import { getAddress } from "@/lib/addresses";
import { formatUSDC } from "@/lib/format";
import { useFhevm } from "@/lib/fhevm";

export function useBalance() {
  const { address, chainId } = useAccount();
  const { instance, isReady } = useFhevm();
  const [isRevealed, setIsRevealed] = useState(false);
  const [decryptedValue, setDecryptedValue] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const { signTypedDataAsync } = useSignTypedData();

  const cusdcAddr = getAddress(chainId ?? 31337, "ConfidentialUSDC");

  const { data: handle, isLoading: isHandleLoading } = useReadContract({
    address: cusdcAddr,
    abi: ConfidentialUSDCABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  const reveal = useCallback(async () => {
    if (!address || !chainId) return;
    if (!instance) {
      const { default: toast } = await import("react-hot-toast");
      toast.error("Encryption engine not ready — try reconnecting your wallet");
      return;
    }
    if (!handle) return;

    // Zero handle = account has never shielded; balance is 0, no gateway call needed
    if (handle === ZERO_HANDLE || handle === "0x") {
      setDecryptedValue("0.00");
      setIsRevealed(true);
      return;
    }
    if (isRevealed) {
      setIsRevealed(false);
      setDecryptedValue(null);
      return;
    }
    setIsDecrypting(true);
    try {
      const { privateKey, publicKey } = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 1;
      const eip712 = instance.createEIP712(publicKey, [cusdcAddr], startTimestamp, durationDays);
      // wagmi's signTypedDataAsync is structurally compatible but the generic types don't align
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await signTypedDataAsync(eip712 as any);
      const result = await instance.userDecrypt(
        [{ handle: handle as string, contractAddress: cusdcAddr }],
        privateKey,
        publicKey,
        sig,
        [cusdcAddr],
        address,
        startTimestamp,
        durationDays,
      );
      const raw = Object.values(result)[0];
      const val = typeof raw === "bigint" ? raw : BigInt(0);
      setDecryptedValue(formatUSDC(val));
      setIsRevealed(true);
    } catch (err) {
      console.error("[Shade] balance decrypt failed:", err);
      const { default: toast } = await import("react-hot-toast");
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Decrypt failed: ${msg.slice(0, 80)}`);
    } finally {
      setIsDecrypting(false);
    }
  }, [instance, address, handle, chainId, cusdcAddr, isRevealed, signTypedDataAsync]);

  return {
    handle: handle as `0x${string}` | undefined,
    isRevealed,
    decryptedValue,
    reveal,
    isLoading: isHandleLoading || isDecrypting,
    isReady,
  };
}
