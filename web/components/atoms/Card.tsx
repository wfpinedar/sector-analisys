import type { HTMLAttributes, ReactNode } from "react";

type Variant = "panel" | "muted";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  children?: ReactNode;
};

export function Card({ variant = "muted", className = "", children, ...rest }: Props) {
  const base = variant === "panel" ? "glass-panel" : "surface-muted";
  return (
    <div className={[base, className].filter(Boolean).join(" ")}{...rest}>
      {children}
    </div>
  );
}

