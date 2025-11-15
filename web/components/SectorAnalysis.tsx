"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Scatter,
  ReferenceLine,
} from "recharts";
import { useMemo } from "react";

type ComputeOut = {
  variables: string[];
  dependencia_x: number[];
  motricidad_y: number[];
  x_cut?: number; // opcional: corte/umbral X si ya viene precalculado
  y_cut?: number; // opcional: corte/umbral Y si ya viene precalculado
};

type Point = { name: string; x: number; y: number };

function toPoints(from: ComputeOut): Point[] {
  const n = Math.min(
    from.variables.length,
    from.dependencia_x.length,
    from.motricidad_y.length
  );
  const arr: Point[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      name: from.variables[i],
      x: Number(from.dependencia_x[i] ?? 0),
      y: Number(from.motricidad_y[i] ?? 0),
    });
  }
  return arr;
}

function mean(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function niceDomain(min: number, max: number) {
  // agrega un pequeño margen para que no queden pegados a los bordes
  if (min === max) return [min - 1, max + 1] as const;
  const pad = (max - min) * 0.1;
  return [Math.floor(min - pad), Math.ceil(max + pad)] as const;
}

export default function SectorAnalysis({
  data,
  title = "ANÁLISIS SECTORIAL",
}: {
  data: ComputeOut;
  title?: string;
}) {
  const points = useMemo(() => toPoints(data), [data]);

  const xAvg = useMemo(
    () => (typeof data.x_cut === "number" ? data.x_cut : mean(points.map((d) => d.x))),
    [data.x_cut, points]
  );
  const yAvg = useMemo(
    () => (typeof data.y_cut === "number" ? data.y_cut : mean(points.map((d) => d.y))),
    [data.y_cut, points]
  );

  const [xMin, xMax] = useMemo(() => {
    if (!points.length) return [0, 1] as const;
    const xs = points.map((d) => d.x);
    return niceDomain(Math.min(...xs), Math.max(...xs));
  }, [points]);

  const [yMin, yMax] = useMemo(() => {
    if (!points.length) return [0, 1] as const;
    const ys = points.map((d) => d.y);
    return niceDomain(Math.min(...ys), Math.max(...ys));
  }, [points]);

  return (
    <div
      className="sa-card"
      style={{
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background:
          "linear-gradient(180deg, rgba(250,250,250,1) 0%, rgba(245,247,250,1) 100%)",
        boxShadow:
          "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)",
        padding: 16,
      }}
    >
      <div
        className="sa-header"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 18 }}>{title}</h3>
        <div
          className="sa-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: 8,
            fontSize: 12,
            color: "#334155",
          }}
        >
          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "6px 10px",
            }}
          >
            <div style={{ opacity: 0.7 }}>Promedio X (Dependencia)</div>
            <div style={{ fontWeight: 700 }}>{xAvg.toFixed(2)}</div>
          </div>
          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "6px 10px",
            }}
          >
            <div style={{ opacity: 0.7 }}>Promedio Y (Motricidad)</div>
            <div style={{ fontWeight: 700 }}>{yAvg.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: 420 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Dependencia"
              domain={[xMin, xMax]}
              label={{ value: "Dependencia (X)", position: "insideBottom", dy: 10 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Motricidad"
              domain={[yMin, yMax]}
              label={{
                value: "Motricidad (Y)",
                angle: -90,
                position: "insideLeft",
                dx: -10,
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(value: any, name: any, props) => {
                const v = typeof value === "number" ? value.toFixed(2) : value;
                return [v, name === "x" ? "Dependencia" : name === "y" ? "Motricidad" : name];
              }}
              labelFormatter={(label: any, payload) =>
                payload && payload[0] ? payload[0].payload.name : ""
              }
            />

            {/* La “cruz” de promedios */}
            <ReferenceLine
              x={xAvg}
              stroke="#dc2626"
              strokeDasharray="6 6"
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={yAvg}
              stroke="#dc2626"
              strokeDasharray="6 6"
              ifOverflow="extendDomain"
            />

            <Scatter name="Variables" data={points} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
