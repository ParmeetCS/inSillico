"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Cpu,
    Activity,
    CheckCircle2,
    Library,
    Plus,
    ArrowRight,
    RefreshCw,
    Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import { staggerItem } from "@/lib/haptics";

interface Simulation {
    id: string;
    status: string;
    config_json: Record<string, unknown>;
    result_json: Record<string, unknown> | null;
    compute_cost: number;
    created_at: string;
    molecule: { name: string; smiles: string } | null;
}

export default function DashboardPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const supabase = createClient();
    const [simulations, setSimulations] = useState<Simulation[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, completed: 0, running: 0, molecules: 0 });

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        // Fetch simulations with molecule data
        const { data: sims } = await supabase
            .from("simulations")
            .select("id, status, config_json, result_json, compute_cost, created_at, molecule:molecules(name, smiles)")
            .order("created_at", { ascending: false })
            .limit(20);

        if (sims) {
            setSimulations(sims as unknown as Simulation[]);
            setStats({
                total: sims.length,
                completed: sims.filter((s) => s.status === "completed").length,
                running: sims.filter((s) => s.status === "running").length,
                molecules: new Set(sims.map((s) => (s as unknown as Simulation).molecule?.smiles).filter(Boolean)).size,
            });
        }

        setLoading(false);
    }, [user, supabase]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
            return;
        }
        if (user) fetchData();
    }, [user, authLoading, router, fetchData]);

    if (authLoading) {
        return (
            <div className="page-container">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                    {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
                </div>
            </div>
        );
    }

    const metricCards = [
        { label: "Credits Remaining", value: profile?.credits ?? 0, icon: Cpu, color: "var(--accent-blue)", change: `${profile?.role || "researcher"} plan` },
        { label: "Active Simulations", value: stats.running, icon: Activity, color: "var(--accent-purple)", change: stats.running > 0 ? "processing" : "none running" },
        { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "var(--accent-green)", change: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% success rate` },
        { label: "Molecule Library", value: stats.molecules, icon: Library, color: "var(--accent-cyan)", change: "unique compounds" },
    ];

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 4 }}>
                        Welcome back, {profile?.full_name?.split(" ")[0] || "Researcher"} 👋
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        {simulations.length > 0
                            ? `You have ${stats.running} simulation${stats.running !== 1 ? "s" : ""} running and ${stats.completed} completed`
                            : "Start your first simulation to see results here"
                        }
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <motion.button
                        className="btn-secondary"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); fetchData(); toast("Dashboard refreshed", "info"); }}
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </motion.button>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Link href="/molecules/new" className="btn-primary" onClick={() => haptic("medium")}>
                            <Plus size={16} />
                            New Simulation
                        </Link>
                    </motion.div>
                </div>
            </div>

            {/* Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
                {metricCards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <motion.div key={i} variants={staggerItem} initial="initial" animate="animate" custom={i}>
                            <GlassCard>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                                        {card.label}
                                    </span>
                                    <div
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            background: `${card.color}15`,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <Icon size={16} style={{ color: card.color }} />
                                    </div>
                                </div>
                                <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif" }}>
                                    {card.value}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                    {card.change}
                                </div>
                            </GlassCard>
                        </motion.div>
                    );
                })}
            </div>

            {/* Simulations Table */}
            <GlassCard>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontWeight: 600 }}>Recent Simulations</h2>
                </div>

                {loading ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Compound</th>
                                <th>SMILES</th>
                                <th>Status</th>
                                <th>Cost</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map((i) => <TableRowSkeleton key={i} />)}
                        </tbody>
                    </table>
                ) : simulations.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                        <Activity size={40} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
                        <h3 style={{ fontWeight: 600, marginBottom: 6 }}>No simulations yet</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 20 }}>
                            Run your first simulation to see results here
                        </p>
                        <Link href="/molecules/new" className="btn-primary">
                            <Plus size={16} />
                            Start First Simulation
                        </Link>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Compound</th>
                                <th>SMILES</th>
                                <th>Status</th>
                                <th>Cost</th>
                                <th>Date</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {simulations.map((sim, i) => (
                                    <motion.tr
                                        key={sim.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <td style={{ fontWeight: 600 }}>
                                            {sim.molecule?.name || "Unnamed"}
                                        </td>
                                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--accent-cyan)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {sim.molecule?.smiles || "—"}
                                        </td>
                                        <td>
                                            <StatusBadge status={sim.status as "running" | "completed" | "failed" | "queued"} />
                                        </td>
                                        <td>{sim.compute_cost} cr</td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                                            {new Date(sim.created_at).toLocaleDateString()}
                                        </td>
                                        <td>
                                            {sim.status === "completed" && (
                                                <Link
                                                    href={`/results/${sim.id}`}
                                                    style={{ color: "var(--accent-blue)", fontSize: "0.8rem", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
                                                >
                                                    View <ArrowRight size={12} />
                                                </Link>
                                            )}
                                            {sim.status === "running" && (
                                                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", color: "var(--accent-purple)" }}>
                                                    <Loader2 size={12} className="spin" /> Running
                                                </span>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                )}
            </GlassCard>
        </div>
    );
}
