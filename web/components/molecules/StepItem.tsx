import clsx from "clsx";
import { Check } from "lucide-react";

export function StepItem({ id, title, subtitle, status }: { id: number; title: string; subtitle: string; status: "active" | "done" | "pending" }) {
  return (
    <div
      className={clsx(
        "surface-muted p-5 transition",
        status === "active" && "border-[rgb(var(--accent-rgb)_/_0.55)] shadow-[0_12px_50px_-35px_rgba(22,66,91,0.7)]",
        status === "done" && "border-[rgb(var(--accent-rgb)_/_0.45)]",
        status === "pending" && "opacity-80"
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
        <span>Paso {id}</span>
        <span
          className={clsx(
            "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm",
            status === "active" && "border-[rgb(var(--accent-rgb)_/_0.55)] bg-[rgb(47_102_144_/_0.35)] text-[rgb(var(--accent-rgb))]",
            status === "done" && "border-[rgb(var(--accent-rgb)_/_0.45)] bg-[rgb(47_102_144_/_0.3)] text-[rgb(var(--accent-rgb))]",
            status === "pending" && "border-[rgb(47_102_144_/_0.3)] text-slate-500"
          )}
        >
          {status === "done" ? <Check className="h-4 w-4" /> : id}
        </span>
      </div>
      <div className="mt-3 text-base font-semibold text-white">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{subtitle}</p>
    </div>
  );
}

