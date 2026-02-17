"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    ChevronRight, Share2, Download, Atom, ArrowLeft,
    Droplets, FlaskConical, Beaker, Activity, TrendingUp,
    Shield, BarChart3, CheckCircle2, AlertTriangle, Clock,
    Zap, Eye,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
} from "recharts";

/* ─── Types ─── */
interface PropertyData {
    value: string | number;
    unit?: string;
    status: "optimal" | "moderate" | "poor";
    description?: string;
}

interface ToxData {
    herg: number;
    ames: number;
    hepato: number;
}

const STATUS_COLORS = {
    optimal: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
    moderate: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
    poor: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

const ICON_MAP: Record<string, React.ElementType> = {
    logP: Droplets,
    pKa: FlaskConical,
    solubility: Beaker,
    tpsa: Activity,
    bioavailability: TrendingUp,
    toxicity: Shield,
};

const LABEL_MAP: Record<string, string> = {
    logP: "LogP",
    pKa: "pKa",
    solubility: "Solubility",
    tpsa: "TPSA",
    bioavailability: "Bioavailability",
    toxicity: "Toxicity Risk",
};

function ToxBar({ label, value }: { label: string; value: number }) {
    const color = value < 30 ? "#22c55e" : value < 60 ? "#f59e0b" : "#ef4444";
    const riskLabel = value < 30 ? "Low" : value < 60 ? "Moderate" : "High";
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color }}>{riskLabel} ({value}%)</span>
            </div>
            <div className="progress-bar">
                <motion.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    style={{ background: color }}
                />
            </div>
        </div>
    );
}

function ViewDetailsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const molId = searchParams.get("molId") || "SIM-0000";
    const molName = searchParams.get("molName") || "Unknown";
    const molSmiles = searchParams.get("molSmiles") || "—";
    const molFormula = searchParams.get("molFormula") || "";
    const molMw = parseFloat(searchParams.get("molMw") || "0");
    const molConfidence = parseFloat(searchParams.get("molConfidence") || "0");
    const molRuntime = searchParams.get("molRuntime") || "—";
    const molDate = searchParams.get("molDate") || "—";
    const molSource = searchParams.get("molSource") || "demo";

    let properties: Record<string, PropertyData> = {};
    try {
        properties = JSON.parse(searchParams.get("molProps") || "{}");
    } catch { /* empty */ }

    let toxicity: ToxData = { herg: 0, ames: 0, hepato: 0 };
    try {
        toxicity = JSON.parse(searchParams.get("molTox") || "{}");
    } catch { /* empty */ }

    const propEntries = Object.entries(properties);

    // Determine overall status
    const optimalCount = propEntries.filter(([, p]) => p.status === "optimal").length;
    const overallStatus = optimalCount >= 5 ? "optimal" : optimalCount >= 3 ? "moderate" : "poor";

    // Radar chart data
    const radarData = propEntries
        .filter(([key]) => key !== "toxicity")
        .map(([key, prop]) => {
            const v = typeof prop.value === "number" ? prop.value : 0;
            const maxValues: Record<string, number> = { logP: 5, pKa: 14, solubility: 50, tpsa: 200, bioavailability: 100 };
            const maxVal = maxValues[key] || 100;
            return {
                property: LABEL_MAP[key] || key,
                value: Math.min(1, Math.abs(v) / maxVal),
            };
        });

    // Build detailed property rows
    const detailRows = propEntries.map(([key, prop]) => {
        const sc = STATUS_COLORS[prop.status];
        return {
            key,
            label: LABEL_MAP[key] || key,
            value: `${prop.value}${prop.unit ? ` ${prop.unit}` : ""}`,
            status: prop.status,
            statusColor: sc,
        };
    });

    // Export URL
    const exportQuery = new URLSearchParams({
        molId, molName, molSmiles, molFormula,
        molMw: String(molMw),
        molConfidence: String(molConfidence),
        molRuntime, molDate, molSource,
        molProps: searchParams.get("molProps") || "{}",
        molTox: searchParams.get("molTox") || "{}",
    }).toString();

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                <Link href="/results" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Results</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{molName}</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif" }}>
                            {molName}
                        </h1>
                        <span style={{
                            padding: "3px 12px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600,
                            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                            color: "#22c55e",
                        }}>
                            <CheckCircle2 size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                            Completed
                        </span>
                        {molSource === "live" && (
                            <span style={{
                                padding: "3px 10px", borderRadius: 20, fontSize: "0.65rem", fontWeight: 700,
                                background: "rgba(6,182,212,0.12)", color: "#06b6d4",
                                border: "1px solid rgba(6,182,212,0.25)",
                                textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>
                                ML Live
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Confidence: <span className="text-gradient" style={{ fontWeight: 700 }}>{molConfidence}%</span>
                        {" "}• Runtime: {molRuntime} • {molDate}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Link
                        href={`/results/export?${exportQuery}`}
                        className="btn-secondary"
                        onClick={() => { haptic("light"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <Share2 size={14} /> Share
                    </Link>
                    <Link
                        href={`/results/export?${exportQuery}`}
                        className="btn-secondary"
                        onClick={() => { haptic("light"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <Download size={14} /> Export
                    </Link>
                </div>
            </div>

            {/* Content */}
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 20 }}>
                {/* Left — Molecule Info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard glow="blue">
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 12 }}>Molecule</div>
                        <div style={{
                            padding: "10px 14px",
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: 8,
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                            color: "var(--accent-cyan)",
                            wordBreak: "break-all",
                            marginBottom: 16,
                        }}>
                            {molSmiles}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {molFormula && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Formula</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{molFormula}</span>
                                </div>
                            )}
                            {molMw > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>MW</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{molMw} g/mol</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Simulation ID</span>
                                <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{molId}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Date</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{molDate}</span>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Overall Status */}
                    <GlassCard padding="16px">
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>
                            OVERALL ASSESSMENT
                        </div>
                        <div style={{
                            padding: "10px 14px", borderRadius: 10,
                            background: STATUS_COLORS[overallStatus].bg,
                            border: `1px solid ${STATUS_COLORS[overallStatus].border}`,
                            display: "flex", alignItems: "center", gap: 10,
                        }}>
                            {overallStatus === "optimal" ? (
                                <CheckCircle2 size={18} style={{ color: STATUS_COLORS[overallStatus].text }} />
                            ) : (
                                <AlertTriangle size={18} style={{ color: STATUS_COLORS[overallStatus].text }} />
                            )}
                            <div>
                                <div style={{ fontSize: "0.9rem", fontWeight: 700, color: STATUS_COLORS[overallStatus].text, textTransform: "capitalize" }}>
                                    {overallStatus} Profile
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    {optimalCount} of {propEntries.length} properties optimal
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    <motion.button
                        className="btn-secondary"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); router.push("/results"); }}
                        style={{ justifyContent: "center" }}
                    >
                        <ArrowLeft size={14} /> Back to Results
                    </motion.button>
                </div>

                {/* Center — Properties Table */}
                <GlassCard>
                    <h2 style={{ fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                        <Atom size={18} style={{ color: "var(--accent-blue)" }} />
                        Physicochemical Properties
                    </h2>
                    {detailRows.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Property</th>
                                    <th>Value</th>
                                    <th>Assessment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailRows.map((prop, i) => (
                                    <motion.tr
                                        key={prop.key}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                    >
                                        <td style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                            {(() => {
                                                const Icon = ICON_MAP[prop.key] || Atom;
                                                return <Icon size={14} style={{ color: prop.statusColor.text, flexShrink: 0 }} />;
                                            })()}
                                            {prop.label}
                                        </td>
                                        <td style={{ fontFamily: "monospace", color: "var(--accent-cyan)" }}>{prop.value}</td>
                                        <td>
                                            <span
                                                style={{
                                                    padding: "3px 10px",
                                                    borderRadius: 9999,
                                                    fontSize: "0.75rem",
                                                    fontWeight: 600,
                                                    background: prop.statusColor.bg,
                                                    color: prop.statusColor.text,
                                                    border: `1px solid ${prop.statusColor.border}`,
                                                }}
                                            >
                                                {prop.status.toUpperCase()}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>No property data available</p>
                    )}
                </GlassCard>

                {/* Right — Charts + Toxicity */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard>
                        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 8 }}>Drug-likeness Radar</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="rgba(148,163,184,0.1)" />
                                <PolarAngleAxis dataKey="property" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                                <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </GlassCard>

                    <GlassCard>
                        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 16 }}>Toxicity Screening</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <ToxBar label="hERG Inhibition" value={toxicity.herg} />
                            <ToxBar label="Ames Mutagenicity" value={toxicity.ames} />
                            <ToxBar label="Hepatotoxicity" value={toxicity.hepato} />
                        </div>

                        {/* Overall toxicity badge */}
                        {properties.toxicity && (
                            <div style={{
                                marginTop: 16, padding: "10px 14px", borderRadius: 10,
                                background: STATUS_COLORS[properties.toxicity.status].bg,
                                border: `1px solid ${STATUS_COLORS[properties.toxicity.status].border}`,
                                display: "flex", alignItems: "center", gap: 8,
                            }}>
                                {properties.toxicity.status === "optimal" ? (
                                    <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                                ) : (
                                    <AlertTriangle size={16} style={{ color: STATUS_COLORS[properties.toxicity.status].text }} />
                                )}
                                <div>
                                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: STATUS_COLORS[properties.toxicity.status].text }}>
                                        {properties.toxicity.value} Risk
                                    </div>
                                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                        Overall toxicity assessment
                                    </div>
                                </div>
                            </div>
                        )}
                    </GlassCard>

                    {/* Run Details */}
                    <GlassCard padding="14px" glow="purple">
                        <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                            <Clock size={13} style={{ color: "var(--accent-purple)" }} /> Run Details
                        </div>
                        {[
                            ["Simulation ID", molId],
                            ["Confidence", `${molConfidence}%`],
                            ["Runtime", molRuntime],
                            ["Date", molDate],
                            ["Source", molSource === "live" ? "ML Live Prediction" : "Demo Data"],
                            ["MW", `${molMw} g/mol`],
                        ].map(([label, val]) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.78rem" }}>
                                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                <span style={{ fontWeight: 600 }}>{val}</span>
                            </div>
                        ))}
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}

export default function ViewDetailsPage() {
    return (
        <Suspense fallback={
            <div className="page-container">
                <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 20 }}>
                    <GlassCard><div style={{ height: 200 }} /></GlassCard>
                    <GlassCard><div style={{ height: 200 }} /></GlassCard>
                    <GlassCard><div style={{ height: 200 }} /></GlassCard>
                </div>
            </div>
        }>
            <ViewDetailsContent />
        </Suspense>
    );
}
