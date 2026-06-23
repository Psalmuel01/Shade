"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

interface EncryptedBadgeProps {
  value?: string;
  isRevealed?: boolean;
  onReveal?: () => void;
  isLoading?: boolean;
  size?: "sm" | "lg";
  label?: string;
  unit?: string;
}

export function EncryptedBadge({
  value,
  isRevealed = false,
  onReveal,
  isLoading = false,
  size = "sm",
  label,
  unit = "cUSDC",
}: EncryptedBadgeProps) {
  if (size === "sm") {
    return (
      <span
        className={cn(
          "shade-pill bg-amber-500/10 border border-amber-500/20 text-amber-400 cursor-pointer select-none",
          "transition-all duration-200 hover:bg-amber-500/20",
        )}
        onClick={onReveal}
        title="Encrypted value — click to reveal"
      >
        <Lock className="h-2.5 w-2.5" />
        {isRevealed && value ? (
          <span className="font-mono">{value}</span>
        ) : (
          <span className="font-mono tracking-widest">••••••</span>
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {label && (
        <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
      )}
      <div className="relative flex flex-col items-center gap-2">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shimmer h-12 w-48 rounded-xl"
            />
          ) : isRevealed && value ? (
            <motion.div
              key="revealed"
              initial={{ filter: "blur(12px)", opacity: 0 }}
              animate={{ filter: "blur(0px)", opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-baseline gap-1.5"
            >
              <span className="text-4xl font-mono font-semibold text-[#FAFAFA] tabular-nums">
                {value}
              </span>
              <span className="text-sm text-white/40 font-mono">{unit}</span>
            </motion.div>
          ) : (
            <motion.div
              key="hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="text-4xl font-mono font-semibold text-white/30 tracking-[0.3em]"
                style={{ filter: "blur(6px)" }}
              >
                {"••••••"}
              </span>
              <span className="text-xs text-white/30 font-mono">{unit}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {onReveal && (
          <button
            onClick={onReveal}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-amber-400 transition-colors duration-200"
          >
            {isRevealed ? (
              <><EyeOff className="h-3 w-3" /> Hide</>
            ) : (
              <><Eye className="h-3 w-3" /> Reveal balance</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
