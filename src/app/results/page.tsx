"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Atom, CheckCircle2, Cpu, AlertTriangle, TrendingUp,
    Beaker, Shield, Droplets, FlaskConical, Activity,
    ChevronRight, Search, Download,
    BarChart3, Zap, Eye, Calendar, Sparkles, Share2, FileText,
    Loader2, RefreshCw,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import MoleculeViewer3D from "@/components/molecule-viewer-3d";

/* ─── Types ─── */
interface SimulationFromDB {
    id: string;
    status: string;
    config_json: Record<string, unknown>;
    result_json: Record<string, unknown> | null;
    compute_cost: number;
    confidence_score: number | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    molecule: {
        name: string;
        smiles: string;
        formula: string | null;
        molecular_weight: number | null;
    } | null;
}

type PropertyStatus = "optimal" | "moderate" | "poor";

interface DisplayProperty {
    value: string | number;
    unit?: string;
    status: PropertyStatus;
}

interface DisplaySimulation {
    id: string;
    dbId: string;
    name: string;
    formula: string;
    smiles: string;
    mw: number;
    status: string;
    confidence: number;
    computeCost: number;
    runtime: string;
    date: string;
    properties: Record<string, DisplayProperty>;
    toxicity: { herg: number; ames: number; hepato: number };
}

/* ─── Classification helpers ─── */
function classifyValue(key: string, value: number | string): PropertyStatus {
    if (typeof value === "string") {
        const v = value.toLowerCase();
        if (v === "low" || v === "very low" || v === "negative") return "optimal";
        if (v === "moderate") return "moderate";
        return "poor";
    }
    switch (key) {
        case "logp": return value >= 0 && value <= 5 ? "optimal" : value >= -1 && value <= 6 ? "moderate" : "poor";
        case "pka": return value >= 2 && value <= 12 ? "moderate" : "optimal";
        case "solubility": return value > 10 ? "optimal" : value > 1 ? "moderate" : "poor";
        case "tpsa": return value >= 20 && value <= 120 ? "optimal" : value >= 10 && value <= 140 ? "moderate" : "poor";
        case "bioavailability": return value >= 70 ? "optimal" : value >= 40 ? "moderate" : "poor";
        default: return "moderate";
    }
}

function formatRuntime(startedAt: string | null, completedAt: string | null): string {
    if (!startedAt || !completedAt) return "—";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
}

/* ─── Transform DB simulation to display format ─── */
function transformSimulation(sim: SimulationFromDB): DisplaySimulation | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = sim.result_json as any;
    if (!r) return null;

    const properties: Record<string, DisplayProperty> = {};

    if (r.logp) {
        const val = r.logp.value ?? r.logp;
        if (typeof val === "number") {
            properties.logP = { value: Math.round(val * 100) / 100, status: classifyValue("logp", val) };
        }
    }
    if (r.pka) {
        const val = r.pka.acidic ?? r.pka.value ?? r.pka;
        if (typeof val === "number") {
            properties.pKa = { value: Math.round(val * 100) / 100, status: classifyValue("pka", val) };
        }
    }
    if (r.solubility) {
        const val = r.solubility.value_mg_ml ?? r.solubility.value ?? r.solubility;
        if (typeof val === "number") {
            properties.solubility = { value: Math.round(val * 1000) / 1000, unit: "mg/mL", status: classifyValue("solubility", val) };
        }
    }
    if (r.tpsa) {
        const val = r.tpsa.value ?? r.tpsa;
        if (typeof val === "number") {
            properties.tpsa = { value: Math.round(val * 10) / 10, unit: "Å²", status: classifyValue("tpsa", val) };
        }
    }
    if (r.bioavailability) {
        const val = r.bioavailability.score != null
            ? Math.round(r.bioavailability.score * 100)
            : (r.bioavailability.value ?? r.bioavailability);
        if (typeof val === "number") {
            properties.bioavailability = { value: val, unit: "%", status: classifyValue("bioavailability", val) };
        }
    }
    if (r.toxicity) {
        const risk = r.toxicity.herg_inhibition?.risk ?? r.toxicity.value ?? "Low";
        properties.toxicity = { value: risk, status: classifyValue("toxicity", risk) };
    }

    const toxicity = {
        herg: Math.round((r.toxicity?.herg_inhibition?.probability || 0) * 100),
        ames: Math.round((r.toxicity?.ames_mutagenicity?.probability || 0) * 100),
        hepato: Math.round((r.toxicity?.hepatotoxicity?.probability || 0) * 100),
    };

    const avgConf = [
        r.logp?.confidence, r.solubility?.confidence, r.bioavailability?.confidence,
        r.tpsa?.confidence, r.pka?.confidence, r.toxicity?.confidence,
    ].filter((c): c is number => c != null);

    const confidence = sim.confidence_score
        ? Math.round(sim.confidence_score * 10) / 10
        : avgConf.length > 0
            ? Math.round((avgConf.reduce((a, b) => a + b, 0) / avgConf.length) * 1000) / 10
            : 0;

    return {
        id: sim.id.slice(0, 8).toUpperCase(),
        dbId: sim.id,
        name: sim.molecule?.name || "Unknown Compound",
        formula: sim.molecule?.formula || r.formula || "—",
        smiles: sim.molecule?.smiles || "",
        mw: sim.molecule?.molecular_weight || r.molecular_weight || 0,
        status: sim.status,
        confidence,
        computeCost: sim.compute_cost,
        runtime: formatRuntime(sim.started_at, sim.completed_at),
        date: new Date(sim.created_at).toISOString().split("T")[0],
        properties,
        toxicity,
    };
}

