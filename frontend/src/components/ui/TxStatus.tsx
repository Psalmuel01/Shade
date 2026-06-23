"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type TxStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
};

interface TxStatusProps {
  steps: TxStep[];
  className?: string;
}

export function TxStatus({ steps, className }: TxStatusProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
            <AnimatePresence mode="wait">
              {step.status === "done" && (
                <motion.div
                  key="done"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-green-400"
                >
                  <CheckCircle className="h-5 w-5" />
                </motion.div>
              )}
              {step.status === "active" && (
                <motion.div
                  key="active"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-amber-400"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                </motion.div>
              )}
              {step.status === "pending" && (
                <motion.div
                  key="pending"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-white/20"
                >
                  <Circle className="h-5 w-5" />
                </motion.div>
              )}
              {step.status === "error" && (
                <motion.div
                  key="error"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-red-400"
                >
                  <XCircle className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {i < steps.length - 1 && (
            <div
              className={cn(
                "absolute left-3.5 w-px",
                step.status === "done" ? "bg-green-400/30" : "bg-white/[0.08]",
              )}
              style={{ top: "calc(50% + 14px)", height: "24px" }}
            />
          )}

          <span
            className={cn(
              "text-sm transition-colors duration-200",
              step.status === "done" && "text-white/60 line-through",
              step.status === "active" && "text-[#FAFAFA] font-medium",
              step.status === "pending" && "text-white/30",
              step.status === "error" && "text-red-400",
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
