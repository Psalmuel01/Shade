"use client";

import type { FhevmInstance } from "./fhevm";

function toHex(arr: Uint8Array): `0x${string}` {
  return ("0x" + Buffer.from(arr).toString("hex")) as `0x${string}`;
}

export async function encrypt64(
  instance: FhevmInstance,
  contractAddr: string,
  userAddr: string,
  value: bigint | number,
): Promise<{ handle: `0x${string}`; proof: `0x${string}` }> {
  const input = instance.createEncryptedInput(contractAddr, userAddr);
  (input as unknown as { add64: (n: bigint | number) => unknown }).add64(value);
  const enc = await (input as unknown as { encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> }).encrypt();
  return { handle: toHex(enc.handles[0]), proof: toHex(enc.inputProof) };
}

export async function encrypt64AndAddress(
  instance: FhevmInstance,
  contractAddr: string,
  userAddr: string,
  value: bigint | number,
  addr: string,
): Promise<{ amountHandle: `0x${string}`; recipientHandle: `0x${string}`; proof: `0x${string}` }> {
  const rawInput = instance.createEncryptedInput(contractAddr, userAddr) as unknown as {
    add64: (n: bigint | number) => unknown;
    addAddress: (s: string) => unknown;
    encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
  };
  rawInput.add64(value);
  rawInput.addAddress(addr);
  const enc = await rawInput.encrypt();
  return {
    amountHandle: toHex(enc.handles[0]),
    recipientHandle: toHex(enc.handles[1]),
    proof: toHex(enc.inputProof),
  };
}
