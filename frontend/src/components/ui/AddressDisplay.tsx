"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/cn";

interface AddressDisplayProps {
  address: string;
  chars?: number;
  className?: string;
  showCopy?: boolean;
}

export function AddressDisplay({
  address,
  chars = 6,
  className,
  showCopy = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm text-white/60",
        className,
      )}
    >
      <span title={address}>{shortAddress(address, chars)}</span>
      {showCopy && (
        <button
          onClick={copy}
          className="text-white/30 hover:text-amber-400 transition-colors duration-150"
          title="Copy address"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}
