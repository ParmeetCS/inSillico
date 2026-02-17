"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    FolderOpen, Plus, Pencil, Trash2, ChevronRight, ChevronDown,
    Atom, Cpu, CheckCircle2, Clock, Loader2, Search, X, Library,
    Beaker, Calendar, ArrowRight, RefreshCw, Zap, MoreHorizontal,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ─── Types ─── */
interface Molecule {
    id: string;
    name: string | null;
    smiles: string | null;
    formula: string | null;
    molecular_weight: number | null;
    created_at: string;
}

interface Simulation {
    id: string;
    status: string;
    created_at: string;
    molecule: { name: string; smiles: string } | null;
}

interface Project {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    molecules: Molecule[];
    simulations: Simulation[];
}

/* ═══════════════════════════════════════════════════════
   Projects Page — Full CRUD with compound management
   ═══════════════════════════════════════════════════════ */
export default function ProjectsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedProject, setExpandedProject] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Create/Edit modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [formName, setFormName] = useState("");
    const [formDesc, setFormDesc] = useState("");
    const [saving, setSaving] = useState(false);

    // Delete confirmation
    const [deletingId, setDeletingId] = useState<string | null>(null);

    /* ── Fetch projects with nested data ── */
    const fetchProjects = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const { data: projectsData, error: projErr } = await supabase
            .from("projects")
            .select("id, name, description, created_at, updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false });

        if (projErr) {
            toast("Failed to load projects: " + projErr.message, "error");
            setLoading(false);
            return;
        }

        // Fetch molecules and simulations for each project
        const projIds = (projectsData || []).map(p => p.id);

        const [{ data: molecules }, { data: simulations }] = await Promise.all([
            supabase
                .from("molecules")
                .select("id, name, smiles, formula, molecular_weight, created_at, project_id")
                .in("project_id", projIds.length > 0 ? projIds : ["__none__"])
                .order("created_at", { ascending: false }),
            supabase
                .from("simulations")
                .select("id, status, created_at, project_id, molecule:molecules(name, smiles)")
                .in("project_id", projIds.length > 0 ? projIds : ["__none__"])
                .order("created_at", { ascending: false }),
        ]);

        const enriched: Project[] = (projectsData || []).map(p => ({
            ...p,
            molecules: (molecules || []).filter((m: Record<string, unknown>) => m.project_id === p.id) as unknown as Molecule[],
            simulations: (simulations || []).filter((s: Record<string, unknown>) => s.project_id === p.id) as unknown as Simulation[],
        }));

        setProjects(enriched);
        setLoading(false);
    }, [user, supabase]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
            return;
        }
        if (user) fetchProjects();
    }, [user, authLoading, router, fetchProjects]);

    /* ── Create / Update project ── */
    const handleSave = async () => {
        if (!formName.trim()) {
            toast("Project name is required", "warning");
            return;
        }
        if (!user) return;
        setSaving(true);

        try {
            if (editingProject) {
                // Update
                const { error } = await supabase
                    .from("projects")
                    .update({ name: formName.trim(), description: formDesc.trim() || null })
                    .eq("id", editingProject.id);

                if (error) throw error;
                haptic("success");
                toast("Project updated", "success");
            } else {
                // Create
                const { error } = await supabase
                    .from("projects")
                    .insert({ user_id: user.id, name: formName.trim(), description: formDesc.trim() || null });

                if (error) throw error;
                haptic("success");
                toast("Project created!", "success");
            }

            setShowModal(false);
            setEditingProject(null);
            setFormName("");
            setFormDesc("");
            fetchProjects();
        } catch (err) {
            toast((err as Error).message || "Failed to save project", "error");
        } finally {
            setSaving(false);
        }
    };

    /* ── Delete project ── */
    const handleDelete = async (projectId: string) => {
        try {
            const { error } = await supabase.from("projects").delete().eq("id", projectId);
            if (error) throw error;
            haptic("success");
            toast("Project deleted", "success");
            setDeletingId(null);
            fetchProjects();
        } catch (err) {
            toast((err as Error).message || "Failed to delete project", "error");
        }
    };

    const openCreate = () => {
        setEditingProject(null);
        setFormName("");
        setFormDesc("");
        setShowModal(true);
        haptic("light");
    };

    const openEdit = (project: Project) => {
        setEditingProject(project);
        setFormName(project.name);
        setFormDesc(project.description || "");
        setShowModal(true);
        haptic("light");
    };

    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Stats
    const totalMolecules = projects.reduce((s, p) => s + p.molecules.length, 0);
    const totalSimulations = projects.reduce((s, p) => s + p.simulations.length, 0);
    const completedSims = projects.reduce((s, p) => s + p.simulations.filter(sim => sim.status === "completed").length, 0);

    if (authLoading || loading) {
        return (
            <div className="page-container">
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh", gap: 12 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Loader2 size={24} style={{ color: "var(--accent-blue)" }} />
                    </motion.div>
                    <span style={{ color: "var(--text-secondary)" }}>Loading projects…</span>
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
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Projects</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6 }}>
                        Research Projects
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Organize your molecules and simulations into projects
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <motion.button
                        className="btn-secondary"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { haptic("light"); fetchProjects(); toast("Projects refreshed", "info"); }}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <RefreshCw size={14} /> Refresh
                    </motion.button>
                    <motion.button
                        className="btn-primary"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={openCreate}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <Plus size={16} /> New Project
                    </motion.button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                {[
                    { label: "Total Projects", value: projects.length, icon: FolderOpen, color: "var(--accent-blue)", gradient: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.08))" },
                    { label: "Molecules", value: totalMolecules, icon: Atom, color: "var(--accent-cyan)", gradient: "linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.08))" },
                    { label: "Simulations", value: totalSimulations, icon: Cpu, color: "var(--accent-purple)", gradient: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))" },
                    { label: "Completed", value: completedSims, icon: CheckCircle2, color: "var(--accent-green)", gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(6,182,212,0.08))" },
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

            {/* Search */}
            {projects.length > 0 && (
                <div style={{ position: "relative", marginBottom: 24 }}>
                    <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        className="input"
                        placeholder="Search projects by name or description…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: 40 }}
                    />
                </div>
            )}

            {/* Empty State */}
            {projects.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", padding: "80px 24px" }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
                        background: "rgba(59,130,246,0.08)", border: "2px solid rgba(59,130,246,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <FolderOpen size={36} style={{ color: "var(--accent-blue)", opacity: 0.7 }} />
                    </div>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit)" }}>
                        No Projects Yet
                    </h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: 400, margin: "0 auto 28px" }}>
                        Create your first project to organize your molecules and simulations
                    </p>
                    <motion.button className="btn-primary" whileTap={{ scale: 0.97 }} onClick={openCreate}>
                        <Plus size={16} /> Create First Project
                    </motion.button>
                </motion.div>
            )}

            {/* Project Cards */}
            <AnimatePresence mode="popLayout">
                <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 48 }}>
                    {filteredProjects.map((project, idx) => {
                        const isExpanded = expandedProject === project.id;
                        const molCount = project.molecules.length;
                        const simCount = project.simulations.length;
                        const completedCount = project.simulations.filter(s => s.status === "completed").length;
                        const isDeleting = deletingId === project.id;

                        return (
                            <motion.div
                                key={project.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.05, duration: 0.3 }}
                            >
                                <GlassCard padding="0" hover={false}>
                                    {/* Project Header */}
                                    <div
                                        style={{
                                            padding: "20px 24px",
                                            cursor: "pointer",
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            borderBottom: isExpanded ? "1px solid var(--glass-border)" : "none",
                                            transition: "all 0.2s",
                                        }}
                                        onClick={() => {
                                            haptic("selection");
                                            setExpandedProject(isExpanded ? null : project.id);
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                            <div style={{
                                                width: 48, height: 48, borderRadius: 12,
                                                background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                border: "1px solid rgba(59,130,246,0.2)",
                                            }}>
                                                <FolderOpen size={22} style={{ color: "var(--accent-blue)" }} />
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 2 }}>{project.name}</h3>
                                                {project.description && (
                                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                                                        {project.description}
                                                    </p>
                                                )}
                                                <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Atom size={12} style={{ color: "var(--accent-cyan)" }} />
                                                        {molCount} molecule{molCount !== 1 ? "s" : ""}
                                                    </span>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Cpu size={12} style={{ color: "var(--accent-purple)" }} />
                                                        {simCount} simulation{simCount !== 1 ? "s" : ""}
                                                    </span>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <CheckCircle2 size={12} style={{ color: "var(--accent-green)" }} />
                                                        {completedCount} completed
                                                    </span>
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Calendar size={12} />
                                                        {new Date(project.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {/* Actions */}
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={(e) => { e.stopPropagation(); openEdit(project); }}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    cursor: "pointer", color: "var(--text-muted)",
                                                }}
                                                title="Edit project"
                                            >
                                                <Pencil size={14} />
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    haptic("warning");
                                                    setDeletingId(project.id);
                                                }}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    background: isDeleting ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)",
                                                    border: `1px solid ${isDeleting ? "rgba(239,68,68,0.3)" : "var(--glass-border)"}`,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    cursor: "pointer", color: isDeleting ? "#ef4444" : "var(--text-muted)",
                                                }}
                                                title="Delete project"
                                            >
                                                <Trash2 size={14} />
                                            </motion.button>
                                            <motion.div
                                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                                transition={{ duration: 0.2 }}
                                                style={{ color: "var(--text-muted)" }}
                                            >
                                                <ChevronDown size={18} />
                                            </motion.div>
                                        </div>
                                    </div>

                                    {/* Delete Confirmation */}
                                    <AnimatePresence>
                                        {isDeleting && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                style={{ overflow: "hidden" }}
                                            >
                                                <div style={{
                                                    padding: "14px 24px",
                                                    background: "rgba(239,68,68,0.04)",
                                                    borderTop: "1px solid rgba(239,68,68,0.15)",
                                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                                }}>
                                                    <span style={{ fontSize: "0.85rem", color: "#ef4444" }}>
                                                        Delete &ldquo;{project.name}&rdquo;? This will also remove {molCount} molecule{molCount !== 1 ? "s" : ""} and {simCount} simulation{simCount !== 1 ? "s" : ""}.
                                                    </span>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                                                            style={{
                                                                padding: "6px 14px", borderRadius: 8, fontSize: "0.8rem",
                                                                background: "rgba(255,255,255,0.06)", border: "1px solid var(--glass-border)",
                                                                color: "var(--text-secondary)", cursor: "pointer",
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                                                            style={{
                                                                padding: "6px 14px", borderRadius: 8, fontSize: "0.8rem",
                                                                background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                                                                color: "#ef4444", cursor: "pointer", fontWeight: 600,
                                                            }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Expanded: Molecules & Simulations */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3 }}
                                                style={{ overflow: "hidden" }}
                                            >
                                                <div style={{ padding: "20px 24px" }}>
                                                    {/* Molecules Section */}
                                                    <div style={{ marginBottom: 24 }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <Atom size={15} style={{ color: "var(--accent-cyan)" }} />
                                                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Molecules ({molCount})</span>
                                                            </div>
                                                            <Link
                                                                href="/molecules/new"
                                                                className="btn-secondary"
                                                                onClick={() => haptic("light")}
                                                                style={{ padding: "4px 12px", fontSize: "0.75rem", borderRadius: 8 }}
                                                            >
                                                                <Plus size={12} /> Add
                                                            </Link>
                                                        </div>

                                                        {molCount === 0 ? (
                                                            <div style={{
                                                                padding: "24px 16px", textAlign: "center",
                                                                background: "rgba(0,0,0,0.1)", borderRadius: 10,
                                                                border: "1px dashed var(--glass-border)",
                                                            }}>
                                                                <Beaker size={24} style={{ color: "var(--text-muted)", marginBottom: 8, opacity: 0.5 }} />
                                                                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
                                                                    No molecules yet — <Link href="/molecules/new" style={{ color: "var(--accent-blue)", textDecoration: "none" }}>add one</Link>
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                                                                {project.molecules.map(mol => (
                                                                    <div
                                                                        key={mol.id}
                                                                        style={{
                                                                            padding: "12px 16px", borderRadius: 10,
                                                                            background: "rgba(0,0,0,0.12)", border: "1px solid var(--glass-border)",
                                                                            display: "flex", flexDirection: "column", gap: 6,
                                                                        }}
                                                                    >
                                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                            <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{mol.name || "Unnamed"}</span>
                                                                            {mol.formula && (
                                                                                <span style={{
                                                                                    padding: "2px 8px", borderRadius: 6, fontSize: "0.68rem",
                                                                                    background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)",
                                                                                }}>
                                                                                    {mol.formula}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{
                                                                            fontFamily: "monospace", fontSize: "0.72rem", color: "var(--accent-cyan)",
                                                                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                                        }}>
                                                                            {mol.smiles || "—"}
                                                                        </div>
                                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                                                                {mol.molecular_weight ? `MW: ${mol.molecular_weight} g/mol` : ""}
                                                                            </span>
                                                                            <Link
                                                                                href={`/simulations/new?molecule=${mol.id}&project=${project.id}`}
                                                                                style={{ fontSize: "0.72rem", color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                                                                                onClick={() => haptic("light")}
                                                                            >
                                                                                Run Simulation <ArrowRight size={11} />
                                                                            </Link>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Simulations Section */}
                                                    <div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                                            <Cpu size={15} style={{ color: "var(--accent-purple)" }} />
                                                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Simulations ({simCount})</span>
                                                        </div>

                                                        {simCount === 0 ? (
                                                            <div style={{
                                                                padding: "24px 16px", textAlign: "center",
                                                                background: "rgba(0,0,0,0.1)", borderRadius: 10,
                                                                border: "1px dashed var(--glass-border)",
                                                            }}>
                                                                <Cpu size={24} style={{ color: "var(--text-muted)", marginBottom: 8, opacity: 0.5 }} />
                                                                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
                                                                    No simulations run yet
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <table className="data-table" style={{ fontSize: "0.82rem" }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th>Compound</th>
                                                                        <th>SMILES</th>
                                                                        <th>Status</th>
                                                                        <th>Date</th>
                                                                        <th></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {project.simulations.map(sim => (
                                                                        <tr key={sim.id}>
                                                                            <td style={{ fontWeight: 600 }}>{sim.molecule?.name || "Unknown"}</td>
                                                                            <td style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--accent-cyan)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                                {sim.molecule?.smiles || "—"}
                                                                            </td>
                                                                            <td>
                                                                                <StatusBadge status={sim.status as "running" | "completed" | "failed" | "queued"} />
                                                                            </td>
                                                                            <td style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                                                                                {new Date(sim.created_at).toLocaleDateString()}
                                                                            </td>
                                                                            <td>
                                                                                {sim.status === "completed" && (
                                                                                    <Link
                                                                                        href={`/results/${sim.id}`}
                                                                                        style={{ color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontSize: "0.78rem" }}
                                                                                    >
                                                                                        View <ArrowRight size={11} />
                                                                                    </Link>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </GlassCard>
                            </motion.div>
                        );
                    })}
                </div>
            </AnimatePresence>

            {/* No search results */}
            {projects.length > 0 && filteredProjects.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "64px 24px" }}>
                    <Search size={48} style={{ color: "var(--text-muted)", marginBottom: 16, opacity: 0.5 }} />
                    <h3 style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: 8 }}>No projects match</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Try adjusting your search query
                    </p>
                </motion.div>
            )}

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: "fixed", inset: 0, zIndex: 1000,
                            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: 24,
                        }}
                        onClick={() => { setShowModal(false); setEditingProject(null); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: "100%", maxWidth: 480,
                                background: "var(--navy-800, #1e293b)",
                                border: "1px solid var(--glass-border)",
                                borderRadius: 16, padding: 28,
                                boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--font-outfit)" }}>
                                    {editingProject ? "Edit Project" : "New Project"}
                                </h2>
                                <button
                                    onClick={() => { setShowModal(false); setEditingProject(null); }}
                                    style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: "rgba(255,255,255,0.06)", border: "1px solid var(--glass-border)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        cursor: "pointer", color: "var(--text-muted)",
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                        Project Name *
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="e.g. Drug Discovery Q1"
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                        Description (optional)
                                    </label>
                                    <textarea
                                        className="input"
                                        placeholder="Brief description of the project goals…"
                                        value={formDesc}
                                        onChange={e => setFormDesc(e.target.value)}
                                        rows={3}
                                        style={{ resize: "vertical", minHeight: 80 }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                                <button
                                    onClick={() => { setShowModal(false); setEditingProject(null); }}
                                    className="btn-secondary"
                                    style={{ padding: "10px 20px" }}
                                >
                                    Cancel
                                </button>
                                <motion.button
                                    className="btn-primary"
                                    disabled={saving || !formName.trim()}
                                    whileTap={{ scale: saving ? 1 : 0.97 }}
                                    onClick={handleSave}
                                    style={{
                                        padding: "10px 24px",
                                        opacity: saving || !formName.trim() ? 0.6 : 1,
                                    }}
                                >
                                    {saving ? (
                                        <>
                                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                                <Loader2 size={14} />
                                            </motion.div>
                                            Saving…
                                        </>
                                    ) : editingProject ? (
                                        "Save Changes"
                                    ) : (
                                        <>
                                            <Plus size={14} /> Create Project
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
