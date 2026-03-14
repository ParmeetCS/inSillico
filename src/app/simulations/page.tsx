"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Atom, Play, Beaker, FlaskConical, Search, Clock, Cpu,
    ChevronRight, Plus, Loader2, Zap, CheckCircle2,
    AlertTriangle, Activity, TrendingUp, Eye, Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ─── Types ─── */
interface MoleculeRow {
    id: string;
    name: string;
    smiles: string;
    formula: string | null;
    molecular_weight: number | null;
    created_at: string;
}

interface SimulationRow {
    id: string;
    status: string;
    compute_cost: number;
    confidence_score: number | null;
    created_at: string;
    completed_at: string | null;
    molecule: {
        id: string;
        name: string;
        smiles: string;
        formula: string | null;
    } | null;
}

/* ═══════════════════════════════════════════════════════
   Simulations Hub — Pick a molecule, see recent runs
   ═══════════════════════════════════════════════════════ */
export default function SimulationsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [molecules, setMolecules] = useState<MoleculeRow[]>([]);
    const [simulations, setSimulations] = useState<SimulationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<"molecules" | "recent">("molecules");

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const [molRes, simRes] = await Promise.all([
            supabase
                .from("molecules")
                .select("id, name, smiles, formula, molecular_weight, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(50),
            supabase
                .from("simulations")
                .select("id, status, compute_cost, confidence_score, created_at, completed_at, molecule:molecules(id, name, smiles, formula)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(30),
        ]);

        if (molRes.error) toast("Failed to load molecules: " + molRes.error.message, "error");
        if (simRes.error) toast("Failed to load simulations: " + simRes.error.message, "error");

        setMolecules((molRes.data || []) as MoleculeRow[]);
        setSimulations((simRes.data || []) as unknown as SimulationRow[]);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (!authLoading && !user) { router.push("/auth/login"); return; }
        if (user) fetchData();
    }, [user, authLoading, router, fetchData]);

    /* ─── Stats ─── */
    const totalMolecules = molecules.length;
    const totalSims = simulations.length;
    const completedSims = simulations.filter(s => s.status === "completed").length;
    const runningSims = simulations.filter(s => s.status === "running").length;
    const totalCredits = simulations.reduce((s, sim) => s + (sim.compute_cost || 0), 0);

    /* ─── Filter ─── */
    const filteredMolecules = molecules.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.smiles.toLowerCase().includes(search.toLowerCase()) ||
        (m.formula || "").toLowerCase().includes(search.toLowerCase())
    );

    const filteredSims = simulations.filter(s => {
        const name = s.molecule?.name || "";
        const smiles = s.molecule?.smiles || "";
        return name.toLowerCase().includes(search.toLowerCase()) ||
            smiles.toLowerCase().includes(search.toLowerCase());
    });

    /* ─── Loading ─── */
    if (authLoading || loading) {
        return (
            <div className="page-container">
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh", gap: 12 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Loader2 size={24} style={{ color: "var(--accent-blue)" }} />
                    </motion.div>
                    <span style={{ color: "var(--text-secondary)" }}>Loading simulations…</span>
                </div>
            </div>
        );
    }

    const STATUS_ICON: Record<string, { icon: React.ElementType; color: string }> = {
        completed: { icon: CheckCircle2, color: "#22c55e" },
        running: { icon: Activity, color: "#3b82f6" },
        failed: { icon: AlertTriangle, color: "#ef4444" },
        pending: { icon: Clock, color: "#f59e0b" },
    };

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <Link href="/dashboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)" }}>Simulations</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit)", marginBottom: 6 }}>
                        <Cpu size={24} style={{ display: "inline", marginRight: 10, color: "var(--accent-blue)", verticalAlign: "middle" }} />
                        Simulations
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                        Select a molecule to run a new simulation, or review recent runs
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <Link href="/simulations/demo"
                        style={{
                            padding: "10px 18px", borderRadius: 10,
                            background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                            color: "#a78bfa", fontSize: "0.85rem", fontWeight: 600,
                            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
                            transition: "all 0.2s",
                        }}
                        onClick={() => haptic("light")}
                    >
                        <Sparkles size={16} /> Try Demo
                    </Link>
                    <Link href="/molecules/new"
                        style={{
                            padding: "10px 18px", borderRadius: 10,
                            background: "var(--accent-blue)", color: "#fff",
                            fontSize: "0.85rem", fontWeight: 600,
                            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
                            transition: "all 0.2s",
                        }}
                        onClick={() => haptic("light")}
                    >
                        <Plus size={16} /> New Molecule
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "Molecules", value: totalMolecules, icon: Atom, color: "#3b82f6" },
                    { label: "Simulations", value: totalSims, icon: Cpu, color: "#8b5cf6" },
                    { label: "Completed", value: completedSims, icon: CheckCircle2, color: "#22c55e" },
                    { label: "Running", value: runningSims, icon: Activity, color: "#f59e0b" },
                    { label: "Credits Used", value: totalCredits, icon: Zap, color: "#06b6d4" },
                ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <GlassCard padding="14px 16px">
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: `${stat.color}15`, border: `1px solid ${stat.color}30`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <stat.icon size={18} style={{ color: stat.color }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{stat.value}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{stat.label}</div>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Search + Tabs */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{
                    flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                }}>
                    <Search size={16} style={{ color: "var(--text-muted)" }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search molecules or simulations…"
                        style={{
                            flex: 1, background: "none", border: "none", outline: "none",
                            color: "var(--text-primary)", fontSize: "0.85rem",
                        }}
                    />
                </div>
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4 }}>
                    {(["molecules", "recent"] as const).map(t => (
                        <button key={t}
                            onClick={() => { setTab(t); haptic("light"); }}
                            style={{
                                padding: "8px 16px", borderRadius: 8, border: "none",
                                background: tab === t ? "rgba(59,130,246,0.15)" : "transparent",
                                color: tab === t ? "#60a5fa" : "var(--text-muted)",
                                fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                                transition: "all 0.2s",
                            }}
                        >
                            {t === "molecules" ? "My Molecules" : "Recent Runs"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Molecule Grid */}
            <AnimatePresence mode="wait">
                {tab === "molecules" && (
                    <motion.div key="molecules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {filteredMolecules.length === 0 ? (
                            <GlassCard padding="48px">
                                <div style={{ textAlign: "center" }}>
                                    <Atom size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px", opacity: 0.4 }} />
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>No molecules yet</h3>
                                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 20 }}>
                                        Define a molecule first, then come back to run simulations
                                    </p>
                                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                                        <Link href="/molecules/new" style={{
                                            padding: "10px 22px", borderRadius: 10,
                                            background: "var(--accent-blue)", color: "#fff",
                                            fontSize: "0.85rem", fontWeight: 600,
                                            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
                                        }}>
                                            <Plus size={16} /> Define Molecule
                                        </Link>
                                        <Link href="/simulations/demo" style={{
                                            padding: "10px 22px", borderRadius: 10,
                                            background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                                            color: "#a78bfa", fontSize: "0.85rem", fontWeight: 600,
                                            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
                                        }}>
                                            <FlaskConical size={16} /> Try Demo (Aspirin)
                                        </Link>
                                    </div>
                                </div>
                            </GlassCard>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                                {filteredMolecules.map((mol, i) => {
                                    const simCount = simulations.filter(s =>
                                        s.molecule?.id === mol.id
                                    ).length;
                                    const lastSim = simulations.find(s => s.molecule?.id === mol.id);

                                    return (
                                        <motion.div key={mol.id}
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                        >
                                            <GlassCard padding="0" style={{ overflow: "hidden", cursor: "pointer", transition: "all 0.2s" }}>
                                                <div
                                                    onClick={() => {
                                                        haptic("light");
                                                        router.push(`/simulations/new?molecule=${mol.id}`);
                                                    }}
                                                    style={{ padding: "16px 18px" }}
                                                >
                                                    {/* Molecule header */}
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                {mol.name}
                                                            </div>
                                                            {mol.formula && (
                                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{mol.formula}</div>
                                                            )}
                                                        </div>
                                                        <div style={{
                                                            padding: "4px 10px", borderRadius: 8,
                                                            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)",
                                                            color: "#60a5fa", fontSize: "0.7rem", fontWeight: 600,
                                                            display: "flex", alignItems: "center", gap: 4,
                                                        }}>
                                                            <Play size={10} /> Run
                                                        </div>
                                                    </div>

                                                    {/* SMILES */}
                                                    <div style={{
                                                        padding: "6px 10px", borderRadius: 6,
                                                        background: "rgba(0,0,0,0.2)",
                                                        fontFamily: "monospace", fontSize: "0.72rem",
                                                        color: "var(--accent-cyan)",
                                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                        marginBottom: 10,
                                                    }}>
                                                        {mol.smiles}
                                                    </div>

                                                    {/* Meta row */}
                                                    <div style={{ display: "flex", gap: 12, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                        {mol.molecular_weight && (
                                                            <span>MW: {mol.molecular_weight.toFixed(1)}</span>
                                                        )}
                                                        <span>{simCount} simulation{simCount !== 1 ? "s" : ""}</span>
                                                        {lastSim && (
                                                            <span style={{
                                                                color: lastSim.status === "completed" ? "#22c55e" : lastSim.status === "running" ? "#3b82f6" : "#f59e0b",
                                                            }}>
                                                                Last: {lastSim.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Bottom accent */}
                                                <div style={{
                                                    height: 3,
                                                    background: simCount > 0
                                                        ? "linear-gradient(90deg, #3b82f6, #8b5cf6)"
                                                        : "rgba(255,255,255,0.04)",
                                                }} />
                                            </GlassCard>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

                {tab === "recent" && (
                    <motion.div key="recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {filteredSims.length === 0 ? (
                            <GlassCard padding="48px">
                                <div style={{ textAlign: "center" }}>
                                    <Cpu size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px", opacity: 0.4 }} />
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>No simulations yet</h3>
                                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 20 }}>
                                        Run your first simulation to see results here
                                    </p>
                                    <Link href="/simulations/demo" style={{
                                        padding: "10px 22px", borderRadius: 10,
                                        background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                                        color: "#a78bfa", fontSize: "0.85rem", fontWeight: 600,
                                        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
                                    }}>
                                        <FlaskConical size={16} /> Try Demo (Aspirin)
                                    </Link>
                                </div>
                            </GlassCard>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {filteredSims.map((sim, i) => {
                                    const statusInfo = STATUS_ICON[sim.status] || STATUS_ICON.pending;
                                    const StatusIcon = statusInfo.icon;
                                    const date = new Date(sim.created_at).toLocaleDateString("en-US", {
                                        month: "short", day: "numeric", year: "numeric",
                                    });

                                    return (
                                        <motion.div key={sim.id}
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                        >
                                            <GlassCard padding="14px 18px" style={{ cursor: "pointer", transition: "all 0.2s" }}>
                                                <div
                                                    onClick={() => {
                                                        haptic("light");
                                                        if (sim.status === "completed") {
                                                            router.push(`/results/${sim.id}`);
                                                        }
                                                    }}
                                                    style={{ display: "flex", alignItems: "center", gap: 14 }}
                                                >
                                                    {/* Status icon */}
                                                    <div style={{
                                                        width: 38, height: 38, borderRadius: 10,
                                                        background: `${statusInfo.color}15`,
                                                        border: `1px solid ${statusInfo.color}30`,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        flexShrink: 0,
                                                    }}>
                                                        <StatusIcon size={18} style={{ color: statusInfo.color }} />
                                                    </div>

                                                    {/* Info */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)",
                                                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                        }}>
                                                            {sim.molecule?.name || "Unknown Compound"}
                                                        </div>
                                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", gap: 12, marginTop: 2 }}>
                                                            <span>{date}</span>
                                                            {sim.molecule?.formula && <span>{sim.molecule.formula}</span>}
                                                            <span>{sim.compute_cost} credits</span>
                                                        </div>
                                                    </div>

                                                    {/* Status badge */}
                                                    <div style={{
                                                        padding: "4px 10px", borderRadius: 8,
                                                        background: `${statusInfo.color}15`,
                                                        border: `1px solid ${statusInfo.color}30`,
                                                        color: statusInfo.color,
                                                        fontSize: "0.72rem", fontWeight: 600,
                                                        textTransform: "capitalize",
                                                    }}>
                                                        {sim.status}
                                                    </div>

                                                    {/* Confidence */}
                                                    {sim.confidence_score != null && (
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right", minWidth: 50 }}>
                                                            <div style={{ fontWeight: 700, color: sim.confidence_score > 0.8 ? "#22c55e" : "#f59e0b" }}>
                                                                {(sim.confidence_score * 100).toFixed(0)}%
                                                            </div>
                                                            <div style={{ fontSize: "0.65rem" }}>confidence</div>
                                                        </div>
                                                    )}

                                                    {sim.status === "completed" && (
                                                        <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                                    )}
                                                </div>
                                            </GlassCard>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
