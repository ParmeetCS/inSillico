"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    ChevronRight, ArrowLeft, Trophy, Crown, AlertTriangle,
    CheckCircle2, Atom, Droplets, FlaskConical, Beaker,
    Activity, TrendingUp, Shield, Sparkles, Target, Zap,
    BarChart3,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import MoleculeViewer3D from "@/components/molecule-viewer-3d";
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Legend, Tooltip,
} from "recharts";

/* ─── Types ─── */
type PropertyStatus = "optimal" | "moderate" | "poor";

interface DisplayProperty {
    value: string | number;
    unit?: string;
    status: PropertyStatus;
}

interface CompoundData {
    name: string;
    smiles: string;
    formula: string;
    mw: number;
    confidence: number;
    runtime: string;
    date: string;
    properties: Record<string, DisplayProperty>;
    toxicity: { herg: number; ames: number; hepato: number };
}

/* ─── Constants ─── */
const COMPOUND_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6"];
const COMPOUND_BG = [
    "rgba(59,130,246,0.08)",
    "rgba(245,158,11,0.08)",
    "rgba(139,92,246,0.08)",
];
const COMPOUND_BORDER = [
    "rgba(59,130,246,0.25)",
    "rgba(245,158,11,0.25)",
    "rgba(139,92,246,0.25)",
];

