"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import clsx from "clsx";
import { Plus, Trash2, Edit3, RefreshCcw } from "lucide-react";
import { Button } from "../components/atoms/Button";
import { Badge } from "../components/atoms/Badge";
import { StepItem } from "../components/molecules/StepItem";
import { InfluencesGraph } from "../components/organisms/InfluencesGraph";
import { Spinner } from "../components/atoms/Spinner";
import { ScaleManagerModal } from "../components/molecules/ScaleManagerModal";
import SectorAnalysis from "../components/SectorAnalysis"
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import type { AxisDomainItem } from "recharts/types/util/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type StepId = 1 | 2 | 3 | 4;
type ScaleSet = { id: number; name: string; min_value: number; max_value: number; step: number; labels?: Record<number, string> };

type ComputeOut = {
  variables: string[];
  dependencia_x: number[];
  motricidad_y: number[];
  x_cut: number;
  y_cut: number;
  quadrants: Record<string, string>;
};

type HeatmapOut = {
  variables: string[];
  scale: { min: number; max: number; step: number };
  matrix: number[][];
};

type GraphOut = {
  nodes: { id: number; name: string }[];
  links: { source: number; target: number; weight: number }[];
};

type ScatterPoint = { name: string; x: number; y: number; q?: string };

type QuadrantPaletteEntry = { fill: string; bg: string; text: string; border: string };

function computeXY(matrix: number[][]) {
  const n = matrix.length;
  const dependency = Array<number>(n).fill(0);
  const driving = Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      driving[i] += matrix[i]?.[j] ?? 0;
      dependency[j] += matrix[i]?.[j] ?? 0;
    }
  }
  return { dependency, driving };
}

function computeCut(values: number[]) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function quadrantLabel(x: number, y: number, xCut: number, yCut: number) {
  if (y >= yCut && x < xCut) return "Determinante";
  if (y >= yCut && x >= xCut) return "Reguladora";
  if (y < yCut && x >= xCut) return "Resultado";
  return "Autonoma";
}

function buildPreviewResult(variables: string[], matrix: number[][]): ComputeOut | null {
  const n = variables.length;
  if (!n || matrix.length !== n) return null;
  let hasValue = false;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i !== j && Number.isFinite(matrix[i]?.[j]) && matrix[i][j] !== 0) {
        hasValue = true;
        break;
      }
    }
    if (hasValue) break;
  }
  if (!hasValue) return null;

  const { dependency, driving } = computeXY(matrix);
  const xCut = computeCut(dependency);
  const yCut = computeCut(driving);
  const quadrants: Record<string, string> = {};
  for (let i = 0; i < n; i += 1) {
    quadrants[variables[i]] = quadrantLabel(dependency[i], driving[i], xCut, yCut);
  }
  return {
    variables: [...variables],
    dependencia_x: dependency,
    motricidad_y: driving,
    x_cut: xCut,
    y_cut: yCut,
    quadrants,
  };
}

const stepsMeta: { id: StepId; title: string; subtitle: string }[] = [
  { id: 1, title: "Escala y proyecto", subtitle: "Configura la escala de valores y genera un proyecto de trabajo." },
  { id: 2, title: "Variables", subtitle: "Nombra las variables que participan en el analisis sectorial." },
  { id: 3, title: "Matriz", subtitle: "Completa la matriz de influencias cruzadas entre variables." },
  { id: 4, title: "Resultados", subtitle: "Explora cuadrantes, histogramas, heatmap y red de influencias." },
];

const autonomousPalette: QuadrantPaletteEntry = {
  fill: "#d9dcd6",
  bg: "bg-[#d9dcd6]/20",
  text: "text-[#d9dcd6]",
  border: "border-[#d9dcd6]/40",
};

const quadrantPalette: Record<string, QuadrantPaletteEntry> = {
  Determinante: {
    fill: "#81c3d7",
    bg: "bg-[#81c3d7]/20",
    text: "text-[rgb(129,195,215)]",
    border: "border-[#81c3d7]/40",
  },
  Reguladora: {
    fill: "#3a7ca5",
    bg: "bg-[#3a7ca5]/20",
    text: "text-[rgb(129,195,215)]",
    border: "border-[#3a7ca5]/40",
  },
  Resultado: {
    fill: "#2f6690",
    bg: "bg-[#2f6690]/20",
    text: "text-[rgb(129,195,215)]",
    border: "border-[#2f6690]/40",
  },
  Autonoma: autonomousPalette,
};

