type GraphOut = {
  nodes: { id: number; name: string }[];
  links: { source: number; target: number; weight: number }[];
};

export function InfluencesGraph({ graph }: { graph: GraphOut }) {
  const nodes = graph.nodes ?? [];
  if (!nodes.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-[rgba(63,124,165,0.35)] bg-[rgba(15,33,45,0.85)] text-sm text-slate-300">
        Sin nodos para mostrar.
      </div>
    );
  }

  const size = 520;
  const radius = 200;
  const centerX = size / 2;
  const centerY = size / 2;
  const count = nodes.length;

  const positions = nodes.map((node, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  const posById = new Map(positions.map((node) => [node.id, node]));
  const maxWeight = graph.links.length ? Math.max(...graph.links.map((edge) => edge.weight)) : 1;

  return (
    <div className="surface-muted p-4 h-[420px] md:h-[480px]">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto block max-w-full">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#81c3d7" />
          </marker>
        </defs>
        {graph.links.map((edge, index) => {
          const source = posById.get(edge.source);
          const target = posById.get(edge.target);
          if (!source || !target) return null;
          const intensity = edge.weight / (maxWeight || 1);
          const strokeWidth = 1.5 + 3 * intensity;
          const stroke = '#3a7ca5'; // cerulean
          return (
            <line
              key={index}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={0.3 + 0.55 * intensity}
              markerEnd="url(#arrowhead)"
            />
          );
        })}
        {positions.map((node, index) => (
          <g key={index}>
            <circle
              cx={node.x}
              cy={node.y}
              r={18}
              fill="#102637"
              stroke="#2f6690"
              strokeWidth={1.5}
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize="11"
              fill="#e0f2fe"
            >
              {node.name.slice(0, 3).toUpperCase()}
            </text>
            <text
              x={node.x}
              y={node.y + 28}
              textAnchor="middle"
              fontSize="10"
              fill="#cbd5f5"
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
