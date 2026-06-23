export const ADDRESSES: Record<number, Record<string, `0x${string}`>> = {
  31337: {
    ConfidentialUSDC: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    PayrollVault: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    PrivateEscrow: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
    BalanceProver: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
    StealthSend: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    USDC: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
  11155111: {
    ConfidentialUSDC: (process.env.NEXT_PUBLIC_CONFIDENTIAL_USDC ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    PayrollVault: (process.env.NEXT_PUBLIC_PAYROLL_VAULT ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    PrivateEscrow: (process.env.NEXT_PUBLIC_PRIVATE_ESCROW ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    BalanceProver: (process.env.NEXT_PUBLIC_BALANCE_PROVER ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    StealthSend: (process.env.NEXT_PUBLIC_STEALTH_SEND ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
};

export function getAddress(chainId: number, contract: string): `0x${string}` {
  return ADDRESSES[chainId]?.[contract] ?? "0x0000000000000000000000000000000000000000";
}