const STATUS_COLORS: Record<PropertyStatus, { bg: string; border: string; text: string }> = {
    optimal: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
    moderate: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
    poor: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

const ICON_MAP: Record<string, React.ElementType> = {
    logP: Droplets, pKa: FlaskConical, solubility: Beaker,
    tpsa: Activity, bioavailability: TrendingUp, toxicity: Shield,
};

const LABEL_MAP: Record<string, string> = {
    logP: "LogP", pKa: "pKa", solubility: "Solubility",
    tpsa: "TPSA", bioavailability: "Bioavailability", toxicity: "Toxicity Risk",
};

const RADAR_MAXES: Record<string, number> = {
    logP: 6, pKa: 14, solubility: 50, tpsa: 200, bioavailability: 100,
};

/* ─── Helper: determine property winner ─── */
function getPropertyWinner(
    key: string,
    compounds: CompoundData[]
): { winnerIdx: number; insight: string } | null {
    const values = compounds.map(c => {
        const p = c.properties[key];
        if (!p || typeof p.value !== "number") return null;
        return p.value;
    });

    if (values.some(v => v === null)) return null;
    const nums = values as number[];

    // For toxicity-like properties, lower is better
    // For bioavailability, higher is better
    // For others, closer to optimal range is better
    let bestIdx = 0;
    const optimalRanges: Record<string, [number, number]> = {
        logP: [1, 3], pKa: [4, 10], solubility: [10, 100],
        tpsa: [40, 90], bioavailability: [70, 100],
    };

    if (key in optimalRanges) {
        const [lo, hi] = optimalRanges[key];
        const mid = (lo + hi) / 2;
        let bestDist = Infinity;
        nums.forEach((v, i) => {
            const dist = Math.abs(v - mid);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
    } else {
        bestIdx = 0;
    }

    // Generate insight
    if (compounds.length === 2) {
        const diff = Math.abs(nums[0] - nums[1]);
        const pct = nums[bestIdx] !== 0 ? Math.round((diff / Math.abs(nums[bestIdx])) * 100) : 0;
        const label = LABEL_MAP[key] || key;
        const insight = pct > 0
            ? `${compounds[bestIdx].name} has ${pct}% better ${label}`
            : `Both compounds have similar ${label}`;
        return { winnerIdx: bestIdx, insight };
    }

    const label = LABEL_MAP[key] || key;
    return { winnerIdx: bestIdx, insight: `${compounds[bestIdx].name} leads in ${label}` };
}

/* ─── Main Component ─── */
function CompareContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Parse compound data from URL
    const compounds = useMemo<CompoundData[]>(() => {
        const result: CompoundData[] = [];
        for (let i = 0; i < 3; i++) {
            const name = searchParams.get(`c${i}_name`);
            if (!name) continue;
            let properties: Record<string, DisplayProperty> = {};
            try { properties = JSON.parse(searchParams.get(`c${i}_props`) || "{}"); } catch { /* */ }
            let toxicity = { herg: 0, ames: 0, hepato: 0 };
            try { toxicity = JSON.parse(searchParams.get(`c${i}_tox`) || "{}"); } catch { /* */ }

            result.push({
                name,
                smiles: searchParams.get(`c${i}_smiles`) || "",
                formula: searchParams.get(`c${i}_formula`) || "",
                mw: parseFloat(searchParams.get(`c${i}_mw`) || "0"),
                confidence: parseFloat(searchParams.get(`c${i}_confidence`) || "0"),
                runtime: searchParams.get(`c${i}_runtime`) || "—",
                date: searchParams.get(`c${i}_date`) || "—",
                properties,
                toxicity,
            });
        }
        return result;
    }, [searchParams]);

    // Get all unique property keys across all compounds
    const allPropertyKeys = useMemo(() => {
        const keys = new Set<string>();
        compounds.forEach(c => Object.keys(c.properties).forEach(k => keys.add(k)));
        return Array.from(keys);
    }, [compounds]);

    // Radar data
    const radarData = useMemo(() => {
        const numericKeys = allPropertyKeys.filter(k => k !== "toxicity");
        return numericKeys.map(key => {
            const entry: Record<string, string | number> = { property: LABEL_MAP[key] || key };
            compounds.forEach((c, i) => {
                const p = c.properties[key];
                if (p && typeof p.value === "number") {
                    entry[`compound${i}`] = Math.min(1, Math.abs(p.value) / (RADAR_MAXES[key] || 100));
                } else {
                    entry[`compound${i}`] = 0;
                }
            });
            return entry;
        });
    }, [allPropertyKeys, compounds]);

    // Property winners
    const propertyWinners = useMemo(() => {
        const winners: Record<string, { winnerIdx: number; insight: string }> = {};
        allPropertyKeys.forEach(key => {
            if (key === "toxicity") return;
            const w = getPropertyWinner(key, compounds);
            if (w) winners[key] = w;
        });
        return winners;
    }, [allPropertyKeys, compounds]);

    // Overall scores
    const overallScores = useMemo(() => {
        return compounds.map(c => {
            const entries = Object.values(c.properties);
            const optimal = entries.filter(p => p.status === "optimal").length;
            const mod = entries.filter(p => p.status === "moderate").length;
            return optimal * 3 + mod * 1; // weighted
        });
    }, [compounds]);

    const overallWinnerIdx = overallScores.indexOf(Math.max(...overallScores));

    // Generate natural language insights
    const insights = useMemo(() => {
        const result: string[] = [];

        // Confidence comparison
        const confSorted = compounds.map((c, i) => ({ name: c.name, conf: c.confidence, idx: i }))
            .sort((a, b) => b.conf - a.conf);
        if (confSorted.length >= 2 && confSorted[0].conf !== confSorted[1].conf) {
            result.push(`${confSorted[0].name} has the highest prediction confidence at ${confSorted[0].conf}%`);
        }

        // Property insights
        Object.values(propertyWinners).forEach(w => result.push(w.insight));

        // Toxicity comparison
        const toxScores = compounds.map(c => c.toxicity.herg + c.toxicity.ames + c.toxicity.hepato);
        const safestIdx = toxScores.indexOf(Math.min(...toxScores));
        result.push(`${compounds[safestIdx].name} has the lowest overall toxicity risk (${toxScores[safestIdx]}% combined)`);

        // Overall winner
        result.push(`🏆 Overall recommendation: ${compounds[overallWinnerIdx].name} shows the strongest drug-likeness profile`);

        return result;
    }, [compounds, propertyWinners, overallWinnerIdx]);

    if (compounds.length < 2) {
        return (
            <div className="page-container" style={{ textAlign: "center", paddingTop: 100 }}>
                <Target size={48} style={{ color: "var(--text-muted)", marginBottom: 16, opacity: 0.5 }} />
                <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Select at least 2 compounds to compare</h2>
                <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
                    Go back to your compound library and select molecules for comparison
                </p>
                <Link href="/results" className="btn-primary" onClick={() => haptic("light")}>
                    <ArrowLeft size={14} /> Back to Library
                </Link>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                <Link href="/results" style={{ color: "var(--text-muted)", textDecoration: "none" }}>My Compounds</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Comparison Dashboard</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
                        <BarChart3 size={28} style={{ color: "var(--accent-blue)" }} />
                        Molecule Comparison
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Comparing <strong className="text-gradient">{compounds.length}</strong> compounds side-by-side
                    </p>
                </div>
                <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }}
                    onClick={() => { haptic("light"); router.push("/results"); }}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowLeft size={14} /> Back to Library
                </motion.button>
            </div>

            {/* ─── Compound Cards Row ─── */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${compounds.length}, 1fr)`, gap: 16, marginBottom: 28 }}>
                {compounds.map((c, i) => {
                    const isWinner = i === overallWinnerIdx;
                    return (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                            <GlassCard padding="0" glow={isWinner ? "blue" : undefined} style={{
                                borderColor: COMPOUND_BORDER[i],
                                position: "relative", overflow: "hidden",
                            }}>
                                {isWinner && (
                                    <div style={{
                                        position: "absolute", top: 12, right: 12, zIndex: 10,
                                        padding: "4px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 700,
                                        background: "linear-gradient(135deg, #f59e0b, #f97316)",
                                        color: "#000", display: "flex", alignItems: "center", gap: 4,
                                        boxShadow: "0 2px 10px rgba(245,158,11,0.3)",
                                    }}>
                                        <Crown size={12} /> BEST MATCH
                                    </div>
                                )}

                                {/* 3D Viewer */}
                                <div style={{ height: 160, background: "rgba(0,0,0,0.3)", position: "relative" }}>
                                    <MoleculeViewer3D smiles={c.smiles || undefined} height="160px" spinning={false} compact />
                                    <div style={{
                                        position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 16px",
                                        background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                                        display: "flex", alignItems: "center", gap: 8,
                                    }}>
                                        <div style={{
                                            width: 10, height: 10, borderRadius: "50%",
                                            background: COMPOUND_COLORS[i], boxShadow: `0 0 8px ${COMPOUND_COLORS[i]}`,
                                        }} />
                                        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#fff", letterSpacing: "0.04em" }}>
                                            COMPOUND {String.fromCharCode(65 + i)}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ padding: "16px 20px" }}>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4, color: COMPOUND_COLORS[i] }}>
                                        {c.name}
                                    </h3>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8 }}>{c.formula}</div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.78rem" }}>
                                        <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
                                            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>CONFIDENCE</div>
                                            <div style={{ fontWeight: 700, color: c.confidence >= 90 ? "#22c55e" : "#f59e0b" }}>
                                                {c.confidence}%
                                            </div>
                                        </div>
                                        <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
                                            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>MW</div>
                                            <div style={{ fontWeight: 700 }}>
                                                {c.mw ? `${Math.round(c.mw * 10) / 10}` : "—"}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{
                                        marginTop: 10, padding: "6px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 6,
                                        fontFamily: "monospace", fontSize: "0.7rem", color: "var(--accent-cyan)",
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                        {c.smiles}
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    );
                })}
            </div>

            {/* ─── Overlay Radar Chart ─── */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <GlassCard glow="blue" style={{ marginBottom: 28 }}>
                    <h2 style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <Sparkles size={20} style={{ color: "var(--accent-blue)" }} />
                        Property Profile Overlay
                    </h2>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
                        Normalized drug-likeness radar — larger area indicates stronger overall profile
                    </p>
                    <div style={{ height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                                <PolarGrid stroke="rgba(148,163,184,0.12)" />
                                <PolarAngleAxis
                                    dataKey="property"
                                    tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 600 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: 10, fontSize: "0.78rem",
                                    }}
                                />
                                {compounds.map((c, i) => (
                                    <Radar
                                        key={i}
                                        name={c.name}
                                        dataKey={`compound${i}`}
                                        stroke={COMPOUND_COLORS[i]}
                                        fill={COMPOUND_COLORS[i]}
                                        fillOpacity={0.08 + i * 0.04}
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: COMPOUND_COLORS[i] }}
                                    />
                                ))}
                                <Legend
                                    wrapperStyle={{ fontSize: "0.82rem", paddingTop: 12 }}
                                    iconType="circle"
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </motion.div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, marginBottom: 28 }}>
                {/* ─── Property-by-Property Comparison Table ─── */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <GlassCard>
                        <h2 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                            <Atom size={20} style={{ color: "var(--accent-purple)" }} />
                            Property-by-Property Comparison
                        </h2>
                        <div style={{ overflowX: "auto" }}>
                            <table className="data-table" style={{ width: "100%" }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 160 }}>Property</th>
                                        {compounds.map((c, i) => (
                                            <th key={i} style={{ color: COMPOUND_COLORS[i] }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: "50%",
                                                        background: COMPOUND_COLORS[i],
                                                    }} />
                                                    {c.name}
                                                </div>
                                            </th>
                                        ))}
                                        <th style={{ width: 100 }}>Winner</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allPropertyKeys.filter(k => k !== "toxicity").map((key, rowIdx) => {
                                        const winner = propertyWinners[key];
                                        const Icon = ICON_MAP[key] || Atom;
                                        return (
                                            <motion.tr key={key}
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.5 + rowIdx * 0.06 }}>
                                                <td style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Icon size={14} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
                                                    {LABEL_MAP[key] || key}
                                                </td>
                                                {compounds.map((c, i) => {
                                                    const p = c.properties[key];
                                                    if (!p) return <td key={i} style={{ color: "var(--text-muted)" }}>—</td>;
                                                    const sc = STATUS_COLORS[p.status];
                                                    const isWinner = winner?.winnerIdx === i;
                                                    return (
                                                        <td key={i}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <span style={{
                                                                    fontFamily: "monospace", fontWeight: isWinner ? 700 : 400,
                                                                    color: isWinner ? COMPOUND_COLORS[i] : "var(--text-primary)",
                                                                }}>
                                                                    {p.value}{p.unit ? ` ${p.unit}` : ""}
                                                                </span>
                                                                <span style={{
                                                                    padding: "1px 6px", borderRadius: 6, fontSize: "0.6rem",
                                                                    fontWeight: 600, background: sc.bg, color: sc.text,
                                                                    border: `1px solid ${sc.border}`,
                                                                }}>
                                                                    {p.status[0].toUpperCase()}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td>
                                                    {winner && (
                                                        <span style={{
                                                            padding: "3px 8px", borderRadius: 8, fontSize: "0.68rem",
                                                            fontWeight: 700, background: COMPOUND_BG[winner.winnerIdx],
                                                            color: COMPOUND_COLORS[winner.winnerIdx],
                                                            border: `1px solid ${COMPOUND_BORDER[winner.winnerIdx]}`,
                                                            display: "inline-flex", alignItems: "center", gap: 4,
                                                        }}>
                                                            <Trophy size={10} />
                                                            {String.fromCharCode(65 + winner.winnerIdx)}
                                                        </span>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                    {/* Toxicity Rows */}
                                    {["herg", "ames", "hepato"].map((toxKey, rowIdx) => {
                                        const toxLabel = toxKey === "herg" ? "hERG Inhibition" : toxKey === "ames" ? "Ames Mutagenicity" : "Hepatotoxicity";
                                        const values = compounds.map(c => c.toxicity[toxKey as keyof typeof c.toxicity]);
                                        const bestIdx = values.indexOf(Math.min(...values));
                                        return (
                                            <motion.tr key={toxKey}
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.8 + rowIdx * 0.06 }}>
                                                <td style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Shield size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                                                    {toxLabel}
                                                </td>
                                                {compounds.map((c, i) => {
                                                    const val = c.toxicity[toxKey as keyof typeof c.toxicity];
                                                    const color = val < 30 ? "#22c55e" : val < 60 ? "#f59e0b" : "#ef4444";
                                                    return (
                                                        <td key={i}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                                                    <motion.div
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${val}%` }}
                                                                        transition={{ duration: 0.8 }}
                                                                        style={{ height: "100%", background: color, borderRadius: 3 }}
                                                                    />
                                                                </div>
                                                                <span style={{
                                                                    fontWeight: bestIdx === i ? 700 : 400,
                                                                    color: bestIdx === i ? "#22c55e" : "var(--text-secondary)",
                                                                    fontSize: "0.82rem",
                                                                }}>{val}%</span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td>
                                                    <span style={{
                                                        padding: "3px 8px", borderRadius: 8, fontSize: "0.68rem",
                                                        fontWeight: 700, background: COMPOUND_BG[bestIdx],
                                                        color: COMPOUND_COLORS[bestIdx],
                                                        border: `1px solid ${COMPOUND_BORDER[bestIdx]}`,
                                                        display: "inline-flex", alignItems: "center", gap: 4,
                                                    }}>
                                                        <Trophy size={10} />
                                                        {String.fromCharCode(65 + bestIdx)}
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </GlassCard>
                </motion.div>

                {/* ─── AI Insights Panel ─── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                        <GlassCard glow="purple">
                            <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                <Sparkles size={18} style={{ color: "var(--accent-purple)" }} />
                                AI-Powered Insights
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {insights.map((insight, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.7 + i * 0.1 }}
                                        style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            background: insight.includes("🏆")
                                                ? "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(249,115,22,0.04))"
                                                : "rgba(0,0,0,0.15)",
                                            border: `1px solid ${insight.includes("🏆") ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)"}`,
                                            fontSize: "0.8rem", color: "var(--text-secondary)",
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {insight.includes("🏆") ? (
                                            <span style={{ fontWeight: 700, color: "#f59e0b" }}>{insight}</span>
                                        ) : (
                                            <>
                                                <span style={{ color: "var(--accent-cyan)", marginRight: 6 }}>▸</span>
                                                {insight}
                                            </>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </GlassCard>
                    </motion.div>

                    {/* Score Summary */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                        <GlassCard>
                            <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                <Target size={18} style={{ color: "var(--accent-green)" }} />
                                Drug-Likeness Score
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {compounds.map((c, i) => {
                                    const score = overallScores[i];
                                    const maxScore = allPropertyKeys.length * 3;
                                    const pct = Math.round((score / maxScore) * 100);
                                    const isWinner = i === overallWinnerIdx;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <div style={{
                                                        width: 10, height: 10, borderRadius: "50%",
                                                        background: COMPOUND_COLORS[i],
                                                    }} />
                                                    <span style={{
                                                        fontSize: "0.85rem", fontWeight: isWinner ? 700 : 500,
                                                        color: isWinner ? COMPOUND_COLORS[i] : "var(--text-secondary)",
                                                    }}>
                                                        {c.name}
                                                    </span>
                                                    {isWinner && <Crown size={14} style={{ color: "#f59e0b" }} />}
                                                </div>
                                                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: COMPOUND_COLORS[i] }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                            <div style={{
                                                height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)",
                                                overflow: "hidden",
                                            }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 1, delay: 0.8 + i * 0.15, ease: "easeOut" }}
                                                    style={{
                                                        height: "100%", borderRadius: 5,
                                                        background: `linear-gradient(90deg, ${COMPOUND_COLORS[i]}, ${COMPOUND_COLORS[i]}88)`,
                                                        boxShadow: `0 0 12px ${COMPOUND_COLORS[i]}40`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </GlassCard>
                    </motion.div>

                    {/* Legend */}
                    <GlassCard padding="14px">
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
                            STATUS LEGEND
                        </div>
                        {(["optimal", "moderate", "poor"] as const).map(s => (
                            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: 3,
                                    background: STATUS_COLORS[s].bg, border: `1px solid ${STATUS_COLORS[s].border}`,
                                }} />
                                <span style={{ fontSize: "0.75rem", color: STATUS_COLORS[s].text, fontWeight: 600, textTransform: "capitalize" }}>
                                    {s}
                                </span>
                            </div>
                        ))}
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}

export default function ComparePage() {
    return (
        <Suspense fallback={
            <div className="page-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
                <span style={{ color: "var(--text-secondary)" }}>Loading comparison…</span>
            </div>
        }>
            <CompareContent />
        </Suspense>
    );
}
