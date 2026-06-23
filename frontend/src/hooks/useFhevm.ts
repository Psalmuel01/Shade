"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { FhevmContext, FhevmInstance, initFhevm, resetFhevm } from "@/lib/fhevm";

export { FhevmContext };

export function useFhevmProvider() {
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const init = useCallback(async () => {
    if (!isConnected || !chainId || !walletClient) return;
    try {
      const provider = (walletClient as unknown as { transport: unknown }).transport;
      const inst = await initFhevm(chainId, provider ?? (typeof window !== "undefined" ? (window as unknown as { ethereum: unknown }).ethereum : undefined));
      setInstance(inst);
      setIsReady(true);
    } catch (err) {
      console.error("[Shade] fhEVM init failed:", err);
    }
  }, [isConnected, chainId, walletClient]);

  useEffect(() => {
    if (isConnected) {
      init();
    } else {
      setInstance(null);
      setIsReady(false);
      resetFhevm();
    }
  }, [isConnected, init]);

  return { instance, isReady };
}
