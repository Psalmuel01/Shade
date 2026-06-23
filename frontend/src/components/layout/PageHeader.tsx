"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, showBack = true, onBack, right, className }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "flex items-center gap-3 px-4 pt-14 pb-4",
        className,
      )}
    >
      {(showBack || onBack) && (
        <button
          onClick={() => onBack ? onBack() : router.back()}
          className="p-2 -ml-2 text-white/50 hover:text-[#FAFAFA] transition-colors rounded-xl hover:bg-white/[0.06]"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="flex-1 text-base font-semibold text-[#FAFAFA] tracking-tight">{title}</h1>
      {right}
    </header>
  );
}
