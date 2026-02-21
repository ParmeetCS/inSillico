"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface NetworkNode {
    id: string;
    label: string;
    degree: number;
    is_drug_target: boolean;
    centrality: number;
    // Layout positions (computed)
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

interface NetworkEdge {
    source: string;
    target: string;
    score: number;
    interaction_type?: string;
}

interface NetworkGraphProps {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    width?: number;
    height?: number;
    onNodeClick?: (node: NetworkNode) => void;
    highlightGenes?: string[];
}

// ═══════════════════════════════════════════════════════════════
//  Color Map by node type
// ═══════════════════════════════════════════════════════════════

const NODE_COLORS = {
    drug_target: "#3b82f6",      // blue
    hub_gene: "#f59e0b",         // amber
    interactor: "#6366f1",       // indigo
    highlighted: "#10b981",      // green
};

const EDGE_COLOR = "rgba(148, 163, 184, 0.3)";
const EDGE_HIGHLIGHT = "rgba(59, 130, 246, 0.6)";

// ═══════════════════════════════════════════════════════════════
//  Force-Directed Layout (simple spring simulation)
// ═══════════════════════════════════════════════════════════════

function forceDirectedLayout(
    nodes: NetworkNode[],
    edges: NetworkEdge[],
    width: number,
    height: number,
    iterations: number = 150
): NetworkNode[] {
    if (nodes.length === 0) return [];

    const cx = width / 2;
    const cy = height / 2;
    const k = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 0.6;

    // Initialize positions in a circle
    const positioned = nodes.map((n, i) => ({
        ...n,
        x: cx + (Math.cos((2 * Math.PI * i) / nodes.length) * k * 1.5),
        y: cy + (Math.sin((2 * Math.PI * i) / nodes.length) * k * 1.5),
        vx: 0,
        vy: 0,
    }));

    const nodeMap = new Map(positioned.map((n) => [n.id, n]));

    for (let iter = 0; iter < iterations; iter++) {
        const temp = 1 - iter / iterations; // cooling
        const alpha = 0.1 * temp;

        // Repulsive force (all pairs)
        for (let i = 0; i < positioned.length; i++) {
            for (let j = i + 1; j < positioned.length; j++) {
                const a = positioned[i];
                const b = positioned[j];
                let dx = a.x! - b.x!;
                let dy = a.y! - b.y!;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (k * k) / dist;
                const fx = (dx / dist) * force * alpha;
                const fy = (dy / dist) * force * alpha;
                a.vx! += fx;
                a.vy! += fy;
                b.vx! -= fx;
                b.vy! -= fy;
            }
        }

        // Attractive force (edges)
        for (const edge of edges) {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) continue;
            let dx = b.x! - a.x!;
            let dy = b.y! - a.y!;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist * dist) / k;
            const strength = edge.score || 0.5;
            const fx = (dx / dist) * force * alpha * strength;
            const fy = (dy / dist) * force * alpha * strength;
            a.vx! += fx;
            a.vy! += fy;
            b.vx! -= fx;
            b.vy! -= fy;
        }

        // Gravity toward center
        for (const n of positioned) {
            const dx = cx - n.x!;
            const dy = cy - n.y!;
            n.vx! += dx * 0.01 * alpha;
            n.vy! += dy * 0.01 * alpha;
        }

        // Apply velocities with damping
        for (const n of positioned) {
            n.x! += n.vx! * 0.8;
            n.y! += n.vy! * 0.8;
            n.vx! *= 0.9;
            n.vy! *= 0.9;

            // Keep nodes in bounds
            const pad = 40;
            n.x = Math.max(pad, Math.min(width - pad, n.x!));
            n.y = Math.max(pad, Math.min(height - pad, n.y!));
        }
    }

    return positioned;
}

// ═══════════════════════════════════════════════════════════════
//  Network Graph Component
// ═══════════════════════════════════════════════════════════════

