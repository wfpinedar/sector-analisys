"use client";
import { Modal } from "../atoms/Modal";

type Scale = { id: number; name: string; min_value: number; max_value: number; step: number };

export function ScaleManagerModal({
  open,
  onClose,
  scale,
  values,
  setValues,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  scale: Scale;
  values: { value: number; description?: string }[];
  setValues: (v: { value: number; description?: string }[]) => void;
  busy: boolean;
  error: string | null;
  onSave: () => void;
}) {
  if (!open || !scale) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Escala: ${scale.name} [${scale.min_value}..${scale.max_value}] step ${scale.step}`}
      wide
      footer={
        <button className="btn-primary px-5 py-2 text-sm" onClick={onSave} disabled={busy}>
          {busy ? "Guardando..." : "Guardar escala"}
        </button>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="surface-muted p-4 text-sm text-slate-300">
          <div>Nombre: <span className="text-white">{scale.name}</span></div>
          <div>Rango: <span className="text-white">{scale.min_value} a {scale.max_value}</span></div>
          <div>Paso: <span className="text-white">{scale.step}</span></div>
          <p className="mt-3 text-xs">Cada valor de la escala puede tener una descripción semántica (p. ej. "nulo", "débil", "alto").</p>
        </div>
        <div className="surface-muted p-4">
          <table className="min-w-full border-separate border-spacing-0 text-sm text-slate-200">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Valor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {values.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-[rgba(47,102,144,0.14)]" : "bg-[rgba(22,66,91,0.4)]"}>
                  <td className="px-3 py-2 text-white">{row.value}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input-surface w-full"
                      value={row.description ?? ""}
                      onChange={(e) =>
                        setValues(values.map((v, i) => (i === idx ? { ...v, description: e.target.value } : v)))
                      }
                      placeholder="Descripción (opcional)"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
