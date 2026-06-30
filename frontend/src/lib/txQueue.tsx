"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export type TxStatus = "confirming" | "done" | "error";

export type TxRecord = {
  id: string;
  label: string;
  hash: `0x${string}`;
  status: TxStatus;
  href: string;
  ts: number;
  chainId?: number;
};

type TxQueueCtx = {
  txs: TxRecord[];
  addTx: (label: string, hash: `0x${string}`, href: string, chainId?: number) => string;
  completeTx: (id: string, status: "done" | "error") => void;
};

const Ctx = createContext<TxQueueCtx>({
  txs: [],
  addTx: () => "",
  completeTx: () => {},
});

const LS_KEY = "shade:txq";

function load(): TxRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TxRecord[];
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    return parsed.filter((t) => t.ts > cutoff && t.status === "confirming");
  } catch {
    return [];
  }
}

function persist(txs: TxRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(txs.filter((t) => t.status === "confirming")));
  } catch {}
}

export function TxQueueProvider({ children }: { children: React.ReactNode }) {
  const [txs, setTxs] = useState<TxRecord[]>([]);
  const seq = useRef(0);

  useEffect(() => { setTxs(load()); }, []);

  const mutate = useCallback((fn: (prev: TxRecord[]) => TxRecord[]) => {
    setTxs((prev) => { const next = fn(prev); persist(next); return next; });
  }, []);

  const addTx = useCallback((label: string, hash: `0x${string}`, href: string, chainId?: number): string => {
    const id = `tx-${Date.now()}-${++seq.current}`;
    mutate((prev) => [...prev, { id, label, hash, status: "confirming", href, ts: Date.now(), chainId }]);
    return id;
  }, [mutate]);

  const completeTx = useCallback((id: string, status: "done" | "error") => {
    mutate((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    setTimeout(() => {
      setTxs((prev) => { const next = prev.filter((t) => t.id !== id); persist(next); return next; });
    }, 4000);
  }, [mutate]);

  return <Ctx.Provider value={{ txs, addTx, completeTx }}>{children}</Ctx.Provider>;
}

export function useTxQueue() {
  return useContext(Ctx);
}
