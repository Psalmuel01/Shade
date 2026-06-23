"use client";

import { motion } from "framer-motion";
import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";

interface NumericKeypadProps {
  value: string;
  onChange: (val: string) => void;
  maxDecimals?: number;
  className?: string;
  unit?: string;
  maxValue?: string;
  onMax?: () => void;
  error?: string;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function NumericKeypad({
  value,
  onChange,
  maxDecimals = 6,
  className,
  unit = "USDC",
  maxValue,
  onMax,
  error,
  disabled = false,
}: NumericKeypadProps) {
  function press(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1) || "");
      return;
    }
    if (key === ".") {
      if (value.includes(".")) return;
      onChange((value || "0") + ".");
      return;
    }
    if (value === "0" && key !== ".") {
      onChange(key);
      return;
    }
    const [, frac] = value.split(".");
    if (frac !== undefined && frac.length >= maxDecimals) return;
    onChange(value + key);
  }

  const display = value || "0";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Amount display */}
      <div className="flex flex-col items-center gap-1 py-2">
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-5xl font-mono font-semibold text-[#FAFAFA] tabular-nums tracking-tight">
            {display}
          </span>
          <span className="text-base text-white/30 font-mono">{unit}</span>
        </div>

        {/* Max / balance row */}
        <div className="flex items-center gap-2 h-5">
          {error ? (
            <span className="text-xs text-red-400 font-mono">{error}</span>
          ) : maxValue !== undefined ? (
            <>
              <span className="text-xs text-white/30 font-mono">Max {maxValue} {unit}</span>
              {onMax && (
                <button
                  onClick={onMax}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2 transition-colors"
                >
                  Use max
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Keys */}
      <div className={cn("grid grid-cols-3 gap-2", disabled && "opacity-30 pointer-events-none")}>
        {KEYS.map((key) => (
          <motion.button
            key={key}
            whileTap={disabled ? {} : { scale: 0.92, backgroundColor: "rgba(255,255,255,0.12)" }}
            onClick={() => !disabled && press(key)}
            className={cn(
              "flex items-center justify-center h-14 rounded-2xl",
              "bg-white/[0.05] border border-white/[0.06] text-[#FAFAFA]",
              "text-xl font-medium transition-colors duration-100 select-none",
              !disabled && "hover:bg-white/[0.09] active:bg-white/[0.12]",
            )}
          >
            {key === "⌫" ? <Delete className="h-5 w-5 text-white/50" /> : key}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
