"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    Atom, CheckCircle2, Clock, Cpu, AlertTriangle, TrendingUp,
    Beaker, Shield, Droplets, FlaskConical, Activity,
    ChevronRight, Search, Filter, Download, ArrowUpRight,
    BarChart3, Zap, Eye, Calendar, Sparkles, Share2, FileText
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ─── Demo Results Data ─── */
const DEMO_SIMULATIONS = [
    {
        id: "SIM-4821",
        name: "Aspirin",
        formula: "C₉H₈O₄",
        smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
        mw: 180.16,
        status: "completed" as const,
        confidence: 94.8,
        computeCost: 30,
        runtime: "42s",
        date: "2026-02-17",
        properties: {
            logP: { value: 1.43, status: "optimal" as const },
            pKa: { value: 3.49, status: "moderate" as const },
            solubility: { value: 4.6, unit: "mg/mL", status: "moderate" as const },
            tpsa: { value: 63.6, unit: "Å²", status: "optimal" as const },
            bioavailability: { value: 68, unit: "%", status: "optimal" as const },
            toxicity: { value: "Low", status: "optimal" as const },
        },
        toxicity: { herg: 18, ames: 12, hepato: 25 },
    },
    {
        id: "SIM-4820",
        name: "Ibuprofen",
        formula: "C₁₃H₁₈O₂",
        smiles: "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
        mw: 206.29,
        status: "completed" as const,
        confidence: 91.2,
        computeCost: 30,
        runtime: "38s",
        date: "2026-02-16",
        properties: {
            logP: { value: 3.97, status: "moderate" as const },
            pKa: { value: 4.91, status: "moderate" as const },
            solubility: { value: 0.021, unit: "mg/mL", status: "poor" as const },
            tpsa: { value: 37.3, unit: "Å²", status: "optimal" as const },
            bioavailability: { value: 80, unit: "%", status: "optimal" as const },
            toxicity: { value: "Low", status: "optimal" as const },
        },
        toxicity: { herg: 8, ames: 5, hepato: 15 },
    },
    {
        id: "SIM-4819",
        name: "Caffeine",
        formula: "C₈H₁₀N₄O₂",
        smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
        mw: 194.19,
        status: "completed" as const,
        confidence: 96.1,
        computeCost: 30,
        runtime: "35s",
        date: "2026-02-15",
        properties: {
            logP: { value: -0.07, status: "optimal" as const },
            pKa: { value: 10.4, status: "moderate" as const },
            solubility: { value: 21.6, unit: "mg/mL", status: "optimal" as const },
            tpsa: { value: 58.4, unit: "Å²", status: "optimal" as const },
            bioavailability: { value: 99, unit: "%", status: "optimal" as const },
            toxicity: { value: "Very Low", status: "optimal" as const },
        },
        toxicity: { herg: 5, ames: 3, hepato: 8 },
    },
    {
        id: "SIM-4818",
        name: "Metformin",
        formula: "C₄H₁₁N₅",
        smiles: "CN(C)C(=N)NC(=N)N",
        mw: 129.16,
        status: "completed" as const,
        confidence: 89.5,
        computeCost: 25,
        runtime: "28s",
        date: "2026-02-14",
        properties: {
            logP: { value: -1.43, status: "moderate" as const },
            pKa: { value: 12.4, status: "moderate" as const },
            solubility: { value: 300, unit: "mg/mL", status: "optimal" as const },
            tpsa: { value: 91.5, unit: "Å²", status: "optimal" as const },
            bioavailability: { value: 55, unit: "%", status: "moderate" as const },
            toxicity: { value: "Low", status: "optimal" as const },
        },
        toxicity: { herg: 3, ames: 7, hepato: 12 },
    },
    {
        id: "SIM-4817",
        name: "Paracetamol",
        formula: "C₈H₉NO₂",
        smiles: "CC(=O)NC1=CC=C(O)C=C1",
        mw: 151.16,
        status: "completed" as const,
        confidence: 93.7,
        computeCost: 30,
        runtime: "40s",
        date: "2026-02-13",
        properties: {
            logP: { value: 0.46, status: "optimal" as const },
            pKa: { value: 9.38, status: "moderate" as const },
            solubility: { value: 14.0, unit: "mg/mL", status: "optimal" as const },
            tpsa: { value: 49.3, unit: "Å²", status: "optimal" as const },
            bioavailability: { value: 88, unit: "%", status: "optimal" as const },
            toxicity: { value: "Moderate", status: "moderate" as const },
        },
        toxicity: { herg: 10, ames: 15, hepato: 45 },
    },
    {
        id: "SIM-4816",
        name: "Doxorubicin",
        formula: "C₂₇H₂₉NO₁₁",
        smiles: "COC1=CC=CC2=C1C(=O)C3=C(C2=O)C(CC(C3O)OC4CC(NC4)O)(C(=O)CO)O",
        mw: 543.52,
        status: "completed" as const,
        confidence: 82.3,
        computeCost: 45,
        runtime: "1m 12s",
        date: "2026-02-12",
        properties: {
            logP: { value: 1.27, status: "optimal" as const },
            pKa: { value: 8.22, status: "moderate" as const },
            solubility: { value: 0.5, unit: "mg/mL", status: "poor" as const },
            tpsa: { value: 206.1, unit: "Å²", status: "poor" as const },
            bioavailability: { value: 5, unit: "%", status: "poor" as const },
            toxicity: { value: "High", status: "poor" as const },
        },
        toxicity: { herg: 65, ames: 78, hepato: 72 },
    },
];

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

