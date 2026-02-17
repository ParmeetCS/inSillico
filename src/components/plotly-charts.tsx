"use client";

import { useRef, useEffect, useState } from "react";

declare global {
    interface Window {
        Plotly: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

/* ─── Shared data interface for all chart components ─── */
export interface ChartData {
    logP?: number;
    mw?: number;
    hbd?: number;
    hba?: number;
    tpsa?: number;
    rotBonds?: number;
    pKa?: number;
    solubility?: number;
    bioavailability?: number;
    herg?: number;
    ames?: number;
    hepato?: number;
    moleculeName?: string;
}

/* ─── Load Plotly CDN ─── */
function usePlotly() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (window.Plotly) { setReady(true); return; }
        const s = document.createElement("script");
        s.src = "https://cdn.plot.ly/plotly-2.35.0.min.js";
        s.onload = () => setReady(true);
        document.head.appendChild(s);
    }, []);
    return ready;
}

/* ─── Dark theme layout defaults ─── */
const DARK_LAYOUT = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#94a3b8", family: "Inter, sans-serif", size: 11 },
    margin: { t: 36, r: 24, b: 40, l: 48 },
    xaxis: {
        gridcolor: "rgba(148,163,184,0.08)",
        zerolinecolor: "rgba(148,163,184,0.12)",
    },
    yaxis: {
        gridcolor: "rgba(148,163,184,0.08)",
        zerolinecolor: "rgba(148,163,184,0.12)",
    },
    legend: { orientation: "h" as const, y: -0.18 },
};

/* ═══════════════════════════════════════════════════════
   1. Radar Chart — Drug-likeness (Lipinski Rule of 5)
   ═══════════════════════════════════════════════════════ */
export function RadarPropertyChart({ height = 320, data }: { height?: number; data?: ChartData }) {
    const ref = useRef<HTMLDivElement>(null);
    const ready = usePlotly();
    const d = data ?? {};
    const logP = d.logP ?? 1.43;
    const mw = d.mw ?? 180.16;
    const hbd = d.hbd ?? 1;
    const hba = d.hba ?? 4;
    const tpsa = d.tpsa ?? 63.6;
    const rotBonds = d.rotBonds ?? 3;
    const name = d.moleculeName ?? "Compound";

    useEffect(() => {
        if (!ready || !ref.current) return;
        const categories = ["LogP", "MW", "HBD", "HBA", "TPSA", "RotBonds"];
        window.Plotly.newPlot(ref.current, [{
            type: "scatterpolar",
            r: [logP, mw, hbd, hba, tpsa, rotBonds],
            theta: categories,
            fill: "toself",
            fillcolor: "rgba(59,130,246,0.15)",
            line: { color: "#3b82f6", width: 2 },
            marker: { color: "#60a5fa", size: 6 },
            name,
        }, {
            type: "scatterpolar",
            r: [5, 500, 5, 10, 140, 10],
            theta: categories,
            fill: "toself",
            fillcolor: "rgba(34,197,94,0.06)",
            line: { color: "rgba(34,197,94,0.35)", width: 1, dash: "dot" },
            name: "Lipinski Limit",
        }], {
            ...DARK_LAYOUT,
            polar: {
                bgcolor: "rgba(0,0,0,0)",
                radialaxis: { visible: true, color: "#475569", gridcolor: "rgba(148,163,184,0.08)" },
                angularaxis: { color: "#94a3b8" },
            },
            title: { text: "Drug-likeness Radar", font: { size: 13, color: "#e2e8f0" } },
            showlegend: true,
            height,
        }, { responsive: true, displayModeBar: false });
    }, [ready, height, logP, mw, hbd, hba, tpsa, rotBonds, name]);

    return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}

/* ═══════════════════════════════════════════════════════
   2. Bar Chart — Physicochemical Properties
   ═══════════════════════════════════════════════════════ */
export function PropertyBarChart({ height = 280, data }: { height?: number; data?: ChartData }) {
    const ref = useRef<HTMLDivElement>(null);
    const ready = usePlotly();
    const d = data ?? {};
    const logP = d.logP ?? 1.43;
    const pKa = d.pKa ?? 3.49;
    const sol = d.solubility ?? 4.6;
    const tpsa = d.tpsa ?? 63.6;
    const bio = d.bioavailability ?? 68;

    useEffect(() => {
        if (!ready || !ref.current) return;
        const props = ["LogP", "pKa", "Solubility\n(mg/mL)", "TPSA\n(Å²)", "Bioavail.\n(%)"];
        const vals = [logP, pKa, sol, tpsa, bio];
        const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e"];

        window.Plotly.newPlot(ref.current, [{
            type: "bar",
            x: props,
            y: vals,
            marker: {
                color: colors,
                line: { color: colors.map(c => c + "cc"), width: 1 },
            },
            text: vals.map(v => typeof v === "number" ? (Number.isInteger(v) ? v.toString() : v.toFixed(2)) : String(v)),
            textposition: "outside",
            textfont: { color: "#e2e8f0", size: 11 },
        }], {
            ...DARK_LAYOUT,
            title: { text: "Predicted Properties", font: { size: 13, color: "#e2e8f0" } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: "Value", font: { size: 10 } } },
            showlegend: false,
            height,
            bargap: 0.35,
        }, { responsive: true, displayModeBar: false });
    }, [ready, height, logP, pKa, sol, tpsa, bio]);

    return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}

