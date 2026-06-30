"use client";

import { useCallback } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { usePathname } from "next/navigation";
import { useTxQueue } from "@/lib/txQueue";

type WriteArgs = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export function useTrackedWrite() {
  const { writeContractAsync: _write } = useWriteContract();
  const { addTx } = useTxQueue();
  const pathname = usePathname();
  const { chainId } = useAccount();

  const writeContractAsync = useCallback(
    async (params: WriteArgs, label: string): Promise<`0x${string}`> => {
      const hash = await _write(params);
      addTx(label, hash, pathname, chainId);
      return hash;
    },
    [_write, addTx, pathname, chainId],
  );

  return { writeContractAsync };
}
