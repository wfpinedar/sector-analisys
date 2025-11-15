"use client";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Button({ variant = "primary", loading, leftIcon, rightIcon, children, className = "", disabled, ...rest }: Props) {
  const base = variant === "primary" ? "btn-primary" : "btn-secondary";
  return (
    <button
      className={[base, className].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}

