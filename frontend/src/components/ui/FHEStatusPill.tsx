"use client";

import { Lock, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type FHEStatus = "idle" | "encrypting" | "confirmed";

interface FHEStatusPillProps {
  status: FHEStatus;
  className?: string;
}

const config: Record<FHEStatus, { icon: React.ReactNode; label: string; cls: string }> = {
  idle: {
    icon: <Lock className="h-3 w-3" />,
    label: "FHE Protected",
    cls: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  encrypting: {
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: "Encrypting...",
    cls: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
  confirmed: {
    icon: <CheckCircle className="h-3 w-3" />,
    label: "On-chain Encrypted",
    cls: "bg-green-500/10 border-green-500/20 text-green-400",
  },
};

export function FHEStatusPill({ status, className }: FHEStatusPillProps) {
  const { icon, label, cls } = config[status];
  return (
    <span
      className={cn(
        "shade-pill border",
        cls,
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}
