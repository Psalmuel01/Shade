"use client";

import { useEffect, useState, useRef } from "react";
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
  | "payroll_claimed"
  | "template_created"
  | "run_created"
  | "run_funded"
  | "run_executed";

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
  parseAbiItem("event TemplateCreated(uint256 indexed templateId, address indexed employer)"),
  parseAbiItem("event RunCreated(uint256 indexed runId, uint256 indexed templateId)"),
  parseAbiItem("event RunFunded(uint256 indexed runId)"),
  parseAbiItem("event RunExecuted(uint256 indexed runId)"),
] as const;

const DEPLOY_BLOCK = 11120683n;
const CACHE_KEY = (addr: string, cid: number) => `shade:activity:${cid}:${addr.toLowerCase()}`;

type CacheEntry = { items: ActivityItem[]; lastBlock: number };

function loadCache(addr: string, cid: number): CacheEntry {
  if (typeof window === "undefined") return { items: [], lastBlock: 0 };
  try {
    const raw = localStorage.getItem(CACHE_KEY(addr, cid));
    if (!raw) return { items: [], lastBlock: 0 };
    const parsed = JSON.parse(raw);
    // handle old format (plain array)
    if (Array.isArray(parsed)) return { items: parsed, lastBlock: 0 };
    return { items: parsed.items ?? [], lastBlock: parsed.lastBlock ?? 0 };
  } catch { return { items: [], lastBlock: 0 }; }
}

function saveCache(addr: string, cid: number, items: ActivityItem[], lastBlock: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY(addr, cid), JSON.stringify({ items, lastBlock })); } catch { }
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

  // Payroll cross-referencing: RunFunded/RunExecuted only carry runId, not employer.
  // Pass 1: collect template IDs owned by this user.
  const userTemplateIds = new Set<string>();
  for (const log of decoded) {
    if (log.eventName === "TemplateCreated" && log.args?.employer?.toLowerCase() === userAddr)
      userTemplateIds.add(String(log.args.templateId));
  }
  // Pass 2: collect run IDs created under those templates.
  const userRunIds = new Set<string>();
  for (const log of decoded) {
    if (log.eventName === "RunCreated" && userTemplateIds.has(String(log.args.templateId)))
      userRunIds.add(String(log.args.runId));
  }

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
    const ev = log.eventName;
    let item: ActivityItem | null = null;

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
    else if (ev === "TemplateCreated" && args.employer?.toLowerCase() === userAddr)
      item = { ...base, type: "template_created", label: "Payroll Template Created", sublabel: `Template #${args.templateId}` };
    else if (ev === "RunCreated" && userTemplateIds.has(String(args.templateId)))
      item = { ...base, type: "run_created", label: "Payroll Run Created", sublabel: `Run #${args.runId} · Template #${args.templateId}` };
    else if (ev === "RunFunded" && userRunIds.has(String(args.runId)))
      item = { ...base, type: "run_funded", label: "Payroll Run Funded", sublabel: `Run #${args.runId}` };
    else if (ev === "RunExecuted" && userRunIds.has(String(args.runId)))
      item = { ...base, type: "run_executed", label: "Payroll Executed", sublabel: `Run #${args.runId} — employees credited` };

    if (item) items.push(item);
  }
  return items;
}

export function useActivity() {
  const { address, chainId } = useAccount();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Track the last block we've already indexed so the watcher only fetches the diff
  const lastBlockRef = useRef<bigint>(0n);

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

    // Load cache → show instantly
    const cache = loadCache(userAddr, cid);
    if (cache.items.length > 0) {
      setItems(cache.items);
      lastBlockRef.current = BigInt(cache.lastBlock);
    }

    let active = true;

    // --- Initial full fetch ---
    async function initialFetch() {
      setIsLoading(true);
      try {
        const latestBlock = await client!.getBlockNumber();
        const fromBlock = lastBlockRef.current > 0n ? lastBlockRef.current + 1n : DEPLOY_BLOCK;
        const nowTs = Math.floor(Date.now() / 1000);

        let rawLogs: unknown[];
        try {
          rawLogs = await client!.getLogs({ address: contracts, fromBlock, toBlock: latestBlock });
        } catch {
          // RPC rejected large range — fall back to recent 10k blocks
          rawLogs = await client!.getLogs({ address: contracts, fromBlock: latestBlock - 10_000n, toBlock: latestBlock });
        }

        if (!active) return;

        const newItems = parseLogs(rawLogs, userAddr, nowTs, Number(latestBlock));

        if (newItems.length > 0 || cache.items.length === 0) {
          const seen = new Set<string>();
          const merged = [...cache.items, ...newItems]
            .filter(it => { if (seen.has(it.id)) return false; seen.add(it.id); return true; })
            .sort((a, b) => b.blockNumber - a.blockNumber)
            .slice(0, 50);

          setItems(merged);
          saveCache(userAddr, cid, merged, Number(latestBlock));
          lastBlockRef.current = latestBlock;
        } else {
          lastBlockRef.current = latestBlock;
        }
      } catch {
        // cached items remain visible
      } finally {
        if (active) setIsLoading(false);
      }
    }

    // --- Block watcher: only fetches the diff since last seen block ---
    const unwatch = client.watchBlockNumber({
      onBlockNumber: async (blockNumber) => {
        if (!active || blockNumber <= lastBlockRef.current) return;
        const fromBlock = lastBlockRef.current + 1n;
        lastBlockRef.current = blockNumber;
        try {
          const rawLogs = await client!.getLogs({ address: contracts, fromBlock, toBlock: blockNumber });
          if (!active) return;
          if (!rawLogs.length) return;

          const nowTs = Math.floor(Date.now() / 1000);
          const newItems = parseLogs(rawLogs, userAddr, nowTs, Number(blockNumber));
          if (!newItems.length || !active) return;

          setItems(prev => {
            const seen = new Set(prev.map(i => i.id));
            const added = newItems.filter(i => !seen.has(i.id));
            if (!added.length) return prev;
            const merged = [...added, ...prev].slice(0, 50);
            saveCache(userAddr, cid, merged, Number(blockNumber));
            return merged;
          });
        } catch {
          // ignore watcher errors — initial fetch already has history
        }
      },
      poll: true,
      pollingInterval: 12_000, // one Sepolia block
    });

    initialFetch();

    return () => {
      active = false;
      unwatch();
    };
  }, [address, chainId]);

  return { items, isLoading };
}
