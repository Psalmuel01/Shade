import { cn } from "@/lib/cn";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-2xs font-mono text-white/30 uppercase tracking-widest shrink-0">
        {children}
      </span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}
