"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, ArrowUpDown, Send, Briefcase, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/shield", icon: ArrowUpDown, label: "Shield" },
  { href: "/send", icon: Send, label: "Send" },
  { href: "/payroll", icon: Briefcase, label: "Payroll" },
  { href: "/escrow", icon: ShieldCheck, label: "Escrow" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-40 md:hidden">
      <div
        className="flex items-center justify-around px-2 pt-3 bottom-nav"
        style={{
          background: "linear-gradient(to top, rgba(8,8,8,0.98) 60%, rgba(8,8,8,0) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all duration-200",
                "min-w-[56px]",
              )}
              aria-label={label}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-colors duration-200",
                  active ? "text-amber-400" : "text-white/30",
                )}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <AnimatePresence>
                {active && (
                  <motion.div
                    layoutId="nav-dot"
                    className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-amber-400"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