export default function ResultsIndexPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);

    const filteredSims = DEMO_SIMULATIONS.filter(sim => {
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

    // Summary stats
    const totalSims = DEMO_SIMULATIONS.length;
    const avgConfidence = (DEMO_SIMULATIONS.reduce((s, sim) => s + sim.confidence, 0) / totalSims).toFixed(1);
    const totalCredits = DEMO_SIMULATIONS.reduce((s, sim) => s + sim.computeCost, 0);
    const optimalCount = DEMO_SIMULATIONS.filter(s => Object.values(s.properties).filter(p => p.status === "optimal").length >= 4).length;

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <Link href="/dashboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Results</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6 }}>
                        Simulation Results
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        View and analyze your completed molecular property predictions
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Link
                        href="/results/export"
                        className="btn-primary"
                        onClick={() => haptic("light")}
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", padding: "8px 18px" }}
                    >
                        <FileText size={14} /> Export & Share
                    </Link>
                    <motion.button
                        className="btn-secondary"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); toast("Exporting all results…", "info"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <Download size={14} /> Export All
                    </motion.button>
                </div>
            </div>

            {/* Stats Overview Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                {[
                    { label: "Total Simulations", value: totalSims, icon: Cpu, color: "var(--accent-blue)", gradient: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.08))" },
                    { label: "Avg. Confidence", value: `${avgConfidence}%`, icon: Sparkles, color: "var(--accent-green)", gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.08))" },
                    { label: "Optimal Profiles", value: optimalCount, icon: CheckCircle2, color: "#22c55e", gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(6,182,212,0.08))" },
                    { label: "Credits Used", value: totalCredits, icon: Zap, color: "var(--accent-purple)", gradient: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))" },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                    >
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
                                cursor: "pointer", transition: "all 0.2s",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results Count */}
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                Showing <strong style={{ color: "var(--text-secondary)" }}>{filteredSims.length}</strong> of {totalSims} results
            </div>

            {/* Result Cards Grid */}
            <AnimatePresence mode="popLayout">
                <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 48 }}>
                    {filteredSims.map((sim, idx) => {
                        const isHovered = hoveredCard === sim.id;
                        const propEntries = Object.entries(sim.properties);
                        const optimalProps = propEntries.filter(([, p]) => p.status === "optimal").length;
                        const overallStatus = optimalProps >= 5 ? "optimal" : optimalProps >= 3 ? "moderate" : "poor";
                        const sc = STATUS_COLORS[overallStatus];

                        return (
                            <motion.div
                                key={sim.id}
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
                                        {/* Left — Molecule Info */}
                                        <div style={{
                                            padding: "20px 24px", borderRight: "1px solid var(--glass-border)",
                                            display: "flex", flexDirection: "column", gap: 14,
                                        }}>
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
                                                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sim.id}</span>
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

                                            <div style={{
                                                display: "flex", gap: 12, fontSize: "0.78rem",
                                            }}>
                                                <span style={{
                                                    padding: "4px 10px", borderRadius: 6,
                                                    background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)",
                                                    fontWeight: 500,
                                                }}>
                                                    {sim.formula}
                                                </span>
                                                <span style={{ color: "var(--text-muted)" }}>MW: {sim.mw} g/mol</span>
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
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                                {propEntries.map(([key, prop]) => {
                                                    const psc = STATUS_COLORS[prop.status as keyof typeof STATUS_COLORS];
                                                    const Icon = ICON_MAP[key] || Atom;
                                                    return (
                                                        <div
                                                            key={key}
                                                            style={{
                                                                padding: "10px 12px", borderRadius: 10,
                                                                background: "rgba(0,0,0,0.15)",
                                                                border: `1px solid ${psc.border}`,
                                                                transition: "all 0.2s",
                                                            }}
                                                        >
                                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                                                <Icon size={12} style={{ color: psc.text, flexShrink: 0 }} />
                                                                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                                                                    {key === "logP" ? "LogP" : key === "pKa" ? "pKa" : key === "tpsa" ? "TPSA" : key === "bioavailability" ? "Bioavail." : key}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                                                {prop.value}
                                                                {"unit" in prop && prop.unit && (
                                                                    <span style={{ fontSize: "0.65rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>
                                                                        {(prop as any).unit}
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

                                                {/* Overall Toxicity badge */}
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
                                            </div>

                                            {/* Action Buttons */}
                                            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                                                <Link
                                                    href={`/simulations/demo`}
                                                    className="btn-primary"
                                                    style={{
                                                        flex: 1, justifyContent: "center", padding: "8px 14px",
                                                        fontSize: "0.78rem", borderRadius: 10,
                                                    }}
                                                    onClick={() => haptic("light")}
                                                >
                                                    <Eye size={14} /> View Details
                                                </Link>
                                                <Link
                                                    href="/results/export"
                                                    className="btn-secondary"
                                                    onClick={() => haptic("light")}
                                                    style={{
                                                        padding: "8px 12px", fontSize: "0.78rem", borderRadius: 10,
                                                    }}
                                                >
                                                    <Share2 size={14} />
                                                </Link>
                                                <Link
                                                    href="/results/export"
                                                    className="btn-secondary"
                                                    onClick={() => haptic("light")}
                                                    style={{
                                                        padding: "8px 12px", fontSize: "0.78rem", borderRadius: 10,
                                                    }}
                                                >
                                                    <Download size={14} />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        );
                    })}
                </div>
            </AnimatePresence>

            {/* Empty state */}
            {filteredSims.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                        textAlign: "center", padding: "64px 24px",
                    }}
                >
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
