"use client";
import { Activity, CheckSquare, CreditCard, MessageSquare, PlusCircle, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Project = { id: number; name: string; description?: string };

const featureItems: { label: string; step: 1 | 2 | 3 | 4; icon: any }[] = [
  { label: "Escala y proyecto", step: 1, icon: CheckSquare },
  { label: "Variables", step: 2, icon: MessageSquare },
  { label: "Matriz", step: 3, icon: Activity },
  { label: "Resultados", step: 4, icon: CreditCard },
];

export function Sidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/projects`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Project[];
        if (!cancelled) setProjects(data || []);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    function refresh() {
      if (!cancelled) load();
    }
    window.addEventListener("projects:refresh", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("projects:refresh", refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return projects;
    const s = q.toLowerCase();
    return projects.filter((p) => p.name?.toLowerCase().includes(s));
  }, [projects, q]);

  function goStep(step: 1 | 2 | 3 | 4) {
    window.dispatchEvent(new CustomEvent("nav:step", { detail: step }));
  }

  function selectProject(id: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", String(id));
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new CustomEvent("nav:project", { detail: id }));
  }

  async function deleteProject(id: number) {
    if (!confirm("¿Eliminar este proyecto de forma permanente?")) return;
    try {
      const res = await fetch(`${API}/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      if (new URL(window.location.href).searchParams.get("project") === String(id)) {
        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        window.history.replaceState({}, "", url);
      }
      window.dispatchEvent(new Event("projects:refresh"));
    } catch (err) {
      alert((err as Error).message || "No se pudo eliminar");
    }
  }

  return (
    <aside className="hidden md:flex h-full flex-col gap-3 bg-[#0d1a24] px-3 py-4 shadow-xl">
      <div className="px-2 text-sm font-semibold text-[var(--platinum)]">Proyectos</div>
      <div className="flex items-center gap-2 px-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="input-surface w-full rounded-lg px-3 py-2 text-xs"
        />
        <button
          className="btn-secondary whitespace-nowrap px-3 text-xs"
          title="Nuevo proyecto"
          onClick={() => goStep(1)}
        >
          <PlusCircle className="h-4 w-4" />
        </button>
      </div>
      <nav className="max-h-[40vh] overflow-auto pr-1">
        {loading && (
          <div className="px-2 py-2 text-xs text-slate-400">Cargando...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-2 py-2 text-xs text-slate-400">Sin proyectos</div>
        )}
        <ul className="space-y-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <div className="group flex items-start justify-between gap-2 rounded-lg px-3 py-2 hover:bg-[color-mix(in_oklab,var(--indigo-dye)_60%,transparent)]">
                <button className="flex-1 text-left" onClick={() => selectProject(p.id)}>
                  <div className="truncate font-medium text-[var(--platinum)] group-hover:text-white">{p.name || `Proyecto #${p.id}`}</div>
                  {p.description && (
                    <div className="truncate text-xs text-slate-400">{p.description}</div>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    title="Editar"
                    className="btn-secondary px-2 py-1 text-xs"
                    onClick={() => { selectProject(p.id); goStep(1); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Eliminar"
                    className="btn-secondary px-2 py-1 text-xs border-red-400/40 text-red-200 hover:border-red-300 hover:text-red-100"
                    onClick={() => deleteProject(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-2 px-2 text-sm font-semibold text-[var(--platinum)]">Funciones</div>
      <nav className="flex-1 space-y-1">
        {featureItems.map(({ label, step, icon: Icon }) => (
          <button
            key={label}
            onClick={() => goStep(step)}
            className={clsx(
              "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-[color-mix(in_oklab,var(--indigo-dye)_60%,transparent)] hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 text-slate-400 group-hover:text-[var(--sky-blue)]" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">v1.0</div>
    </aside>
  );
}