export default function NetworkGraph({
    nodes,
    edges,
    width: propWidth,
    height: propHeight,
    onNodeClick,
    highlightGenes = [],
}: NetworkGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: propWidth || 800, height: propHeight || 500 });
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NetworkNode } | null>(null);

    // Responsive sizing
    useEffect(() => {
        if (propWidth && propHeight) return;
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                setDimensions({ width: Math.floor(width), height: Math.floor(Math.max(height, 400)) });
            }
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, [propWidth, propHeight]);

    // Compute layout
    const layoutNodes = useMemo(() => {
        return forceDirectedLayout(nodes, edges, dimensions.width, dimensions.height);
    }, [nodes, edges, dimensions.width, dimensions.height]);

    const nodeMap = useMemo(() => new Map(layoutNodes.map((n) => [n.id, n])), [layoutNodes]);

    const highlightSet = useMemo(() => new Set(highlightGenes.map((g) => g.toUpperCase())), [highlightGenes]);

    // Node color
    const getNodeColor = useCallback(
        (node: NetworkNode) => {
            if (highlightSet.has(node.id.toUpperCase())) return NODE_COLORS.highlighted;
            if (node.id === hoveredNode || node.id === selectedNode) return "#f59e0b";
            if (node.is_drug_target) return NODE_COLORS.drug_target;
            if (node.degree >= 3) return NODE_COLORS.hub_gene;
            return NODE_COLORS.interactor;
        },
        [highlightSet, hoveredNode, selectedNode]
    );

    // Node radius based on degree
    const getNodeRadius = useCallback(
        (node: NetworkNode) => Math.max(8, Math.min(22, 8 + node.degree * 2.5)),
        []
    );

    // Edge connected to hovered/selected node?
    const isEdgeHighlighted = useCallback(
        (edge: NetworkEdge) => {
            const active = hoveredNode || selectedNode;
            if (!active) return false;
            return edge.source === active || edge.target === active;
        },
        [hoveredNode, selectedNode]
    );

    const handleNodeClick = useCallback(
        (node: NetworkNode) => {
            setSelectedNode((prev) => (prev === node.id ? null : node.id));
            onNodeClick?.(node);
        },
        [onNodeClick]
    );

    if (nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-[400px] text-slate-400">
                <p>No network data to display</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full min-h-[400px] relative">
            <svg
                width={dimensions.width}
                height={dimensions.height}
                className="bg-slate-900/30 rounded-xl border border-slate-700/30"
            >
                {/* Legend */}
                <g transform="translate(12, 16)">
                    <circle cx={6} cy={0} r={5} fill={NODE_COLORS.drug_target} />
                    <text x={16} y={4} fill="#94a3b8" fontSize={10}>
                        Drug Target
                    </text>
                    <circle cx={106} cy={0} r={5} fill={NODE_COLORS.hub_gene} />
                    <text x={116} y={4} fill="#94a3b8" fontSize={10}>
                        Hub Gene
                    </text>
                    <circle cx={196} cy={0} r={5} fill={NODE_COLORS.interactor} />
                    <text x={206} y={4} fill="#94a3b8" fontSize={10}>
                        Interactor
                    </text>
                </g>

                {/* Edges */}
                {edges.map((edge, i) => {
                    const a = nodeMap.get(edge.source);
                    const b = nodeMap.get(edge.target);
                    if (!a || !b) return null;
                    const highlighted = isEdgeHighlighted(edge);
                    return (
                        <line
                            key={`edge-${i}`}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={highlighted ? EDGE_HIGHLIGHT : EDGE_COLOR}
                            strokeWidth={highlighted ? 2.5 : 1 + edge.score * 1.5}
                            strokeOpacity={highlighted ? 1 : 0.5}
                        />
                    );
                })}

                {/* Nodes */}
                {layoutNodes.map((node) => {
                    const r = getNodeRadius(node);
                    const color = getNodeColor(node);
                    const isActive = node.id === hoveredNode || node.id === selectedNode;
                    return (
                        <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={() => {
                                setHoveredNode(node.id);
                                setTooltip({ x: node.x!, y: node.y!, node });
                            }}
                            onMouseLeave={() => {
                                setHoveredNode(null);
                                setTooltip(null);
                            }}
                            onClick={() => handleNodeClick(node)}
                        >
                            {/* Glow effect for active */}
                            {isActive && (
                                <circle
                                    r={r + 6}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    opacity={0.4}
                                />
                            )}
                            {/* Main circle */}
                            <circle
                                r={r}
                                fill={color}
                                fillOpacity={0.85}
                                stroke={isActive ? "#fff" : color}
                                strokeWidth={isActive ? 2 : 1}
                            />
                            {/* Label */}
                            <text
                                y={r + 14}
                                textAnchor="middle"
                                fill="#e2e8f0"
                                fontSize={Math.max(9, Math.min(12, r - 1))}
                                fontWeight={isActive ? 700 : 500}
                            >
                                {node.label}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="absolute pointer-events-none z-50 bg-slate-800/95 border border-slate-600/50 
                               rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl backdrop-blur-sm"
                    style={{
                        left: Math.min(tooltip.x + 20, dimensions.width - 180),
                        top: Math.max(tooltip.y - 60, 10),
                    }}
                >
                    <p className="font-bold text-white">{tooltip.node.label}</p>
                    <p>Degree: {tooltip.node.degree}</p>
                    <p>Centrality: {(tooltip.node.centrality * 100).toFixed(1)}%</p>
                    <p>{tooltip.node.is_drug_target ? "🎯 Drug Target" : "🔗 Interactor"}</p>
                </div>
            )}

            {/* Stats */}
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-500">
                {nodes.length} nodes · {edges.length} edges
            </div>
        </div>
    );
}
