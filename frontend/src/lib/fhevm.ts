"use client";

import { createContext, useContext } from "react";

export type HandleContractPair = {
  handle: Uint8Array | string;
  contractAddress: string;
};

export type EIP712Payload = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type FhevmInstance = {
  createEncryptedInput: (contractAddr: string, userAddr: string) => {
    add64: (n: bigint | number) => { add64: unknown; addAddress: (addr: string) => unknown; encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> };
    addAddress: (addr: string) => { encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> };
    encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
  };
  generateKeypair: () => { privateKey: string; publicKey: string };
  createEIP712: (publicKey: string, contractAddresses: string[], startTimestamp: string | number, durationDays: string | number) => EIP712Payload;
  userDecrypt: (handles: HandleContractPair[], privateKey: string, publicKey: string, signature: string, contractAddresses: string[], userAddress: string, startTimestamp: string | number, durationDays: string | number) => Promise<Record<string, bigint | boolean | string>>;
  publicDecrypt: (handles: (string | Uint8Array)[]) => Promise<Record<string, bigint | boolean | string>>;
};

export const FhevmContext = createContext<{ instance: FhevmInstance | null; isReady: boolean }>({
  instance: null,
  isReady: false,
});

let _instance: FhevmInstance | null = null;

export async function initFhevm(chainId: number, provider: unknown): Promise<FhevmInstance> {
  if (_instance) return _instance;

  const { createInstance, SepoliaConfigV2, initSDK } = await import("@zama-fhe/relayer-sdk/web");
  await initSDK(); // must run before createInstance — boots the TFHE-rs WASM module
  const inst = await createInstance({
    ...SepoliaConfigV2,
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