/* ─── Sub-components ─── */
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

type FilterType = "all" | "optimal" | "moderate" | "flagged";

function ToxBar({ label, value }: { label: string; value: number }) {
    const color = value < 30 ? "#22c55e" : value < 60 ? "#f59e0b" : "#ef4444";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem" }}>
            <span style={{ color: "var(--text-muted)", width: 56, flexShrink: 0, whiteSpace: "nowrap" }}>{label}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    style={{ height: "100%", borderRadius: 2, background: color }}
                />
            </div>
            <span style={{ color, fontWeight: 600, width: 28, textAlign: "right" }}>{value}%</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Results Index — User's Compound Library (real data)
   ═══════════════════════════════════════════════════════ */
export default function ResultsIndexPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [simulations, setSimulations] = useState<DisplaySimulation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);

    const fetchResults = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from("simulations")
            .select("id, status, config_json, result_json, compute_cost, confidence_score, created_at, started_at, completed_at, molecule:molecules(name, smiles, formula, molecular_weight)")
            .eq("user_id", user.id)
            .eq("status", "completed")
            .order("created_at", { ascending: false });

        if (error) {
            toast("Failed to load results: " + error.message, "error");
            setLoading(false);
            return;
        }

        const transformed = (data || [])
            .map((sim) => transformSimulation(sim as unknown as SimulationFromDB))
            .filter((s): s is DisplaySimulation => s !== null);

        setSimulations(transformed);
        setLoading(false);
    }, [user, supabase]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
            return;
        }
        if (user) fetchResults();
    }, [user, authLoading, router, fetchResults]);

    const filteredSims = simulations.filter(sim => {
        const matchesSearch = sim.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sim.formula.includes(searchQuery) ||
            sim.smiles.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sim.id.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        if (activeFilter === "optimal") {
            return sim.confidence >= 90 && Object.values(sim.properties).every(p => p.status === "optimal");
        }
        if (activeFilter === "moderate") {
            return Object.values(sim.properties).some(p => p.status === "moderate");
        }
        if (activeFilter === "flagged") {
            return Object.values(sim.properties).some(p => p.status === "poor") || sim.toxicity.hepato > 40;
        }
        return true;
    });

    const totalSims = simulations.length;
    const avgConfidence = totalSims > 0
        ? (simulations.reduce((s, sim) => s + sim.confidence, 0) / totalSims).toFixed(1)
        : "0";
    const totalCredits = simulations.reduce((s, sim) => s + sim.computeCost, 0);
    const optimalCount = simulations.filter(s =>
        Object.values(s.properties).filter(p => p.status === "optimal").length >= 4
    ).length;

    if (authLoading || loading) {
        return (
            <div className="page-container">
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh", gap: 12 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Loader2 size={24} style={{ color: "var(--accent-blue)" }} />
                    </motion.div>
                    <span style={{ color: "var(--text-secondary)" }}>Loading your compound library…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <Link href="/dashboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>My Compound Library</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6 }}>
                        My Compound Library
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Your tested compounds and their molecular property predictions
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <motion.button
                        className="btn-secondary"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); fetchResults(); toast("Results refreshed", "info"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <RefreshCw size={14} /> Refresh
                    </motion.button>
                    <Link
                        href="/results/export"
                        className="btn-primary"
                        onClick={() => haptic("light")}
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", padding: "8px 18px" }}
                    >
                        <FileText size={14} /> Export & Share
                    </Link>
                </div>
            </div>

            {/* Stats Overview */}
            {totalSims > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                    {[
                        { label: "Total Compounds Tested", value: totalSims, icon: Cpu, color: "var(--accent-blue)", gradient: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.08))" },
                        { label: "Avg. Confidence", value: `${avgConfidence}%`, icon: Sparkles, color: "var(--accent-green)", gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.08))" },
                        { label: "Optimal Profiles", value: optimalCount, icon: CheckCircle2, color: "#22c55e", gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(6,182,212,0.08))" },
                        { label: "Credits Used", value: totalCredits, icon: Zap, color: "var(--accent-purple)", gradient: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))" },
                    ].map((stat, i) => (
                        <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                            <GlassCard padding="18px" hover={false}>
                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12, background: stat.gradient,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        border: `1px solid ${stat.color}25`,
                                    }}>
                                        <stat.icon size={20} style={{ color: stat.color }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-outfit)" }}>{stat.value}</div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500 }}>{stat.label}</div>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Search & Filter Bar */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                    <Search size={16} style={{
                        position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                    }} />
                    <input
                        className="input"
                        placeholder="Search by molecule name, formula, SMILES, or ID…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: 40 }}
                    />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                    {([
                        { key: "all", label: "All" },
                        { key: "optimal", label: "Optimal" },
                        { key: "moderate", label: "Moderate" },
                        { key: "flagged", label: "Flagged" },
                    ] as { key: FilterType; label: string }[]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => { haptic("selection"); setActiveFilter(f.key); }}
                            style={{
                                padding: "8px 16px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 600,
                                border: "1px solid",
                                borderColor: activeFilter === f.key ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)",
                                background: activeFilter === f.key ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                                color: activeFilter === f.key ? "#60a5fa" : "#94a3b8",
                                cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {totalSims > 0 && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                    Showing <strong style={{ color: "var(--text-secondary)" }}>{filteredSims.length}</strong> of {totalSims} results
                </div>
            )}

            {/* Empty State */}
            {totalSims === 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", padding: "80px 24px" }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
                        background: "rgba(59,130,246,0.08)", border: "2px solid rgba(59,130,246,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Atom size={36} style={{ color: "var(--accent-blue)", opacity: 0.7 }} />
                    </div>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit)" }}>
                        Your Compound Library is Empty
                    </h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 28, maxWidth: 400, margin: "0 auto 28px" }}>
                        Run your first simulation to start building your personal library of tested compounds
                    </p>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                        <Link href="/molecules/new" className="btn-primary" onClick={() => haptic("medium")}>
                            <Atom size={16} /> Define a Molecule
                        </Link>
                        <Link href="/simulations/demo" className="btn-secondary" onClick={() => haptic("light")}>
                            🧪 Try Demo
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Result Cards */}
            <AnimatePresence mode="popLayout">
                <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 48 }}>
                    {filteredSims.map((sim, idx) => {
                        const isHovered = hoveredCard === sim.id;
                        const propEntries = Object.entries(sim.properties);
                        const optimalProps = propEntries.filter(([, p]) => p.status === "optimal").length;
                        const overallStatus: PropertyStatus = optimalProps >= 5 ? "optimal" : optimalProps >= 3 ? "moderate" : "poor";
                        const sc = STATUS_COLORS[overallStatus];

                        return (
                            <motion.div
                                key={sim.dbId}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.05, duration: 0.3 }}
                                onMouseEnter={() => setHoveredCard(sim.id)}
                                onMouseLeave={() => setHoveredCard(null)}
                            >
                                <GlassCard
                                    padding="0"
                                    hover={false}
                                    style={{
                                        borderColor: isHovered ? "rgba(59,130,246,0.3)" : "var(--glass-border)",
                                        transition: "all 0.3s ease",
                                        boxShadow: isHovered ? "0 0 30px rgba(59,130,246,0.1)" : "none",
                                    }}
                                >
                                    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 280px", minHeight: 0 }}>
                                        {/* Left — Molecule Info + 3D */}
                                        <div style={{
                                            padding: "20px 24px", borderRight: "1px solid var(--glass-border)",
                                            display: "flex", flexDirection: "column", gap: 14,
                                        }}>
                                            {/* 3D Viewer */}
                                            <div style={{ height: 180, borderRadius: 10, overflow: "hidden", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", position: "relative" }}>
                                                <MoleculeViewer3D smiles={sim.smiles || undefined} height="180px" spinning={false} compact />
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                        <div style={{
                                                            width: 32, height: 32, borderRadius: 8,
                                                            background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))",
                                                            display: "flex", alignItems: "center", justifyContent: "center",
                                                        }}>
                                                            <Atom size={16} style={{ color: "var(--accent-blue)" }} />
                                                        </div>
                                                        <div>
                                                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{sim.name}</h3>
                                                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>SIM-{sim.id}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    padding: "3px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 600,
                                                    background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text,
                                                }}>
                                                    {overallStatus.toUpperCase()}
                                                </span>
                                            </div>

                                            <div style={{ display: "flex", gap: 12, fontSize: "0.78rem" }}>
                                                <span style={{
                                                    padding: "4px 10px", borderRadius: 6,
                                                    background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", fontWeight: 500,
                                                }}>
                                                    {sim.formula}
                                                </span>
                                                <span style={{ color: "var(--text-muted)" }}>MW: {sim.mw ? `${Math.round(sim.mw * 100) / 100} g/mol` : "—"}</span>
                                            </div>

                                            <div style={{
                                                padding: "8px 12px", background: "rgba(0,0,0,0.25)", borderRadius: 8,
                                                fontFamily: "monospace", fontSize: "0.75rem", color: "var(--accent-cyan)",
                                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                            }}>
                                                {sim.smiles}
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
                                                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 2 }}>CONFIDENCE</div>
                                                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: sim.confidence >= 90 ? "#22c55e" : "#f59e0b" }}>
                                                        {sim.confidence}%
                                                    </div>
                                                </div>
                                                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
                                                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 2 }}>RUNTIME</div>
                                                    <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{sim.runtime}</div>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                <Calendar size={12} />
                                                {sim.date}
                                                <span style={{ margin: "0 4px" }}>·</span>
                                                <Zap size={12} style={{ color: "var(--accent-purple)" }} />
                                                {sim.computeCost} credits
                                            </div>
                                        </div>

                                        {/* Center — Properties Grid */}
                                        <div style={{
                                            padding: "20px 24px", borderRight: "1px solid var(--glass-border)",
                                            display: "flex", flexDirection: "column", gap: 10,
                                        }}>
                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                <BarChart3 size={13} style={{ color: "var(--accent-purple)" }} />
                                                PREDICTED PROPERTIES
                                            </div>
                                            {propEntries.length > 0 ? (
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                                    {propEntries.map(([key, prop]) => {
                                                        const psc = STATUS_COLORS[prop.status];
                                                        const Icon = ICON_MAP[key] || Atom;
                                                        return (
                                                            <div key={key} style={{
                                                                padding: "10px 12px", borderRadius: 10,
                                                                background: "rgba(0,0,0,0.15)",
                                                                border: `1px solid ${psc.border}`, transition: "all 0.2s",
                                                            }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                                                    <Icon size={12} style={{ color: psc.text, flexShrink: 0 }} />
                                                                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                                                                        {key === "logP" ? "LogP" : key === "pKa" ? "pKa" : key === "tpsa" ? "TPSA" : key === "bioavailability" ? "Bioavail." : key}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                                                    {prop.value}
                                                                    {prop.unit && (
                                                                        <span style={{ fontSize: "0.65rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>
                                                                            {prop.unit}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{
                                                                    width: "fit-content", marginTop: 4,
                                                                    padding: "1px 6px", borderRadius: 8, fontSize: "0.58rem", fontWeight: 600,
                                                                    background: psc.bg, color: psc.text,
                                                                }}>
                                                                    {prop.status.toUpperCase()}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                                    No property data available
                                                </div>
                                            )}
                                        </div>

                                        {/* Right — Toxicity + Actions */}
                                        <div style={{
                                            padding: "20px 24px",
                                            display: "flex", flexDirection: "column", justifyContent: "space-between",
                                        }}>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                                                    <Shield size={13} style={{ color: "var(--accent-orange)" }} />
                                                    TOXICITY SCREENING
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    <ToxBar label="hERG" value={sim.toxicity.herg} />
                                                    <ToxBar label="Ames" value={sim.toxicity.ames} />
                                                    <ToxBar label="Hepato." value={sim.toxicity.hepato} />
                                                </div>

                                                {sim.properties.toxicity && (
                                                    <div style={{
                                                        marginTop: 14, padding: "8px 12px", borderRadius: 8,
                                                        background: sim.properties.toxicity.status === "optimal"
                                                            ? "rgba(34,197,94,0.06)" : sim.properties.toxicity.status === "moderate"
                                                                ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)",
                                                        border: `1px solid ${STATUS_COLORS[sim.properties.toxicity.status].border}`,
                                                        display: "flex", alignItems: "center", gap: 8,
                                                    }}>
                                                        {sim.properties.toxicity.status === "optimal" ? (
                                                            <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                                                        ) : sim.properties.toxicity.status === "moderate" ? (
                                                            <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
                                                        ) : (
                                                            <AlertTriangle size={14} style={{ color: "#ef4444" }} />
                                                        )}
                                                        <div>
                                                            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: STATUS_COLORS[sim.properties.toxicity.status].text }}>
                                                                {sim.properties.toxicity.value} Risk
                                                            </div>
                                                            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                                                                Overall toxicity assessment
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                                                <Link
                                                    href={`/results/${sim.dbId}`}
                                                    className="btn-primary"
                                                    style={{ flex: 1, justifyContent: "center", padding: "8px 14px", fontSize: "0.78rem", borderRadius: 10 }}
                                                    onClick={() => haptic("light")}
                                                >
                                                    <Eye size={14} /> View Details
                                                </Link>
                                                <Link
                                                    href="/results/export"
                                                    className="btn-secondary"
                                                    onClick={() => haptic("light")}
                                                    style={{ padding: "8px 12px", fontSize: "0.78rem", borderRadius: 10 }}
                                                >
                                                    <Share2 size={14} />
                                                </Link>
                                                <button
                                                    className="btn-secondary"
                                                    onClick={() => { haptic("light"); toast("Exporting result…", "info"); }}
                                                    style={{ padding: "8px 12px", fontSize: "0.78rem", borderRadius: 10 }}
                                                >
                                                    <Download size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        );
                    })}
                </div>
            </AnimatePresence>

            {/* No results for current filter */}
            {totalSims > 0 && filteredSims.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "64px 24px" }}>
                    <Search size={48} style={{ color: "var(--text-muted)", marginBottom: 16, opacity: 0.5 }} />
                    <h3 style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: 8 }}>No results found</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Try adjusting your search query or filters
                    </p>
                </motion.div>
            )}
        </div>
    );
}
