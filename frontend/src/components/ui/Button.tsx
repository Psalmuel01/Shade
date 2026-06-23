"use client";

import { ButtonHTMLAttributes, forwardRef, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-shade-accent text-black hover:bg-amber-400 shadow-accent-sm",
  secondary:
    "bg-white/[0.06] border border-white/[0.10] text-[#FAFAFA] hover:bg-white/[0.10]",
  ghost:
    "text-white/70 hover:text-[#FAFAFA] hover:bg-white/[0.06]",
  danger:
    "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20",
};

const sizes: Record<ButtonSize, string> = {
  xs: "text-xs px-2.5 py-1.5 rounded-lg",
  sm: "text-sm px-3.5 py-2",
  md: "text-sm px-5 py-3",
  lg: "text-base px-6 py-3.5 rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading,
      fullWidth,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          base,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          "active:scale-[0.97]",
          className,
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
