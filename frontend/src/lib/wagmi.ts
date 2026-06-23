"use client";

import { createConfig, http, fallback } from "wagmi";
import { sepolia, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const userRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

const sepoliaTransport = fallback([
  http(userRpc && userRpc !== "" ? userRpc : "https://ethereum-sepolia-rpc.publicnode.com"),
  http("https://sepolia.drpc.org"),
  http("https://rpc2.sepolia.org"),
]);

export const wagmiConfig = createConfig({
  chains: [sepolia, hardhat],
  connectors: [injected()],
  transports: {
    [sepolia.id]: sepoliaTransport,
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
  batch: {
    multicall: false,
  },
  ssr: true,
});
