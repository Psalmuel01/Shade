"use client";

import { createContext, useContext } from "react";

export type FhevmInstance = {
  createEncryptedInput: (contractAddr: string, userAddr: string) => {
    add64: (n: bigint | number) => { add64: unknown; addAddress: (addr: string) => unknown; encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> };
    addAddress: (addr: string) => { encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> };
    encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
  };
  generateKeypair: () => { privateKey: string; publicKey: string };
  createEIP712: (publicKey: string, contractAddresses: string[], startTimestamp?: number, durationDays?: number) => unknown;
  userDecrypt: (handles: (string | Uint8Array)[], privateKey: string, publicKey: string, signature: string, contractAddresses: string[], userAddress: string, startTimestamp?: number, durationDays?: number) => Promise<Record<string, bigint>>;
  publicDecrypt: (handles: (string | Uint8Array)[]) => Promise<{ abiEncodedClearValues: string; decryptionProof: string }>;
};

export const FhevmContext = createContext<{ instance: FhevmInstance | null; isReady: boolean }>({
  instance: null,
  isReady: false,
});

let _instance: FhevmInstance | null = null;

export async function initFhevm(chainId: number, provider: unknown): Promise<FhevmInstance> {
  if (_instance) return _instance;

  const { createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/web");
  const inst = await createInstance({
    ...SepoliaConfig,
    network: provider as Parameters<typeof createInstance>[0]["network"],
    chainId,
  });
  _instance = inst as unknown as FhevmInstance;
  return _instance;
}

export function resetFhevm() {
  _instance = null;
}

export function useFhevm() {
  return useContext(FhevmContext);
}
