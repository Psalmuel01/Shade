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

  const reveal = useCallback(async () => {
    if (!instance || !address || !handle || !chainId) return;
    if (isRevealed) {
      setIsRevealed(false);
      setDecryptedValue(null);
      return;
    }
    setIsDecrypting(true);
    try {
      const { privateKey, publicKey } = instance.generateKeypair();
      const eip712 = instance.createEIP712(publicKey, [cusdcAddr]);
      const sig = await signTypedDataAsync(eip712 as Parameters<typeof signTypedDataAsync>[0]);
      const result = await instance.userDecrypt(
        [handle as string],
        privateKey,
        publicKey,
        sig,
        [cusdcAddr],
        address,
      );
      const val = Object.values(result)[0] ?? BigInt(0);
      setDecryptedValue(formatUSDC(val));
      setIsRevealed(true);
    } catch (err) {
      console.error("[Shade] balance decrypt failed:", err);
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