function normalizeQuadrantKey(q?: string | null) {
  if (!q) return undefined;
  if (quadrantPalette[q]) return q;
  const cleaned = q.normalize ? q.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : q;
  if (quadrantPalette[cleaned]) return cleaned;
  return q;
}

function quadrantBadgeClasses(q?: string) {
  const normalized = normalizeQuadrantKey(q);
  const palette = normalized ? quadrantPalette[normalized] : undefined;
  return clsx(
    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium tracking-wide",
    palette ? [palette.bg, palette.text, palette.border] : "border-neutral-700 text-neutral-300"
  );
}

function getQuadrantColor(q?: string) {
  const normalized = normalizeQuadrantKey(q);
  return normalized && quadrantPalette[normalized] ? quadrantPalette[normalized].fill : "#81c3d7";
}

function getQuadrantDisplayName(q?: string) {
  const normalized = normalizeQuadrantKey(q);
  if (!normalized) return "Sin cuadrante";
  if (normalized === "Autonoma") return "Autonoma";
  return normalized;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message =
        typeof data === "string"
          ? data
          : (data && (data.detail || data.message)) || JSON.stringify(data);
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message || `Error ${res.status}`);
  }
  return res.json();
}

// Spinner moved to atoms/Spinner

export default function Page() {
  const [step, setStep] = useState<StepId>(1);
  const [scales, setScales] = useState<ScaleSet[]>([]);
  const [scaleId, setScaleId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState<string>("Proyecto UI");
  const [projectDesc, setProjectDesc] = useState<string>("Wizard");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [variables, setVariables] = useState<string[]>(["Var 1", "Var 2", "Var 3", "Var 4"]);
  const [matrix, setMatrix] = useState<number[][]>([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const [result, setResult] = useState<ComputeOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [heatmap, setHeatmap] = useState<HeatmapOut | null>(null);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const [graph, setGraph] = useState<GraphOut | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [minW, setMinW] = useState<number>(0);
  const [directed, setDirected] = useState<boolean>(true);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [editingScale, setEditingScale] = useState<ScaleSet | null>(null);
  const [scaleValues, setScaleValues] = useState<{ value: number; description?: string }[]>([]);
  const [scaleBusy, setScaleBusy] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);

  const previewResult = useMemo(() => {
    if (result) return null;
    return buildPreviewResult(variables, matrix);
  }, [result, variables, matrix]);

  const analysis = result ?? previewResult;
  const isPreview = !result && !!previewResult;

  useEffect(() => {
    let cancelled = false;
    requestJson<ScaleSet[]>(`${API}/scalesets`)
      .then((rows) => {
        if (cancelled) return;
        setScales(rows);
        setScaleId((prev) => {
          if (prev !== null) return prev;
          return rows[0]?.id ?? null;
        });
      })
      .catch((err) => {
        console.error("Error cargando escalas", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync project from URL and listen to sidebar events
  useEffect(() => {
    // URL param -> project
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams.get("project");
      if (p && Number(p)) {
        setProjectId(Number(p));
        setStep((prev) => (prev < 2 ? 2 : prev));
      }
    } catch {}

    function onNavStep(e: Event) {
      const detail = (e as CustomEvent).detail as StepId | undefined;
      if (!detail) return;
      setStep(detail);
    }
    function onNavProject(e: Event) {
      const id = Number((e as CustomEvent).detail);
      if (!Number.isFinite(id)) return;
      setProjectId(id);
      setStep((prev) => (prev < 2 ? 2 : prev));
    }

    window.addEventListener("nav:step", onNavStep as any);
    window.addEventListener("nav:project", onNavProject as any);
    return () => {
      window.removeEventListener("nav:step", onNavStep as any);
      window.removeEventListener("nav:project", onNavProject as any);
    };
  }, []);

  useEffect(() => {
    const n = variables.length;
    setMatrix((prev) => {
      const next = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : prev[i]?.[j] ?? 0))
      );
      return next;
    });
  }, [variables.length]);

  const activeScale = useMemo(() => {
    if (!scales.length) return null;
    if (scaleId !== null) {
      const found = scales.find((scale) => scale.id === scaleId);
      if (found) return found;
    }
    return scales[0];
  }, [scales, scaleId]);

  // Load current scale values when opening the modal
  async function openScaleManager() {
    const s = activeScale;
    if (!s) return;
    setEditingScale(s);
    setShowScaleModal(true);
    setScaleError(null);
    setScaleBusy(true);
    try {
      // Prefer new ScaleSet with labels
      let detail: any = null;
      try { detail = await requestJson<any>(`${API}/scalesets/${s.id}`); } catch {}
      const labels: Record<number, string> | undefined = detail?.labels ?? s.labels;
      const vals: { value: number; description?: string }[] = [];
      for (let v = s.min_value; v <= s.max_value; v += s.step) {
        const key = Number(v);
        const desc = labels ? labels[key] ?? labels[String(key) as any] : undefined;
        vals.push({ value: key, description: desc ?? "" });
      }
      setScaleValues(vals);
    } catch (err) {
      setScaleError((err as Error).message);
      setScaleValues([]);
    } finally {
      setScaleBusy(false);
    }
  }

  async function saveScaleValues() {
    const s = editingScale;
    if (!s) return;
    setScaleBusy(true);
    setScaleError(null);
    const labels: Record<number, string> = {} as any;
    for (const v of scaleValues) labels[v.value] = (v.description ?? "").trim();
    const payload = { labels } as any;
    try {
      await requestJson(`${API}/scalesets/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowScaleModal(false);
    } catch (err) {
      setScaleError((err as Error).message);
    } finally {
      setScaleBusy(false);
    }
  }

  const loadGraph = useCallback(
    async (minWeight: number, isDirected: boolean) => {
      if (!projectId) return;
      if (!Number.isFinite(minWeight) || minWeight < 0) {
        setGraphError("El umbral debe ser un nAmero positivo.");
        setGraph(null);
        return;
      }
      setGraphLoading(true);
      try {
        const data = await requestJson<GraphOut>(
          `${API}/projects/${projectId}/graph?min_weight=${minWeight}&directed=${isDirected}`
        );
        setGraph(data);
        setGraphError(null);
      } catch (err) {
        setGraph(null);
        setGraphError((err as Error).message);
      } finally {
        setGraphLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId || step !== 4) return;
    loadGraph(minW, directed);
  }, [minW, directed, loadGraph, projectId, step]);

  // Load project snapshot when projectId changes
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        // Project metadata
        const data = await requestJson<any>(`${API}/projects/${projectId}`);
        if (cancelled) return;
        if (data?.name) setProjectName(String(data.name));
        if (data?.description) setProjectDesc(String(data.description));
        if (Number.isFinite(data?.scale_set_id)) setScaleId(Number(data.scale_set_id));

        // Matrix endpoint now returns variables + matrix
        let varsFromMatrix: string[] | null = null;
        try {
          const snap = await requestJson<any>(`${API}/projects/${projectId}/matrix`);
          if (!cancelled) {
            const mx: number[][] = Array.isArray(snap) ? snap : (snap?.matrix ?? []);
            const vars: string[] = Array.isArray(snap?.variables)
              ? snap.variables.map((v: any) => String(v))
              : [];
            if (vars.length) {
              varsFromMatrix = vars;
              setVariables(vars);
              setStep((prev) => (prev < 2 ? 2 : prev));
            }
            if (Array.isArray(mx) && mx.length) {
              setMatrix(mx);
              setStep((prev) => (prev < 3 ? 3 : prev));
            }
          }
        } catch {}

        // Status endpoint to decide if matrix is complete → compute on the fly
        try {
          const st = await requestJson<any>(`${API}/projects/${projectId}/status`);
          if (cancelled) return;
          if (Number(st?.variables_count) > 0 && !varsFromMatrix && Array.isArray(st?.variables)) {
            // if backend happens to return variables here
            setVariables((st as any).variables.map((v: any) => String(v)));
          }
          const complete = !!st?.matrix_complete;
          if (complete) {
            await compute();
            setStep(4);
          }
        } catch {}
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const dataPoints = useMemo<ScatterPoint[]>(() => {
    if (!analysis) return [];
    return analysis.variables.map((name, index): ScatterPoint => ({
      name,
      x: analysis.dependencia_x[index],
      y: analysis.motricidad_y[index],
      q: analysis.quadrants[name],
    }));
  }, [analysis]);

  const summary = useMemo(() => {
    if (!analysis) return null;
    const total = analysis.variables.length || 1;
    const avgX = analysis.dependencia_x.reduce((acc, value) => acc + value, 0) / total;
    const avgY = analysis.motricidad_y.reduce((acc, value) => acc + value, 0) / total;
    const counts: Record<string, number> = {};
    for (const name of analysis.variables) {
      const quad = getQuadrantDisplayName(analysis.quadrants[name]);
      counts[quad] = (counts[quad] ?? 0) + 1;
    }
    return { total: analysis.variables.length, avgX, avgY, counts };
  }, [analysis]);

  async function createProject() {
    setBusy(true);
    setError(null);
    try {
      const sid = scaleId ?? scales[0]?.id;
      if (!sid) throw new Error("SeleccionA una escala vAlida.");
      const data = await requestJson<{ id: number }>(`${API}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          description: projectDesc,
          scale_set_id: sid,
        }),
      });
      setProjectId(data.id);
      setStep(2);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("project", String(data.id));
        window.history.replaceState({}, "", url);
      } catch {}
      window.dispatchEvent(new Event("projects:refresh"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateProject() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`${API}/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, description: projectDesc, scale_set_id: activeScale?.id ?? null }),
      });
      window.dispatchEvent(new Event("projects:refresh"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveVariables() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`${API}/projects/${projectId}/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      });
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMatrix() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`${API}/projects/${projectId}/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });
      await compute();
      setStep(4);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function compute() {
    if (!projectId) return;
    setHeatmapError(null);
    setGraphError(null);
    const data = await requestJson<ComputeOut>(`${API}/projects/${projectId}/compute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuts: "mean" }),
    });
    setResult(data);
    setHeatmapLoading(true);
    try {
      const heatmapData = await requestJson<HeatmapOut>(`${API}/projects/${projectId}/heatmap`);
      setHeatmap(heatmapData);
      setHeatmapError(null);
    } catch (err) {
      setHeatmap(null);
      setHeatmapError((err as Error).message);
    } finally {
      setHeatmapLoading(false);
    }
    await loadGraph(minW, directed);
  }

  function setVarName(idx: number, name: string) {
    setVariables((prev) => prev.map((value, index) => (index === idx ? name : value)));
  }

  function addVar() {
    setVariables((prev) => [...prev, `Var ${prev.length + 1}`]);
  }

  function removeVar(idx: number) {
    setVariables((prev) => prev.filter((_, index) => index !== idx));
    setMatrix((prev) =>
      prev
        .filter((_, rowIndex) => rowIndex !== idx)
        .map((row) => row.filter((_, colIndex) => colIndex !== idx))
    );
  }

  function setCell(i: number, j: number, value: number) {
    setMatrix((prev) =>
      prev.map((row, rIndex) =>
        row.map((cell, cIndex) =>
          rIndex === i && cIndex === j ? (i === j ? 0 : value) : cell
        )
      )
    );
  }

  function handleMinWeightChange(raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) {
      setMinW(0);
      return;
    }
    setMinW(next);
  }

  const cardBase = "glass-panel";
  const inputClass = "input-surface w-full px-3.5 py-2.5 placeholder-[#8ea7b6]";
  const buttonPrimary = "btn-primary";
  const buttonSecondary = "btn-secondary";
  const matrixInputClass =
    "input-surface w-24 text-right font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

  const scatterDomain = useMemo<Record<"x" | "y", [AxisDomainItem, AxisDomainItem]>>(() => {
    if (!dataPoints.length) {
      return {
        x: ["auto", "auto"] as [AxisDomainItem, AxisDomainItem],
        y: ["auto", "auto"] as [AxisDomainItem, AxisDomainItem],
      };
    }
    const xs = dataPoints.map((point) => point.x);
    const ys = dataPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = (min: number, max: number): [AxisDomainItem, AxisDomainItem] => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return ["auto", "auto"];
      }
      const spread = Math.abs(max - min);
      const delta = spread === 0 ? Math.max(Math.abs(max), 1) * 0.1 + 0.5 : spread * 0.1;
      return [min - delta, max + delta];
    };
    return {
      x: pad(minX, maxX),
      y: pad(minY, maxY),
    };
  }, [dataPoints]);

  const renderScatterPoint = useCallback((props: any): ReactElement => {
    const { cx, cy, payload } = props;
    if (typeof cx !== "number" || typeof cy !== "number") {
      return <g />;
    }
    const color = getQuadrantColor(payload?.q);
    return (
      <g>
        <circle cx={cx} cy={cy} r={10} fill={`${color}33`} stroke={color} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={4} fill="#0f172a" stroke="#0f172a" strokeWidth={1} />
      </g>
    );
  }, []);

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgb(129,195,215,0.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 space-y-12 md:px-6 lg:px-10">
        <header className="space-y-4 text-center md:text-left">
          <span className="badge-step">
            Matriz cruzada sectorial
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl lg:text-[2.65rem]">
            Analiza la dependencia y motricidad de tu sector paso a paso
          </h1>
          <p className="text-sm leading-relaxed text-slate-300 md:max-w-3xl">
            Configura una escala, modela las variables clave y descubre insights visuales sobre el comportamiento del sistema:
            plano MICMAC, comparativa de barras, heatmap y una red de influencias ajustable.
          </p>
        </header>

        <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stepsMeta.map((meta) => {
            const status = step === meta.id ? "active" : step > meta.id ? "done" : "pending";
            return <StepItem key={meta.id} id={meta.id} title={meta.title} subtitle={meta.subtitle} status={status as any} />;
          })}
        </nav>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/30 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {step === 1 && (
          <section className={clsx(cardBase, "p-8 space-y-8 md:p-10")}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3">
                <span className="badge-step">
                  Paso 1
                </span>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-white md:text-3xl">
                    Escala y proyecto
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-300">
                    Selecciona la escala con la que valoraras las influencias y crea un proyecto sobre el cual iterar. Puedes ajustar estos datos en cualquier momento.
                  </p>
                </div>
              </div>
              <div className="surface-muted px-5 py-4 text-xs text-[rgb(var(--accent-rgb))]">
                <h3 className="text-sm font-semibold text-white">Estado actual</h3>
                <ul className="mt-2 space-y-1.5 text-slate-200">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent-rgb))]" />
                    {scales.length ? `${scales.length} escalas registradas` : "Sin escalas registradas"}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent-rgb))]" />
                    Proyecto activo: {projectId ? `#${projectId}` : "no generado"}
                  </li>
                </ul>
              </div>
            </div>

              <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
              <div className="space-y-4">
                <label className="flex flex-col gap-3 text-sm font-medium text-slate-200">
                  Nombre del proyecto
                  <input
                    className={inputClass}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Ej: Diagnóstico sector salud"
                  />
                </label>
                <label className="flex flex-col gap-3 text-sm font-medium text-slate-200">
                  Descripción
                  <textarea
                    className="input-surface w-full px-3.5 py-2.5 placeholder-[#8ea7b6]"
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    rows={3}
                    placeholder="Objetivo, alcance, notas del proyecto"
                  />
                </label>
                <label className="flex flex-col gap-3 text-sm font-medium text-slate-200">
                  Escala disponible
                  <select
                    className={inputClass}
                    value={scaleId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setScaleId(value ? Number(value) : null);
                    }}
                  >
                    {scales.map((scale) => (
                      <option key={scale.id} value={scale.id}>
                        {scale.name} [{scale.min_value} .. {scale.max_value}] step {scale.step}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs leading-relaxed text-slate-400">
                  Puedes registrar nuevas escalas desde el API si necesitas otros rangos, niveles o etiquetas.
                </p>
              </div>
              <div className="surface-muted flex flex-col justify-end gap-4 p-5">
                <div className="text-sm text-[#d9dcd6]">
                  Crea un proyecto temporal para guardar variables, matrices y resultados calculados.
                </div>
                <div className="flex flex-wrap gap-2">
                  {!projectId ? (
                    <Button onClick={createProject} disabled={busy || !scales.length || !projectName.trim()} loading={busy}>
                      Crear proyecto
                    </Button>
                  ) : (
                    <Button onClick={updateProject} disabled={busy || !projectName.trim()} loading={busy}>
                      Guardar cambios
                    </Button>
                  )}
                  <Button variant="secondary" onClick={openScaleManager}>Gestionar escalas</Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className={clsx(cardBase, "p-6 space-y-5 md:p-8")}>            
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Escalas registradas</h3>
              <Button variant="secondary" onClick={openScaleManager}>Editar escala activa</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scales.map((s) => (
                <div key={s.id} className="surface-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.min_value} … {s.max_value} • paso {s.step}</div>
                    </div>
                    <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => { setScaleId(s.id); setTimeout(openScaleManager, 0); }}>Editar</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className={clsx(cardBase, "p-8 space-y-8 md:p-10")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <span className="badge-step">
                  Paso 2
                </span>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-white md:text-3xl">
                    Variables de analisis
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-300">
                    Nombra cada variable que participa en la matriz. Puedes agregar o quitar elementos para reflejar con precision el sistema que se esta evaluando.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="border-[rgb(var(--accent-rgb)_/_0.45)]">
                  Volver a escala
                </Button>
                <Button variant="secondary" onClick={addVar} className="border-[rgb(var(--accent-rgb)_/_0.55)] text-[rgb(var(--accent-rgb))]" leftIcon={<Plus className="h-4 w-4" />}>
                  Agregar variable
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {variables.map((value, index) => (
                <div
                  key={index}
                  className="surface-muted p-5 transition hover:border-[rgb(129,195,215,0.55)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(129,195,215,0.18)] text-sm font-semibold text-[rgb(129,195,215)]">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Variable {index + 1}
                      </label>
                      <input
                        value={value}
                        onChange={(event) => setVarName(index, event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => removeVar(index)}
                      className="border-red-400/40 px-3 text-red-200 hover:border-red-300 hover:text-red-100"
                      disabled={variables.length <= 1}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Los nombres se usaran en todas las graficas y reportes generados.
              </p>
              <Button onClick={saveVariables} disabled={busy || !projectId} loading={busy}>
                Guardar y continuar
              </Button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className={clsx(cardBase, "p-8 space-y-8 md:p-10")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <span className="badge-step">
                  Paso 3
                </span>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-white md:text-3xl">
                    Matriz de influencias
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-300">
                    Completa la intensidad de influencia que cada variable ejerce sobre el resto. La diagonal se mantiene en cero de forma automatica y se valida contra la escala seleccionada.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                  Volver a variables
                </Button>
              </div>
            </div>

            <div className="surface-muted p-4 sm:p-6">
              <div className="max-h-[520px] overflow-auto scrollbar-thin scrollbar-thumb-[rgb(129,195,215,0.35)] scrollbar-track-transparent">
                <table className="min-w-full border-separate border-spacing-0 text-sm text-slate-200">
                  <thead className="sticky top-0 z-10 bg-[#102637]/90 backdrop-blur">
                    <tr>
                      <th className="sticky left-0 z-20 border-b border-[rgb(129,195,215,0.25)] bg-[#102637]/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Origen \\ Destino
                      </th>
                      {variables.map((header, index) => (
                        <th
                          key={index}
                          className="border-b border-[rgb(129,195,215,0.25)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((rowName, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={clsx(
                          "transition hover:bg-[rgb(129,195,215,0.18)]",
                          rowIndex % 2 === 0 ? "bg-[rgba(47,102,144,0.14)]" : "bg-[rgba(22,66,91,0.4)]"
                        )}
                      >
                        <th className="sticky left-0 z-10 border-b border-[rgb(129,195,215,0.25)] bg-[#102637]/90 px-4 py-3 text-left text-sm font-semibold text-white">
                          {rowName}
                        </th>
                        {variables.map((_, colIndex) => (
                          <td key={colIndex} className="border-b border-[rgb(129,195,215,0.25)] px-3 py-2">
                            <input
                              type="number"
                              value={matrix[rowIndex]?.[colIndex] ?? 0}
                              onChange={(event) =>
                                setCell(rowIndex, colIndex, Number(event.target.value))
                              }
                              className={clsx(
                                matrixInputClass,
                                rowIndex === colIndex && "cursor-not-allowed opacity-60"
                              )}
                              disabled={rowIndex === colIndex}
                              step={activeScale?.step ?? 1}
                              min={activeScale?.min_value ?? 0}
                              max={activeScale?.max_value ?? 10}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Usa valores dentro del rango permitido por la escala. Puedes volver a esta matriz desde resultados para ajustar el analisis.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-400">
                Recuerda que el calculo aplica cortes por promedio de forma predeterminada.
              </div>
              <Button onClick={saveMatrix} disabled={busy || !projectId} loading={busy}>
                Guardar matriz y calcular
              </Button>
            </div>
          </section>
        )}

        {step === 4 && analysis && (
          <section className={clsx(cardBase, "p-8 space-y-10 md:p-10")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <span className="badge-step">
                  Paso 4
                </span>
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-white md:text-3xl">
                    Resultados y visualizacion
                  </h2>
                  {isPreview && (
                <Badge tone="warning">Vista preliminar calculada en el navegador</Badge>
                  )}
                  <p className="text-sm leading-relaxed text-slate-300">
                    Interpreta la posicion de cada variable dentro del plano dependencia versus motricidad y revisa la red de influencias resultante para priorizar acciones de gestion.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStep(3)} leftIcon={<Edit3 className="h-4 w-4" />}>
                  Editar matriz
                </Button>
                <Button variant="secondary" onClick={compute} className="border-[rgb(var(--accent-rgb)_/_0.55)] text-[rgb(var(--accent-rgb))]" leftIcon={<RefreshCcw className="h-4 w-4" />}>
                  {busy && <Spinner />} Recalcular
                </Button>
              </div>
            </div>

            {isPreview && (
              <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100">
                Para obtener el heatmap y la red de influencias finales, guarda la matriz y ejecuta el calculo con el backend. Esta vista preliminar te ayuda a validar rapidamente la distribucion de dependencia y motricidad.
              </div>
            )}

            {summary && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="surface-muted p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Total de variables
                  </span>
                  <div className="mt-2 text-3xl font-semibold text-white">{summary.total}</div>
                </div>
                <div className="surface-muted p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Media dependencia (X)
                  </span>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    {summary.avgX.toFixed(2)}
                  </div>
                </div>
                <div className="surface-muted p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Media motricidad (Y)
                  </span>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    {summary.avgY.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <div className="space-y-4 surface-muted p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    Plano dependencia vs motricidad
                  </h3>
                </div>
                <div className="relative h-[420px] rounded-2xl border border-[rgb(63,124,165,0.35)] bg-[rgba(15,33,45,0.8)]">
                  {!dataPoints.length ? (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
                      Calcula la matriz para visualizar el plano de dependencia vs motricidad.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 24, bottom: 48, left: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#254861" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={scatterDomain.x}
                          tick={{ fill: "#94a3b8" }}
                          stroke="#475569"
                        >
                          <Label value="Dependencia (X)" position="bottom" fill="#cbd5f5" offset={0} />
                        </XAxis>
                        <YAxis
                          type="number"
                          dataKey="y"
                          domain={scatterDomain.y}
                          tick={{ fill: "#94a3b8" }}
                          stroke="#475569"
                        >
                          <Label value="Motricidad (Y)" angle={-90} position="left" fill="#cbd5f5" offset={10} />
                        </YAxis>
                        {Number.isFinite(analysis.x_cut) && (
                          <ReferenceLine x={analysis.x_cut} stroke="#d9dcd6" strokeDasharray="4 4" />
                        )}
                        {Number.isFinite(analysis.y_cut) && (
                          <ReferenceLine y={analysis.y_cut} stroke="rgb(129,195,215)" strokeDasharray="4 4" />
                        )}
                        <Tooltip
                          cursor={{ strokeDasharray: "4 4", stroke: "#475569" }}
                          formatter={(value: number, _name, props) => {
                            const key = (props as Payload<number, string> | undefined)?.dataKey;
                            const label = key === "x" ? "Dependencia" : "Motricidad";
                            return [value.toFixed(2), label];
                          }}
                          labelFormatter={(_label: any, payload: Payload<number, "Dependencia" | "Motricidad">[]) => {
                            const entry = payload?.[0]?.payload as ScatterPoint | undefined;
                            return entry?.name ?? "";
                          }}
                        />
                        <Scatter
                          data={dataPoints}
                          name="Variables"
                          isAnimationActive={false}
                          legendType="circle"
                          shape={renderScatterPoint}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="surface-muted p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Corte dependencias (X)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {analysis.x_cut.toFixed(2)}
                    </div>
                  </div>
                  <div className="surface-muted p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Corte motricidad (Y)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {analysis.y_cut.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 surface-muted p-5">
                <h3 className="text-lg font-semibold text-white">Cuadrantes</h3>
                <ul className="divide-y divide-white/10 text-sm">
                  {analysis.variables.map((name, idx) => (
                    <li key={name} className={clsx("flex items-center justify-between gap-3 py-2", idx === 0 && "pt-0", idx === analysis.variables.length - 1 && "pb-0")}>
                      <span className="truncate text-slate-100">{name}</span>
                      <span className={quadrantBadgeClasses(analysis.quadrants[name])}>
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: getQuadrantColor(analysis.quadrants[name]) }}
                        />
                        {getQuadrantDisplayName(analysis.quadrants[name])}
                      </span>
                    </li>
                  ))}
                </ul>
                {summary && (
                  <div className="surface-muted p-3 text-xs text-slate-300">
                    {Object.entries(summary.counts).map(([quad, count]) => (
                      <div key={quad} className="flex items-center justify-between py-1">
                        <span>{quad}</span>
                        <span className="font-semibold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="surface-muted p-5">
              <h3 className="text-lg font-semibold text-white">Distribucion por variable</h3>
              <div className="mt-4 h-[420px] rounded-2xl border border-[rgb(63,124,165,0.35)] bg-[rgba(15,33,45,0.8)]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.variables.map((name, index) => ({
                      name,
                      Dependencia: analysis.dependencia_x[index],
                      Motricidad: analysis.motricidad_y[index],
                    }))}
                    margin={{ top: 20, right: 24, bottom: 48, left: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#254861" />
                    <XAxis
                      dataKey="name"
                      angle={-25}
                      textAnchor="end"
                      height={80}
                      tick={{ fill: "#94a3b8" }}
                      stroke="#475569"
                    />
                    <YAxis tick={{ fill: "#94a3b8" }} stroke="#475569" />
                    <Tooltip formatter={(value: number) => value.toFixed(2)} />
                    <Legend />
                    <ReferenceLine y={analysis.x_cut} stroke="#d9dcd6" strokeDasharray="4 4" />
                    <ReferenceLine y={analysis.y_cut} stroke="rgb(129,195,215)" strokeDasharray="4 4" />
                    <Bar
                      dataKey="Dependencia"
                      name="Dependencia (X)"
                      fill="#3a7ca5"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="Motricidad"
                      name="Motricidad (Y)"
                      fill="#81c3d7"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 surface-muted p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Heatmap</h3>
                  {heatmapLoading && (
                    <span className="text-xs text-slate-300">Actualizando...</span>
                  )}
                </div>
                {heatmapError && (
                  <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                    {heatmapError}
                  </div>
                )}
                {heatmap && !heatmapError && (
                  <div className="overflow-auto rounded-2xl border border-[rgb(63,124,165,0.35)]">
                    <table className="min-w-full border-separate border-spacing-0 text-sm text-slate-100">
                      <thead className="sticky top-0 z-10 bg-[#102637]/90 backdrop-blur">
                        <tr>
                          <th className="sticky left-0 z-20 border-b border-[rgb(129,195,215,0.25)] bg-[#102637]/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                            Var
                          </th>
                          {heatmap.variables.map((name, index) => (
                            <th
                              key={index}
                              className="border-b border-[rgb(129,195,215,0.25)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300"
                            >
                              {name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmap.variables.map((row, i) => (
                          <tr key={row} className={i % 2 === 0 ? "bg-[rgba(47,102,144,0.14)]" : "bg-[rgba(22,66,91,0.4)]"}>
                            <th className="sticky left-0 z-10 border-b border-[rgb(129,195,215,0.25)] bg-[#102637]/85 px-4 py-3 text-left text-sm font-medium text-white">
                              {row}
                            </th>
                            {heatmap.variables.map((_, j) => {
                              const value = heatmap.matrix[i][j];
                              const min = heatmap.scale.min;
                              const max = heatmap.scale.max;
                              const t = (value - min) / ((max - min) || 1);
                              const background =
                                i === j ? "rgba(15,23,42,0.4)" : `hsl(${Math.round(210 - 210 * t)} 80% ${20 + 30 * t}%)`;
                              return (
                                <td
                                  key={j}
                                  className="border-b border-[rgb(129,195,215,0.25)] px-3 py-2 text-center text-sm font-medium text-slate-100"
                                  style={{ background }}
                                >
                                  {value}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-4 surface-muted p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Red de influencias</h3>
                    <p className="text-xs text-slate-300">
                      Ajusta el umbral minimo y elige si prefieres una visualizacion dirigida o agregada.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <span className="text-slate-200">Umbral</span>
                      <input
                        type="number"
                        className="input-surface w-24 text-right"
                        value={minW}
                        min={0}
                        step={1}
                        onChange={(event) => handleMinWeightChange(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={directed}
                        onChange={(event) => setDirected(event.target.checked)}
                        className="h-4 w-4 rounded border border-[rgb(129,195,215,0.45)] bg-[rgba(15,33,45,0.9)] text-[rgb(129,195,215)] focus:ring-[rgb(129,195,215)]/60"
                      />
                      Dirigido
                    </label>
                  </div>
                </div>

                {graphError && (
                  <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                    {graphError}
                  </div>
                )}

                {graphLoading && (
                  <div className="flex h-64 items-center justify-center rounded-2xl border border-[rgb(63,124,165,0.35)] bg-[rgba(15,33,45,0.85)] text-sm text-slate-300">
                    <Spinner /> Cargando red...
                  </div>
                )}

                {!graphLoading && graph && (
                  <>
                    <InfluencesGraph graph={graph} />
                    {graph.links.length === 0 && (
                      <p className="text-xs text-slate-300">
                        No hay influencias que superen el umbral seleccionado. Prueba con un valor menor.
                      </p>
                    )}
                  </>
                )}

                {!graphLoading && !graph && !graphError && (
                  <p className="text-sm text-slate-300">
                    Calcula la matriz para visualizar la red de influencias.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
      <ScaleManagerModal
        open={showScaleModal && !!editingScale}
        onClose={() => setShowScaleModal(false)}
        scale={editingScale as any}
        values={scaleValues}
        setValues={setScaleValues}
        busy={scaleBusy}
        error={scaleError}
        onSave={saveScaleValues}
      />
    </main>
  );
}

// GraphCanvas moved to components/organisms/InfluencesGraph




