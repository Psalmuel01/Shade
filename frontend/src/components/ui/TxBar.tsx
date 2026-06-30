"use client";

import { useEffect } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { useTxQueue, TxRecord } from "@/lib/txQueue";

// One invisible component per confirming tx — lets us call the hook per-tx
function TxWatcherItem({ tx }: { tx: TxRecord }) {
  const { completeTx } = useTxQueue();
  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash: tx.hash,
    query: { enabled: tx.status === "confirming" },
  });

  useEffect(() => {
    if (isSuccess) {
      completeTx(tx.id, "done");
      toast.success(`${tx.label} confirmed`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  useEffect(() => {
    if (isError) {
      completeTx(tx.id, "error");
      toast.error(`${tx.label} failed`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  return null;
}

export function TxWatcher() {
  const { txs } = useTxQueue();
  return (
    <>
      {txs.filter((t) => t.status === "confirming").map((tx) => (
        <TxWatcherItem key={tx.id} tx={tx} />
      ))}
    </>
  );
}

function etherscanUrl(tx: TxRecord): string {
  const base = tx.chainId === 11155111
    ? "https://sepolia.etherscan.io/tx/"
    : "https://etherscan.io/tx/";
  return `${base}${tx.hash}`;
}

export function TxBar() {
  const { txs } = useTxQueue();
  const visible = txs.filter((t) => t.status === "confirming" || t.status === "done" || t.status === "error");

  return (
    <AnimatePresence>
      {visible.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden sticky top-0 z-50"
        >
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex flex-col gap-1.5">
            {visible.map((tx) => (
              <a
                key={tx.id}
                href={etherscanUrl(tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full text-left group"
              >
                {tx.status === "confirming" ? (
                  <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin shrink-0" />
                ) : tx.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                <span className={`text-xs font-medium truncate flex-1 ${
                  tx.status === "done" ? "text-green-400" :
                  tx.status === "error" ? "text-red-400" :
                  "text-amber-400"
                }`}>
                  {tx.label}
                </span>
                <span className="text-2xs text-white/30 shrink-0 flex items-center gap-1">
                  {tx.status === "confirming" ? "confirming…" :
                   tx.status === "done" ? "confirmed" : "failed"}
                  {tx.status !== "confirming" && (
                    <ExternalLink className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                  )}
                </span>
              </a>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
