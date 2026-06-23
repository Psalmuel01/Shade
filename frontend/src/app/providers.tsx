"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { Toaster } from "react-hot-toast";
import { wagmiConfig } from "@/lib/wagmi";
import { FhevmContext } from "@/lib/fhevm";
import { useFhevmProvider } from "@/hooks/useFhevm";
import { TxQueueProvider } from "@/lib/txQueue";
import { useState } from "react";

function FhevmBridge({ children }: { children: React.ReactNode }) {
  const value = useFhevmProvider();
  return (
    <FhevmContext.Provider value={value}>
      {children}
    </FhevmContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
  }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TxQueueProvider>
        <FhevmBridge>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(20,20,20,0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#FAFAFA",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "14px",
                borderRadius: "12px",
                backdropFilter: "blur(20px)",
              },
              success: {
                iconTheme: { primary: "#F59E0B", secondary: "#080808" },
              },
              error: {
                iconTheme: { primary: "#EF4444", secondary: "#080808" },
              },
            }}
          />
        </FhevmBridge>
        </TxQueueProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
