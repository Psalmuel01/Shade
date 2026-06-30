"use client";

import { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { createPublicClient, http, parseAbiItem, type AbiEvent } from "viem";
import { sepolia } from "viem/chains";
import { PrivateEscrowABI } from "@/lib/abis/PrivateEscrow";
import { PayrollVaultABI } from "@/lib/abis/PayrollVault";
import { getAddress } from "@/lib/addresses";

const DEPLOY_BLOCK = 11120683n;
const SEPOLIA_ID   = 11155111;

function makeClient() {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  return createPublicClient({
    chain: sepolia,
    transport: http(rpc || "https://sepolia.drpc.org"),
  });
}

const CHUNK = 2000n;

async function countLogs(address: `0x${string}`, eventSig: string): Promise<number> {
  const client = makeClient();
  const event = parseAbiItem(eventSig) as AbiEvent;

  // First try a single call for the full range — works on some RPCs
  try {
    const logs = await client.getLogs({ address, event, fromBlock: DEPLOY_BLOCK, toBlock: "latest" });
    return logs.length;
  } catch { /* fall through to chunked */ }

  // Chunk the range so even strict RPCs (Infura free) can handle it
  try {
    const latest = await client.getBlockNumber();
    let total = 0;
    for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) {
      const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      try {
        const logs = await client.getLogs({ address, event, fromBlock: from, toBlock: to });
        total += logs.length;
      } catch { /* skip this chunk, keep going */ }
    }
    return total;
  } catch {
    return 0;
  }
}

export type GlobalStats = {
  escrowCount: number;
  runCount: number;
  transferCount: number;
  shieldCount: number;
  stealthCount: number;
  proofCount: number;
  isLoading: boolean;
};

export function useGlobalStats(): GlobalStats {
  const cid = SEPOLIA_ID;
  const escrowAddr  = getAddress(cid, "PrivateEscrow");
  const vaultAddr   = getAddress(cid, "PayrollVault");
  const cusdcAddr   = getAddress(cid, "ConfidentialUSDC");
  const stealthAddr = getAddress(cid, "StealthSend");
  const proverAddr  = getAddress(cid, "BalanceProver");

  const { data: escrowCount } = useReadContract({
    address: escrowAddr, abi: PrivateEscrowABI, functionName: "escrowCount",
    query: { refetchInterval: 30_000 },
  });
  const { data: runCount } = useReadContract({
    address: vaultAddr, abi: PayrollVaultABI, functionName: "runCount",
    query: { refetchInterval: 30_000 },
  });
  const { data: templateCount } = useReadContract({
    address: vaultAddr, abi: PayrollVaultABI, functionName: "templateCount",
    query: { refetchInterval: 30_000 },
  });

  const [transferCount, setTransferCount] = useState<number | null>(null);
  const [shieldCount,   setShieldCount]   = useState<number | null>(null);
  const [stealthCount,  setStealthCount]  = useState<number | null>(null);
  const [proofCount,    setProofCount]    = useState<number | null>(null);

  useEffect(() => {
    countLogs(cusdcAddr,   "event Transfer(address indexed from, address indexed to)").then(setTransferCount);
    countLogs(cusdcAddr,   "event Shielded(address indexed account)").then(setShieldCount);
    countLogs(stealthAddr, "event StealthSent(uint256 indexed id, address indexed sender)").then(setStealthCount);
    countLogs(proverAddr,  "event ProofPublished(address indexed prover, bool result, uint256 timestamp)").then(setProofCount);
  }, [cusdcAddr, stealthAddr, proverAddr]);

  const isLoading =
    escrowCount === undefined ||
    runCount === undefined ||
    transferCount === null ||
    shieldCount === null ||
    stealthCount === null ||
    proofCount === null;

  return {
    escrowCount:   Number(escrowCount   ?? 0n),
    runCount:      Number(runCount      ?? 0n),
    templateCount: Number(templateCount ?? 0n),
    transferCount: transferCount ?? 0,
    shieldCount:   shieldCount  ?? 0,
    stealthCount:  stealthCount ?? 0,
    proofCount:    proofCount   ?? 0,
    isLoading,
  };
}
