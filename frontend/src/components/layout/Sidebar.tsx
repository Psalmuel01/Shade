"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { LayoutDashboard, ArrowUpDown, Send, Briefcase, ShieldCheck, ScanLine, Settings, LogOut } from "lucide-react";
import { ShadeLogoMark } from "@/components/icons/ShadeLogoMark";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/shield", icon: ArrowUpDown, label: "Shield" },
  { href: "/send", icon: Send, label: "Send" },
  { href: "/payroll", icon: Briefcase, label: "Payroll" },
  { href: "/escrow", icon: ShieldCheck, label: "Escrow" },
  { href: "/prove", icon: ScanLine, label: "Prove" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  function handleDisconnect() {
    disconnect();
    router.replace("/");
  }

  return (
    <aside className="w-60 flex-shrink-0 h-full flex flex-col border-r border-white/[0.06]">
      {/* Logo */}
      <Link href="/" className="px-5 py-5 flex items-center gap-2.5 border-b border-white/[0.06] hover:opacity-75 transition-opacity">
        <ShadeLogoMark size={22} showBg />
        <span className="text-base font-semibold tracking-tight">Shade</span>
      </Link>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150",
                active
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
              )}
            >
              <Icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Wallet + disconnect */}
      <div className="px-3 py-4 border-t border-white/[0.06] flex flex-col gap-1">
        {address && (
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150",
              pathname === "/profile"
                ? "bg-amber-500/10 text-amber-400"
                : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-none">Profile</span>
              <span className="text-[11px] text-white/30 font-mono truncate mt-0.5">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
          </Link>
        )}
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/30 hover:text-red-400/80 hover:bg-red-500/[0.07] transition-all duration-150 w-full"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
          <span className="text-sm font-medium">Disconnect</span>
        </button>
      </div>
    </aside>
  );
}
