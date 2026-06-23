export function formatUSDC(value: bigint | number | string, decimals = 6): string {
  const n = BigInt(value);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function shortAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatCountdown(targetTimestamp: number): string {
  const delta = targetTimestamp - Math.floor(Date.now() / 1000);
  if (delta <= 0) return "Expired";
  const h = Math.floor(delta / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function timeAgo(timestamp: number): string {
  const delta = Math.floor(Date.now() / 1000) - timestamp;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export const ESCROW_STATE_LABEL: Record<number, string> = {
  0: "Created",
  1: "Funded",
  2: "Released",
  3: "Disputed",
  4: "Refunded",
  5: "Cancelled",
};
