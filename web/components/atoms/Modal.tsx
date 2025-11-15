"use client";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ open, onClose, title, children, footer, wide }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative mx-4 w-full ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
        <div className="glass-panel px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white">{title}</h3>
            {onClose && (
              <button onClick={onClose} className="btn-secondary px-3 py-1 text-xs">Cerrar</button>
            )}
          </div>
          <div className="mt-4">{children}</div>
          {footer && <div className="mt-5 flex justify-end">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

