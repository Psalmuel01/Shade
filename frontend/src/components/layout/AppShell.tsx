"use client";

import { motion } from "framer-motion";
import { BottomNav } from "./BottomNav";
import { TxBar, TxWatcher } from "@/components/ui/TxBar";

interface AppShellProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export function AppShell({ children, showNav = true }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col items-center bg-[#080808]">
      <div className="w-full max-w-[430px] min-h-dvh flex flex-col relative">
        <TxWatcher />
        <TxBar />
        <motion.main
          className="flex-1 overflow-y-auto no-scrollbar"
          style={{ paddingBottom: showNav ? "80px" : "0px" }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {children}
        </motion.main>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
