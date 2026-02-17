"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    ChevronRight,
    Share2,
    Download,
    Atom,
    RotateCw,
    ArrowLeft,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import MoleculeViewer3D from "@/components/molecule-viewer-3d";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
} from "recharts";

interface SimulationResult {
    id: string;
    status: string;
    config_json: Record<string, unknown>;
    result_json: {
        logp?: number;
        pka?: number;
        solubility?: number;
        tpsa?: number;
        bioavailability?: number;
        toxicity?: {
            herg_inhibition?: number;
            ames_mutagenicity?: number;
            hepatotoxicity?: number;
        };
        confidence?: number;
        [key: string]: unknown;
    } | null;
    compute_cost: number;
    confidence_score: number | null;
    created_at: string;
    molecule: { name: string; smiles: string; formula: string | null; molecular_weight: number | null } | null;
}

function riskLabel(value: number) {
    if (value < 0.3) return { label: "Low", color: "#10b981" };
    if (value < 0.6) return { label: "Moderate", color: "#f97316" };
    return { label: "High", color: "#ef4444" };
}

function assessValue(key: string, value: number) {
    const assessments: Record<string, (v: number) => { label: string; color: string }> = {
        logp: (v) => v >= 1 && v <= 3 ? { label: "Optimal", color: "#10b981" } : v < 1 || v > 5 ? { label: "Poor", color: "#ef4444" } : { label: "Moderate", color: "#f97316" },
        pka: (v) => v >= 2 && v <= 5 ? { label: "Good", color: "#10b981" } : { label: "Moderate", color: "#f97316" },
        solubility: (v) => v > 5 ? { label: "High", color: "#10b981" } : v > 1 ? { label: "Moderate", color: "#f97316" } : { label: "Low", color: "#ef4444" },
        tpsa: (v) => v >= 20 && v <= 120 ? { label: "Good", color: "#10b981" } : { label: "Out of range", color: "#f97316" },
        bioavailability: (v) => v >= 0.7 ? { label: "High", color: "#10b981" } : v >= 0.4 ? { label: "Moderate", color: "#f97316" } : { label: "Low", color: "#ef4444" },
    };
    return (assessments[key] || (() => ({ label: "—", color: "#94a3b8" })))(value);
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user } = useAuth();
    const router = useRouter();
    const supabase = createClient();
    const [sim, setSim] = useState<SimulationResult | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchResult = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from("simulations")
            .select("id, status, config_json, result_json, compute_cost, confidence_score, created_at, molecule:molecules(name, smiles, formula, molecular_weight)")
            .eq("id", id)
            .single();

        if (error || !data) {
            toast("Simulation not found", "error");
            router.push("/dashboard");
            return;
        }
        setSim(data as unknown as SimulationResult);
        setLoading(false);
    }, [id, supabase, router]);

    useEffect(() => {
        if (!user) {
            router.push("/auth/login");
            return;
        }
        fetchResult();
    }, [user, router, fetchResult]);

    if (loading || !sim) {
        return (
            <div className="page-container">
                <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 20 }}>
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>
        );
    }

    const result = sim.result_json || {};
    const confidence = typeof sim.confidence_score === "number" ? sim.confidence_score : 0;

    // Helper: extract numeric value from nested or flat format
    const getVal = (obj: any, ...keys: string[]): number | null => {
        if (obj == null) return null;
        if (typeof obj === "number") return obj;
        for (const k of keys) {
            if (typeof obj[k] === "number") return obj[k];
        }
        return null;
    };

    const logpVal = getVal(result.logp, "value");
    const pkaVal = getVal(result.pka, "acidic", "value");
    const tpsaVal = getVal(result.tpsa, "value");
    const solVal = getVal(result.solubility, "value_mg_ml", "value");
    const bioVal = getVal(result.bioavailability, "score", "value");

    // Build properties table
    const propEntries: { name: string; value: string; badge: string; badgeColor: string }[] = [];
    if (logpVal != null) {
        const a = assessValue("logp", logpVal);
        propEntries.push({ name: "LogP", value: logpVal.toFixed(2), badge: a.label, badgeColor: a.color });
    }
    if (pkaVal != null) {
        const a = assessValue("pka", pkaVal);
        propEntries.push({ name: "pKa (acidic)", value: pkaVal.toFixed(2), badge: a.label, badgeColor: a.color });
    }
    if (tpsaVal != null) {
        const a = assessValue("tpsa", tpsaVal);
        propEntries.push({ name: "TPSA", value: `${tpsaVal.toFixed(1)} Å²`, badge: a.label, badgeColor: a.color });
    }
    if (sim.molecule?.molecular_weight) {
        propEntries.push({ name: "MW", value: sim.molecule.molecular_weight.toFixed(2), badge: sim.molecule.molecular_weight < 500 ? "Optimal" : "High", badgeColor: sim.molecule.molecular_weight < 500 ? "#10b981" : "#f97316" });
    }
    if (solVal != null) {
        const a = assessValue("solubility", solVal);
        propEntries.push({ name: "Solubility", value: `${solVal.toFixed(1)} mg/mL`, badge: a.label, badgeColor: a.color });
    }
    if (bioVal != null) {
        // bioVal may be a fraction (0.74 from score) or percentage (74 from value); normalize
        const pctVal = bioVal <= 1 ? Math.round(bioVal * 100) : Math.round(bioVal);
        const fracVal = bioVal <= 1 ? bioVal : bioVal / 100;
        const a = assessValue("bioavailability", fracVal);
        propEntries.push({ name: "Bioavailability", value: `${pctVal}%`, badge: a.label, badgeColor: a.color });
    }

    // Radar chart data
    const radarData = [
        { property: "Lipophilicity", value: logpVal != null ? Math.min(1, logpVal / 5) : 0 },
        { property: "Polarity", value: tpsaVal != null ? Math.min(1, tpsaVal / 140) : 0 },
        { property: "Solubility", value: solVal != null ? Math.min(1, solVal / 10) : 0 },
        { property: "Bioavail.", value: bioVal != null ? (bioVal <= 1 ? bioVal : bioVal / 100) : 0 },
        { property: "pKa", value: pkaVal != null ? Math.min(1, pkaVal / 14) : 0 },
    ];

    // Toxicity data — edge function returns nested: { herg_inhibition: { probability: 0.2 } }
    const toxicity: any = result.toxicity || {};
    const toxEntries = [
        { name: "hERG Inhibition", probability: getVal(toxicity.herg_inhibition, "probability") ?? 0 },
        { name: "Ames Mutagenicity", probability: getVal(toxicity.ames_mutagenicity, "probability") ?? 0 },
        { name: "Hepatotoxicity", probability: getVal(toxicity.hepatotoxicity, "probability") ?? 0 },
    ].map((t) => ({ ...t, ...riskLabel(t.probability) }));

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                <Link href="/dashboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{sim.molecule?.name || "Results"}</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif" }}>
                            {sim.molecule?.name || "Simulation Results"}
                        </h1>
                        <StatusBadge status={sim.status as "completed" | "running" | "failed"} label={sim.status === "completed" ? "Prediction Complete" : undefined} />
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Confidence: <span className="text-gradient" style={{ fontWeight: 700 }}>{Math.round(confidence * 100)}%</span>
                        {" "}• Cost: {sim.compute_cost} credits
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }} onClick={() => { haptic("light"); toast("Share link copied!", "success"); }}>
                        <Share2 size={14} /> Share
                    </motion.button>
                    <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }} onClick={() => { haptic("light"); toast("Download started", "info"); }}>
                        <Download size={14} /> Export
                    </motion.button>
                </div>
            </div>

            {/* Content */}
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 20 }}>
                {/* Left — Molecule Info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* 3D Molecule Viewer */}
                    <GlassCard glow="blue" padding="0" style={{ overflow: "hidden" }}>
                        <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>3D Structure</div>
                            <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: 6, background: "rgba(59,130,246,0.1)", color: "var(--accent-blue)", fontWeight: 600 }}>Interactive</span>
                        </div>
                        <div style={{ height: 240, padding: "8px 8px 8px" }}>
                            <MoleculeViewer3D smiles={sim.molecule?.smiles || undefined} />
                        </div>
                    </GlassCard>

                    <GlassCard>
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
                            {sim.molecule?.smiles || "—"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {sim.molecule?.formula && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Formula</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{sim.molecule.formula}</span>
                                </div>
                            )}
                            {sim.molecule?.molecular_weight && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>MW</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{sim.molecule.molecular_weight.toFixed(2)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Simulation ID</span>
                                <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{sim.id.slice(0, 8)}</span>
                            </div>
                        </div>
                    </GlassCard>

                    <motion.button
                        className="btn-secondary"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); router.push("/molecules/new"); }}
                        style={{ justifyContent: "center" }}
                    >
                        <RotateCw size={14} /> New Simulation
                    </motion.button>
                </div>

                {/* Center — Properties Table */}
                <GlassCard>
                    <h2 style={{ fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                        <Atom size={18} style={{ color: "var(--accent-blue)" }} />
                        Physicochemical Properties
                    </h2>
                    {propEntries.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Property</th>
                                    <th>Value</th>
                                    <th>Assessment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {propEntries.map((prop, i) => (
                                    <motion.tr
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                    >
                                        <td style={{ fontWeight: 600 }}>{prop.name}</td>
                                        <td style={{ fontFamily: "monospace", color: "var(--accent-cyan)" }}>{prop.value}</td>
                                        <td>
                                            <span
                                                style={{
                                                    padding: "3px 10px",
                                                    borderRadius: 9999,
                                                    fontSize: "0.75rem",
                                                    fontWeight: 600,
                                                    background: `${prop.badgeColor}18`,
                                                    color: prop.badgeColor,
                                                    border: `1px solid ${prop.badgeColor}40`,
                                                }}
                                            >
                                                {prop.badge}
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

                {/* Right — Charts */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard>
                        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 8 }}>Bioavailability Radar</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="rgba(148,163,184,0.1)" />
                                <PolarAngleAxis dataKey="property" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                                <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </GlassCard>

                    <GlassCard>
                        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 16 }}>Toxicity Prediction</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {toxEntries.map((tox, i) => (
                                <div key={i}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{tox.name}</span>
                                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: tox.color }}>{tox.label}</span>
                                    </div>
                                    <div className="progress-bar">
                                        <motion.div
                                            className="progress-bar-fill"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${tox.probability * 100}%` }}
                                            transition={{ delay: 0.3 + i * 0.15, duration: 0.8 }}
                                            style={{ background: tox.color }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                    <Link
                        href="/dashboard"
                        className="btn-secondary"
                        style={{ justifyContent: "center" }}
                        onClick={() => haptic("light")}
                    >
                        <ArrowLeft size={14} /> Back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