/* ═══════════════════════════════════════════════════════
   3. Gauge Charts — Toxicity Risk
   ═══════════════════════════════════════════════════════ */
export function ToxicityGauges({ height = 200, data }: { height?: number; data?: ChartData }) {
    const ref = useRef<HTMLDivElement>(null);
    const ready = usePlotly();
    const d = data ?? {};
    const herg = d.herg ?? 18;
    const ames = d.ames ?? 12;
    const hepato = d.hepato ?? 25;

    useEffect(() => {
        if (!ready || !ref.current) return;
        const makeGauge = (title: string, value: number, domain: { x: [number, number] }) => ({
            type: "indicator" as const,
            mode: "gauge+number" as const,
            value,
            title: { text: title, font: { size: 11, color: "#94a3b8" } },
            number: { suffix: "%", font: { size: 16, color: "#e2e8f0" } },
            domain: { ...domain, y: [0, 1] },
            gauge: {
                axis: { range: [0, 100], tickcolor: "#475569", dtick: 25 },
                bar: { color: value < 30 ? "#22c55e" : value < 60 ? "#f59e0b" : "#ef4444", thickness: 0.7 },
                bgcolor: "rgba(30,41,59,0.5)",
                borderwidth: 0,
                steps: [
                    { range: [0, 30], color: "rgba(34,197,94,0.08)" },
                    { range: [30, 60], color: "rgba(245,158,11,0.08)" },
                    { range: [60, 100], color: "rgba(239,68,68,0.08)" },
                ],
            },
        });

        window.Plotly.newPlot(ref.current, [
            makeGauge("hERG Inhibition", herg, { x: [0, 0.33] }),
            makeGauge("Ames Mutagenicity", ames, { x: [0.34, 0.66] }),
            makeGauge("Hepatotoxicity", hepato, { x: [0.67, 1] }),
        ], {
            ...DARK_LAYOUT,
            height,
            margin: { t: 24, b: 8, l: 24, r: 24 },
        }, { responsive: true, displayModeBar: false });
    }, [ready, height, herg, ames, hepato]);

    return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}

/* ═══════════════════════════════════════════════════════
   4. Solubility pH Curve
   ═══════════════════════════════════════════════════════ */
export function SolubilityCurve({ height = 280, data }: { height?: number; data?: ChartData }) {
    const ref = useRef<HTMLDivElement>(null);
    const ready = usePlotly();
    const d = data ?? {};
    const pKa = d.pKa ?? 3.49;
    const maxSol = d.solubility ?? 93.1;
    const name = d.moleculeName ?? "Compound";

    useEffect(() => {
        if (!ready || !ref.current) return;
        // Generate pH-dependent solubility curve using Henderson–Hasselbalch (weak acid)
        const pH = [1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.4, 8, 9, 10, 11, 12, 13];
        const sol = pH.map(p => {
            const ratio = Math.pow(10, p - pKa);
            const fraction = ratio / (1 + ratio);
            return Math.round(fraction * maxSol * 10) / 10;
        });

        window.Plotly.newPlot(ref.current, [{
            type: "scatter",
            x: pH,
            y: sol,
            mode: "lines+markers",
            line: { color: "#06b6d4", width: 2.5, shape: "spline" },
            marker: { color: "#22d3ee", size: 5 },
            fill: "tozeroy",
            fillcolor: "rgba(6,182,212,0.08)",
            name,
        }, {
            type: "scatter",
            x: [7.4, 7.4],
            y: [0, maxSol * 1.05],
            mode: "lines",
            line: { color: "#f59e0b", width: 1.5, dash: "dash" },
            name: "Physiological pH",
        }], {
            ...DARK_LAYOUT,
            title: { text: "Solubility vs pH Profile", font: { size: 13, color: "#e2e8f0" } },
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: "pH", font: { size: 10 } }, range: [0, 14] },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: "Solubility (mg/mL)", font: { size: 10 } } },
            showlegend: true,
            height,
        }, { responsive: true, displayModeBar: false });
    }, [ready, height, pKa, maxSol, name]);

    return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}
