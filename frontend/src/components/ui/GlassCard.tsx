"use client";

import { HTMLAttributes, forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/cn";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  hover?: boolean;
  glow?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ hover = false, glow = false, padding = "md", className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hover ? { y: -2, transition: { duration: 0.15 } } : undefined}
        className={cn(
          "glass-card",
          paddings[padding],
          glow && "accent-glow",
          hover && "cursor-pointer",
          className,
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
GlassCard.displayName = "GlassCard";

export function GlassCardShimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn("glass-card shimmer", className)}
      aria-hidden
    />
  );
}
