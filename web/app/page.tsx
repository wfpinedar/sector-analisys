"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
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
type ParsedDataset = { variables: string[]; matrix: number[][] };

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

function formatTick(value: number) {
  if (!Number.isFinite(value)) return "";
  const fixed = Number(value).toFixed(2);
  return fixed;
}

function normalizeNumberCell(cell: any, rowIndex: number, colIndex: number) {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (typeof cell === "string") {
    const normalized = cell.trim().replace(",", ".");
    if (!normalized) return 0;
    const num = Number(normalized);
    if (Number.isFinite(num)) return num;
  }
  if (cell === null || cell === undefined || cell === "") return 0;
  throw new Error(`Valor no numerico en la posicion (${rowIndex}, ${colIndex}).`);
}

function parseVariablesRows(rows: any[][]) {
  if (!rows.length) return [];
  const header = rows[0].map((cell) => String(cell ?? "").trim().toLowerCase());
  let nameIdx = header.findIndex((h) => h === "name" || h === "variable" || h === "nombre");
  const dataRows = nameIdx >= 0 ? rows.slice(1) : rows;
  if (nameIdx < 0) nameIdx = 0;
  const names = dataRows
    .map((row) => String(row[nameIdx] ?? "").trim())
    .filter((v) => v);
  return names;
}

function parseMatrixTable(rows: any[][]): ParsedDataset {
  if (!rows.length) throw new Error("El archivo no contiene datos.");
  const headerCells = (rows[0] ?? []).slice(1).map((cell) => String(cell ?? "").trim());
  if (!headerCells.length) throw new Error("La primera fila debe listar los nombres de variables.");
  const variables = headerCells.map((name, idx) => {
    if (!name) throw new Error(`Asigna un nombre a la variable ${idx + 1} en la cabecera.`);
    return name;
  });
  const body = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
  if (body.length !== variables.length) {
    throw new Error(`La matriz debe ser ${variables.length}x${variables.length}; se encontraron ${body.length} filas con datos.`);
  }
  const matrix = body.map((row, rowIndex) => {
    const rowName = String(row[0] ?? "").trim();
    if (rowName && rowName !== variables[rowIndex]) {
      throw new Error(
        `El nombre de fila "${rowName}" no coincide con "${variables[rowIndex]}" en la fila ${rowIndex + 2}.`
      );
    }
    const values = variables.map((_, colIndex) =>
      normalizeNumberCell(row[colIndex + 1], rowIndex + 2, colIndex + 2)
    );
    return values;
  });
  return { variables, matrix };
}

async function parseExcelFile(file: File): Promise<ParsedDataset> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new Error("El Excel no tiene hojas para leer.");
  }
  const sheetNames = workbook.SheetNames;
  const matrixSheetName =
    sheetNames.find((name) => name.toLowerCase().includes("mat")) ??
    sheetNames.find((name) => name.toLowerCase().includes("matriz")) ??
    sheetNames[0];
  const matrixRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[matrixSheetName], {
    header: 1,
    blankrows: false,
  });
  const parsed = parseMatrixTable(matrixRows);

  const varsSheetName = sheetNames.find((name) => name.toLowerCase().includes("var"));
  if (varsSheetName) {
    const varsRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[varsSheetName], {
      header: 1,
      blankrows: false,
    });
    const vars = parseVariablesRows(varsRows);
    if (vars.length === parsed.variables.length) {
      parsed.variables = vars;
    }
  }
  return parsed;
}

function parseCsvVariables(text: string) {
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false });
  const names = parseVariablesRows(rows);
  if (!names.length) throw new Error("variables.csv no tiene nombres validos.");
  return names;
}

function parseCsvMatrix(text: string): ParsedDataset {
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false });
  return parseMatrixTable(rows);
}

function datasetToCsvFiles(data: ParsedDataset) {
  const varsContent = ["name", ...data.variables].join("\n");
  const header = ["", ...data.variables].join(",");
  const body = data.variables.map((name, idx) =>
    [name, ...(data.matrix[idx] ?? []).map((v) => Number(v ?? 0))].join(",")
  );
  const matrixContent = [header, ...body].join("\n");
  const varsFile = new File([varsContent], "variables.csv", { type: "text/csv" });
  const matrixFile = new File([matrixContent], "matrix.csv", { type: "text/csv" });
  return { varsFile, matrixFile };
}

function ChartModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!contentRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(contentRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement("a");
      link.href = dataUrl;
      const safe = title.toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "grafico";
      link.download = `${safe}.png`;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-slate-950/90 p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={download} loading={downloading}>
              Guardar como imagen
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
        <div ref={contentRef} className="mt-4 rounded-xl border border-white/10 bg-slate-900/70 p-3">
          {children}
        </div>
      </div>
    </div>
  );
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
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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
  const [hoveredVar, setHoveredVar] = useState<string | null>(null);
  const [hiddenVars, setHiddenVars] = useState<string[]>([]);
  const [chartModal, setChartModal] = useState<{ title: string; content: ReactNode } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    setHiddenVars((prev) => prev.filter((name) => variables.includes(name)));
    if (hoveredVar && !variables.includes(hoveredVar)) {
      setHoveredVar(null);
    }
  }, [hoveredVar, variables]);

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

  const visibleDataPoints = useMemo(
    () => dataPoints.filter((point) => !hiddenVars.includes(point.name)),
    [dataPoints, hiddenVars]
  );

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

  const barData = useMemo(() => {
    if (!analysis) return [];
    return analysis.variables.map((name, index) => ({
      name,
      Dependencia: analysis.dependencia_x[index],
      Movilidad: analysis.motricidad_y[index],
    }));
  }, [analysis]);

  const visibleBarData = useMemo(
    () => barData.filter((item) => !hiddenVars.includes(item.name)),
    [barData, hiddenVars]
  );

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

  async function refreshMatrixFromApi() {
    if (!projectId) return;
    const snap = await requestJson<any>(`${API}/projects/${projectId}/matrix`);
    const vars: string[] = Array.isArray(snap?.variables) ? snap.variables.map((v: any) => String(v)) : [];
    const mx: number[][] = Array.isArray(snap?.matrix) ? snap.matrix : [];
    if (vars.length) setVariables(vars);
    if (mx.length) setMatrix(mx);
  }

  async function persistImportedDataset(dataset: ParsedDataset) {
    if (!projectId) {
      throw new Error("Crea un proyecto antes de importar archivos.");
    }
    const { varsFile, matrixFile } = datasetToCsvFiles(dataset);
    const formData = new FormData();
    formData.append("variables_file", varsFile);
    formData.append("matrix_file", matrixFile);
    formData.append("replace", "true");
    await requestJson(`${API}/projects/${projectId}/import/csv`, {
      method: "POST",
      body: formData,
    });
    await refreshMatrixFromApi();
    setResult(null);
    await compute();
    setStep(4);
  }

  async function handleImportFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    setImportError(null);
    setImportMessage(null);
    if (!projectId) {
      setImportError("Crea o selecciona un proyecto antes de importar.");
      return;
    }
    const files = Array.from(filesList);
    setImporting(true);
    try {
      const [single] = files;
      const lowerNames = files.map((f) => f.name.toLowerCase());
      const isExcel = files.length === 1 && lowerNames[0].endsWith(".xlsx");
      const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
      if (isExcel && single) {
        const dataset = await parseExcelFile(single);
        await persistImportedDataset(dataset);
        setImportMessage("Archivo Excel importado y matriz reemplazada.");
        return;
      }
      if (csvFiles.length >= 2) {
        const varsFile =
          csvFiles.find((f) => f.name.toLowerCase().includes("var")) ?? csvFiles[0];
        const matrixFile =
          csvFiles.find((f) => f !== varsFile && f.name.toLowerCase().includes("mat")) ??
          csvFiles.find((f) => f !== varsFile) ??
          csvFiles[1];
        if (!varsFile || !matrixFile) throw new Error("Sube variables.csv y matrix.csv.");
        const varsText = await varsFile.text();
        const matrixText = await matrixFile.text();
        const names = parseCsvVariables(varsText);
        const parsed = parseCsvMatrix(matrixText);
        if (names.length !== parsed.variables.length) {
          throw new Error("Los archivos CSV no tienen la misma cantidad de variables.");
        }
        const mismatch = parsed.variables.some((name, idx) => name !== names[idx]);
        if (mismatch) {
          throw new Error("Los encabezados de matrix.csv deben coincidir con variables.csv en orden y nombre.");
        }
        await persistImportedDataset({ variables: names, matrix: parsed.matrix });
        setImportMessage("CSV importados y matriz reemplazada.");
        return;
      }
      throw new Error("Sube un Excel (.xlsx) o ambos CSV: variables.csv y matrix.csv.");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
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

  function toggleVariableVisibility(name: string) {
    setHiddenVars((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
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
    const source = visibleDataPoints.length ? visibleDataPoints : dataPoints;
    if (!source.length) {
      return {
        x: ["auto", "auto"] as [AxisDomainItem, AxisDomainItem],
        y: ["auto", "auto"] as [AxisDomainItem, AxisDomainItem],
      };
    }
    const xs = source.map((point) => point.x);
    const ys = source.map((point) => point.y);
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
  }, [dataPoints, visibleDataPoints]);

  const renderScatterPoint = useCallback((props: any): ReactElement => {
    const { cx, cy, payload } = props;
    if (typeof cx !== "number" || typeof cy !== "number") {
      return <g />;
    }
    const color = getQuadrantColor(payload?.q);
    const isHovered = hoveredVar === payload?.name;
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={isHovered ? 12 : 10}
          fill={`${color}33`}
          stroke={color}
          strokeWidth={2}
        />
        <circle cx={cx} cy={cy} r={isHovered ? 5 : 4} fill="#0f172a" stroke="#0f172a" strokeWidth={1} />
        {isHovered && payload?.name && (
          <text
            x={cx}
            y={cy - 14}
            textAnchor="middle"
            fontSize={12}
            fill="#e0f2fe"
            stroke="#0f172a"
            strokeWidth={0.25}
          >
            {payload.name}
          </text>
        )}
      </g>
    );
  }, [hoveredVar]);

  const openChartPreview = useCallback((title: string, content: ReactNode) => {
    setChartModal({ title, content });
  }, []);

  const renderScatterChart = useCallback(
    (height = 420) => (
      <div
        className="relative rounded-2xl border border-[rgb(63,124,165,0.35)] bg-[rgba(15,33,45,0.8)]"
        style={{ height }}
      >
        {!analysis || !dataPoints.length ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
            Calcula la matriz para visualizar el plano de dependencia vs movilidad.
          </div>
        ) : !visibleDataPoints.length ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
            Activa al menos una variable para verla en el grafico.
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
                tickFormatter={(value) => formatTick(Number(value))}
              >
                <Label value="Dependencia (X)" position="bottom" fill="#cbd5f5" offset={0} />
              </XAxis>
              <YAxis
                type="number"
                dataKey="y"
                domain={scatterDomain.y}
                tick={{ fill: "#94a3b8" }}
                stroke="#475569"
                tickFormatter={(value) => formatTick(Number(value))}
              >
                <Label value="Movilidad (Y)" angle={-90} position="left" fill="#cbd5f5" offset={10} />
              </YAxis>
              {Number.isFinite(analysis?.x_cut) && (
                <ReferenceLine x={analysis?.x_cut} stroke="#d9dcd6" strokeDasharray="4 4" />
              )}
              {Number.isFinite(analysis?.y_cut) && (
                <ReferenceLine y={analysis?.y_cut} stroke="rgb(129,195,215)" strokeDasharray="4 4" />
              )}
              <Tooltip
                cursor={{ strokeDasharray: "4 4", stroke: "#475569" }}
                formatter={(value: number, _name, props) => {
                  const key = (props as Payload<number, string> | undefined)?.dataKey;
                  const label = key === "x" ? "Dependencia" : "Movilidad";
                  return [formatTick(value), label];
                }}
                labelFormatter={(_label: any, payload: Payload<number, "Dependencia" | "Movilidad">[]) => {
                  const entry = payload?.[0]?.payload as ScatterPoint | undefined;
                  return entry?.name ?? "";
                }}
              />
              <Scatter
                data={visibleDataPoints}
                name="Variables"
                isAnimationActive={false}
                legendType="circle"
                shape={renderScatterPoint}
                onMouseEnter={(_e: any, index: number) =>
                  setHoveredVar(visibleDataPoints[index]?.name ?? null)
                }
                onMouseLeave={() => setHoveredVar(null)}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    ),
    [analysis, dataPoints.length, renderScatterPoint, scatterDomain, visibleDataPoints]
  );

  const renderBarChart = useCallback(
    (height = 420) => (
      <div
        className="rounded-2xl border border-[rgb(63,124,165,0.35)] bg-[rgba(15,33,45,0.8)]"
        style={{ height }}
      >
        {!analysis || !barData.length ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            Calcula la matriz para visualizar la distribucion por variable.
          </div>
        ) : !visibleBarData.length ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            Activa variables para mostrarlas en la grafica de barras.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleBarData} margin={{ top: 20, right: 24, bottom: 48, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#254861" />
              <XAxis
                dataKey="name"
                angle={-25}
                textAnchor="end"
                height={80}
                tick={{ fill: "#94a3b8" }}
                stroke="#475569"
              />
              <YAxis tick={{ fill: "#94a3b8" }} stroke="#475569" tickFormatter={(value) => formatTick(Number(value))} />
              <Tooltip formatter={(value: number) => formatTick(value)} />
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
                dataKey="Movilidad"
                name="Movilidad (Y)"
                fill="#81c3d7"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    ),
    [analysis, barData.length, visibleBarData]
  );

  const renderHeatmapContent = useCallback(
    (maxHeight?: string | number) => {
      if (!heatmap) return null;
      return (
        <div
          className="overflow-auto rounded-2xl border border-[rgb(63,124,165,0.35)]"
          style={maxHeight ? { maxHeight } : undefined}
        >
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
                <tr
                  key={row}
                  className={i % 2 === 0 ? "bg-[rgba(47,102,144,0.14)]" : "bg-[rgba(22,66,91,0.4)]"}
                >
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
                        {formatTick(Number(value))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
    [heatmap]
  );

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgb(129,195,215,0.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 space-y-12 md:px-6 lg:px-10">
        <header className="space-y-4 text-center md:text-left">
          <span className="badge-step">
            Matriz cruzada sectorial
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl lg:text-[2.65rem]">
            Analiza la dependencia y movilidad de tu sector paso a paso
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

            <div className="surface-muted flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white">Importar Excel o CSV</div>
                <p className="text-xs leading-relaxed text-slate-300">
                  Sube un Excel (.xlsx) con la matriz o los archivos variables.csv y matrix.csv exportados desde el backend. El contenido reemplaza las variables y celdas actuales del proyecto.
                </p>
                {importError && (
                  <div className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {importError}
                  </div>
                )}
                {importMessage && !importError && (
                  <div className="rounded border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    {importMessage}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  multiple
                  className="hidden"
                  onChange={(event) => handleImportFiles(event.target.files)}
                />
                <Button
                  variant="secondary"
                  onClick={() => importInputRef.current?.click()}
                  loading={importing}
                  disabled={!projectId}
                >
                  {importing ? "Importando..." : "Cargar archivos"}
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
                    Interpreta la posicion de cada variable dentro del plano dependencia versus movilidad y revisa la red de influencias resultante para priorizar acciones de gestion.
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
                Para obtener el heatmap y la red de influencias finales, guarda la matriz y ejecuta el calculo con el backend. Esta vista preliminar te ayuda a validar rapidamente la distribucion de dependencia y movilidad.
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
                    {formatTick(summary.avgX)}
                  </div>
                </div>
                <div className="surface-muted p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Media movilidad (Y)
                  </span>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    {formatTick(summary.avgY)}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <div className="space-y-4 surface-muted p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    Plano dependencia vs movilidad
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    {hiddenVars.length > 0 && (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-slate-200">
                        {hiddenVars.length} ocultas
                      </span>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        openChartPreview("Plano dependencia vs movilidad", renderScatterChart(560))
                      }
                      className="border-[rgb(var(--accent-rgb)_/_0.35)] px-3"
                    >
                      Ver en popup
                    </Button>
                  </div>
                </div>
                {renderScatterChart(420)}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="surface-muted p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Corte dependencias (X)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {formatTick(analysis.x_cut)}
                    </div>
                  </div>
                  <div className="surface-muted p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Corte movilidad (Y)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {formatTick(analysis.y_cut)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 surface-muted p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">Cuadrantes</h3>
                  {hiddenVars.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setHiddenVars([])}
                      className="text-xs text-[rgb(var(--accent-rgb))] underline-offset-2 hover:underline"
                    >
                      Mostrar todas
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-300">
                  Pasa el cursor sobre los puntos para resaltar y usa el check para ocultar variables del plano.
                </p>
                <ul className="divide-y divide-white/10 text-sm">
                  {analysis.variables.map((name, idx) => {
                    const hidden = hiddenVars.includes(name);
                    const highlighted = hoveredVar === name;
                    return (
                      <li
                        key={name}
                        className={clsx(
                          "flex items-center justify-between gap-3 py-2 transition",
                          idx === 0 && "pt-0",
                          idx === analysis.variables.length - 1 && "pb-0",
                          highlighted && "bg-[rgba(129,195,215,0.08)]",
                          hidden && "opacity-60"
                        )}
                        onMouseEnter={() => setHoveredVar(name)}
                        onMouseLeave={() => setHoveredVar(null)}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleVariableVisibility(name)}
                            className="h-4 w-4 rounded border border-[rgb(129,195,215,0.45)] bg-[rgba(15,33,45,0.9)] text-[rgb(129,195,215)] focus:ring-[rgb(129,195,215)]/60"
                          />
                          <span className="truncate text-slate-100">{name}</span>
                        </div>
                        <span className={quadrantBadgeClasses(analysis.quadrants[name])}>
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: getQuadrantColor(analysis.quadrants[name]) }}
                          />
                          {getQuadrantDisplayName(analysis.quadrants[name])}
                        </span>
                      </li>
                    );
                  })}
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">Distribucion por variable</h3>
                <Button
                  variant="secondary"
                  onClick={() => openChartPreview("Distribucion por variable", renderBarChart(560))}
                  className="border-[rgb(var(--accent-rgb)_/_0.35)] px-3"
                >
                  Ver en popup
                </Button>
              </div>
              <div className="mt-4">
                {renderBarChart(420)}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 surface-muted p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">Heatmap</h3>
                    {heatmapLoading && (
                      <span className="text-xs text-slate-300">Actualizando...</span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!heatmap) return;
                      const content = renderHeatmapContent("70vh");
                      if (content) openChartPreview("Heatmap", content);
                    }}
                    disabled={!heatmap || !!heatmapError}
                    className="border-[rgb(var(--accent-rgb)_/_0.35)] px-3"
                  >
                    Ver en popup
                  </Button>
                </div>
                {heatmapError && (
                  <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                    {heatmapError}
                  </div>
                )}
                {heatmap && !heatmapError && renderHeatmapContent()}
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
                    <Button
                      variant="secondary"
                      className="border-[rgb(var(--accent-rgb)_/_0.35)] px-3"
                      disabled={!graph || !!graphError || graphLoading}
                      onClick={() => {
                        if (!graph) return;
                        openChartPreview(
                          "Red de influencias",
                          <div className="h-[520px] md:h-[560px]">
                            <InfluencesGraph graph={graph} />
                          </div>
                        );
                      }}
                    >
                      Ver en popup
                    </Button>
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
      {chartModal && (
        <ChartModal open={!!chartModal} title={chartModal.title} onClose={() => setChartModal(null)}>
          {chartModal.content}
        </ChartModal>
      )}
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
