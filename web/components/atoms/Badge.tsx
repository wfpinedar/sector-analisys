import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "warning" };

export function Badge({ className = "", tone = "default", ...rest }: Props) {
  const base =
    tone === "warning"
      ? "inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200"
      : "badge-step";
  return <span className={[base, className].filter(Boolean).join(" ")}{...rest} />;
}

