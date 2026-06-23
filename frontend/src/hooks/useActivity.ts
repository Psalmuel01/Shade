"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, http, parseAbiItem, parseEventLogs } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { getAddress } from "@/lib/addresses";

export type ActivityType =
  | "shield"
  | "unshield_request"
  | "unshield"
  | "transfer_in"
  | "transfer_out"
  | "escrow_created"
  | "escrow_funded"
  | "escrow_released"
  | "stealth_sent"
  | "proof_published"
  | "payroll_claimed";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  label: string;
  sublabel?: string;
  blockNumber: number;
  txHash: `0x${string}`;
  ts?: number;
};

const EVENTS_ABI = [
  parseAbiItem("event Shielded(address indexed account)"),
  parseAbiItem("event UnshieldRequested(address indexed account, uint256 indexed requestId)"),
  parseAbiItem("event Unshielded(address indexed account, uint256 indexed requestId)"),
  parseAbiItem("event Transfer(address indexed from, address indexed to)"),
  parseAbiItem("event EscrowCreated(uint256 indexed id, address indexed depositor, address indexed recipient, address arbiter)"),
  parseAbiItem("event EscrowFunded(uint256 indexed id)"),
  parseAbiItem("event EscrowReleased(uint256 indexed id)"),
  parseAbiItem("event StealthSent(uint256 indexed id, address indexed sender)"),
  parseAbiItem("event ProofPublished(address indexed prover, bool result, uint256 timestamp)"),
  parseAbiItem("event Claimed(address indexed employee)"),
] as const;

// Known deployment block — avoids scanning millions of empty blocks.
const DEPLOY_BLOCK = 11120683n;
const CACHE_KEY = (addr: string, cid: number) => `shade:activity:${cid}:${addr.toLowerCase()}`;

function loadCache(addr: string, cid: number): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY(addr, cid));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCache(addr: string, cid: number, items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY(addr, cid), JSON.stringify(items)); } catch {}
}

function makeClient(chainId: number) {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  if (chainId === 11155111)
    return createPublicClient({ chain: sepolia, transport: http(rpc || "https://sepolia.drpc.org") });
  if (chainId === 31337)
    return createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLogs(rawLogs: any[], userAddr: string, nowTs: number, latestBlock: number): ActivityItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoded = parseEventLogs({ abi: EVENTS_ABI as any, logs: rawLogs }) as any[];
  const items: ActivityItem[] = [];

  for (const log of decoded) {
    const args = log.args ?? {};
    const blockNum = Number(log.blockNumber);
    const base = {
      id: `${log.transactionHash}-${log.logIndex}`,
      blockNumber: blockNum,
      txHash: log.transactionHash as `0x${string}`,
      ts: nowTs - (latestBlock - blockNum) * 12,
    };

    let item: ActivityItem | null = null;
    const ev = log.eventName;

    if (ev === "Shielded" && args.account?.toLowerCase() === userAddr)
      item = { ...base, type: "shield", label: "Shielded USDC", sublabel: "USDC → cUSDC" };
    else if (ev === "UnshieldRequested" && args.account?.toLowerCase() === userAddr)
      item = { ...base, type: "unshield_request", label: "Unshield Requested", sublabel: `Request #${args.requestId}` };
    else if (ev === "Unshielded" && args.account?.toLowerCase() === userAddr)
      item = { ...base, type: "unshield", label: "Unshield Finalized", sublabel: `cUSDC → USDC · #${args.requestId}` };
    else if (ev === "Transfer" && args.from?.toLowerCase() === userAddr)
      item = { ...base, type: "transfer_out", label: "Sent cUSDC", sublabel: `To ${String(args.to).slice(0, 6)}…${String(args.to).slice(-4)}` };
    else if (ev === "Transfer" && args.to?.toLowerCase() === userAddr && args.from?.toLowerCase() !== userAddr)
      item = { ...base, type: "transfer_in", label: "Received cUSDC", sublabel: `From ${String(args.from).slice(0, 6)}…${String(args.from).slice(-4)}` };
    else if (ev === "EscrowCreated" && args.depositor?.toLowerCase() === userAddr)
      item = { ...base, type: "escrow_created", label: "Escrow Created", sublabel: `To ${String(args.recipient).slice(0, 6)}…${String(args.recipient).slice(-4)}` };
    else if (ev === "EscrowCreated" && args.recipient?.toLowerCase() === userAddr)
      item = { ...base, type: "escrow_created", label: "Escrow Received", sublabel: `From ${String(args.depositor).slice(0, 6)}…${String(args.depositor).slice(-4)}` };
    else if (ev === "EscrowFunded")
      item = { ...base, type: "escrow_funded", label: "Escrow Funded", sublabel: `ID #${args.id}` };
    else if (ev === "EscrowReleased")
      item = { ...base, type: "escrow_released", label: "Escrow Released", sublabel: `ID #${args.id}` };
    else if (ev === "StealthSent" && args.sender?.toLowerCase() === userAddr)
      item = { ...base, type: "stealth_sent", label: "Stealth Send", sublabel: `ID #${args.id}` };
    else if (ev === "ProofPublished" && args.prover?.toLowerCase() === userAddr)
      item = { ...base, type: "proof_published", label: "Balance Proof", sublabel: args.result ? "Balance verified ✓" : "Below threshold" };
    else if (ev === "Claimed" && args.employee?.toLowerCase() === userAddr)
      item = { ...base, type: "payroll_claimed", label: "Payroll Claimed" };

    if (item) items.push(item);
  }

  return items;
}

export function useActivity() {
  const { address, chainId } = useAccount();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !chainId) return;

    const userAddr = address.toLowerCase();
    const cid = chainId;
    const client = makeClient(cid);
    if (!client) return;

    const contracts = [
      getAddress(cid, "ConfidentialUSDC"),
      getAddress(cid, "PrivateEscrow"),
      getAddress(cid, "StealthSend"),
      getAddress(cid, "BalanceProver"),
      getAddress(cid, "PayrollVault"),
    ] as `0x${string}`[];

    // Show cached items immediately
    const cached = loadCache(userAddr, cid);
    if (cached.length > 0) setItems(cached);

    let active = true;
    setIsLoading(true);

    (async () => {
      try {
        const latestBlock = await client.getBlockNumber();
        const nowTs = Math.floor(Date.now() / 1000);

        // Try to fetch all events since deployment in one call.
        // Falls back to last 10k blocks if the RPC rejects the large range.
        let rawLogs: unknown[];
        try {
          rawLogs = await client.getLogs({ address: contracts, fromBlock: DEPLOY_BLOCK, toBlock: latestBlock });
        } catch {
          rawLogs = await client.getLogs({ address: contracts, fromBlock: latestBlock - 10_000n, toBlock: latestBlock });
        }

        if (!active) return;

        const newItems = parseLogs(rawLogs, userAddr, nowTs, Number(latestBlock));
        newItems.sort((a, b) => b.blockNumber - a.blockNumber);

        if (newItems.length > 0) {
          setItems(newItems);
          saveCache(userAddr, cid, newItems);
        }
      } catch {
        // cached items remain visible
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => { active = false; };
  }, [address, chainId]);

  return { items, isLoading };
}
