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
      // Prefer window.ethereum (EIP-1193) over wagmi's internal transport object
      const eth = typeof window !== "undefined" ? (window as unknown as { ethereum: unknown }).ethereum : undefined;
      const provider = eth ?? (walletClient as unknown as { transport: unknown }).transport;
      const inst = await initFhevm(chainId, provider);
      setInstance(inst);
      setIsReady(true);
    } catch (err) {
      console.error("[Shade] fhEVM init failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const { default: toast } = await import("react-hot-toast");
      toast.error(`Encryption engine failed: ${msg.slice(0, 80)}`, { duration: 6000 });
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
