"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Upload,
    Pencil,
    ArrowRight,
    Atom,
    FileText,
    Loader2,
    Hexagon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import MoleculeDrawer from "@/components/molecule-drawer";

export default function MoleculeInputPage() {
    const { user } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [activeTab, setActiveTab] = useState<"smiles" | "sketch" | "upload">("smiles");

    const handleDrawerSmiles = useCallback((s: string) => { if (s) setSmiles(s); }, []);
    const handleDrawerFormula = useCallback((f: string) => { if (f) setFormula(f); }, []);
    const handleDrawerMW = useCallback((mw: number) => { if (mw) setMolecularWeight(String(mw)); }, []);
    const [smiles, setSmiles] = useState("");
    const [name, setName] = useState("");
    const [formula, setFormula] = useState("");
    const [molecularWeight, setMolecularWeight] = useState("");
    const [loading, setLoading] = useState(false);

    const handleProceed = async () => {
        if (!smiles.trim()) {
            haptic("warning");
            toast("Please enter a SMILES string", "warning");
            return;
        }
        if (!user) {
            router.push("/auth/login");
            return;
        }

        haptic("medium");
        setLoading(true);

        try {
            // Refresh session first to ensure valid token
            console.log("[save] refreshing session...");
            const { data: { session }, error: sessErr } = await supabase.auth.getSession();
            if (sessErr || !session) {
                throw new Error("Session expired — please log in again.");
            }
            console.log("[save] session OK, uid:", session.user.id);

            // 1. Ensure we have a project
            let projectId: string;
            console.log("[save] fetching projects...");
            const { data: projects, error: projFetchErr } = await supabase
                .from("projects").select("id").eq("user_id", session.user.id).limit(1);

            if (projFetchErr) throw new Error("Failed to fetch projects: " + projFetchErr.message);
            console.log("[save] projects found:", projects?.length);

            if (projects && projects.length > 0) {
                projectId = projects[0].id;
            } else {
                console.log("[save] creating default project...");
                const { data: newProject, error: projCreateErr } = await supabase
                    .from("projects")
                    .insert({ user_id: session.user.id, name: "My First Project", description: "Default project" })
                    .select("id")
                    .single();
                if (projCreateErr || !newProject) throw new Error("Failed to create project: " + (projCreateErr?.message ?? "Unknown error"));
                projectId = newProject.id;
            }
            console.log("[save] projectId:", projectId);

            // 2. Check for existing molecule with same SMILES (prevent duplicates)
            console.log("[save] checking for duplicate SMILES...");
            const { data: existingMols } = await supabase
                .from("molecules")
                .select("id")
                .eq("user_id", session.user.id)
                .eq("smiles", smiles.trim())
                .limit(1);

            let moleculeId: string;

            if (existingMols && existingMols.length > 0) {
                // Reuse existing molecule instead of creating a duplicate
                moleculeId = existingMols[0].id;
                console.log("[save] reusing existing molecule:", moleculeId);
                haptic("success");
                toast("Molecule already in your library — proceeding to simulation.", "info");
            } else {
                // 3. Create the molecule
                console.log("[save] inserting molecule...");
                const { data: molecule, error: molErr } = await supabase
                    .from("molecules")
                    .insert({
                        project_id: projectId,
                        user_id: session.user.id,
                        name: name.trim() || `Compound-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                        smiles: smiles.trim(),
                        formula: formula.trim() || null,
                        molecular_weight: molecularWeight ? parseFloat(molecularWeight) : null,
                    })
                    .select("id")
                    .single();

                if (molErr || !molecule) {
                    throw new Error(`Molecule save failed: ${molErr?.message ?? "Unknown error"}`);
                }
                moleculeId = molecule.id;
                console.log("[save] molecule created:", moleculeId);
            }

            haptic("success");
            toast("Molecule saved! Configure your simulation.", "success");
            router.push(`/simulations/new?molecule=${moleculeId}&project=${projectId}`);
        } catch (err) {
            const msg = (err as Error).message || "Unknown error";
            console.error("Molecule save error:", msg, err);
            haptic("error");
            toast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            {/* Step Indicator */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
                {[
                    { num: 1, label: "Input Molecule", active: true },
                    { num: 2, label: "Configure", active: false },
                    { num: 3, label: "Results", active: false },
                ].map((step, i) => (
                    <div key={step.num} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.1, type: "spring", stiffness: 300 }}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: step.active ? "var(--gradient-accent)" : "var(--navy-700)",
                                border: step.active ? "none" : "1px solid var(--glass-border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                color: step.active ? "white" : "var(--text-muted)",
                            }}
                        >
                            {step.num}
                        </motion.div>
                        <span style={{ fontSize: "0.8rem", fontWeight: step.active ? 600 : 400, color: step.active ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {step.label}
                        </span>
                        {i < 2 && (
                            <div style={{ width: 40, height: 1, background: "var(--glass-border)", margin: "0 4px" }} />
                        )}
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
                {/* Main Input */}
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit), sans-serif" }}>
                        Define Your Molecule
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 24 }}>
                        Enter a SMILES string, draw a structure, or upload a file
                    </p>

                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
                        {[
                            { key: "smiles" as const, label: "SMILES Input", icon: Pencil },
                            { key: "sketch" as const, label: "Draw Structure", icon: Hexagon },
                            { key: "upload" as const, label: "Upload File", icon: Upload },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <motion.button
                                    key={tab.key}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => { setActiveTab(tab.key); haptic("selection"); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "10px 20px",
                                        borderRadius: 10,
                                        border: "1px solid",
                                        borderColor: activeTab === tab.key ? "var(--accent-blue)" : "var(--glass-border)",
                                        background: activeTab === tab.key ? "rgba(59,130,246,0.1)" : "transparent",
                                        color: activeTab === tab.key ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                        fontSize: "0.85rem",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </motion.button>
                            );
                        })}
                    </div>

                    {activeTab === "smiles" ? (
                        <GlassCard>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                    SMILES String
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="CC(=O)Oc1ccccc1C(=O)O"
                                    value={smiles}
                                    onChange={(e) => setSmiles(e.target.value)}
                                    style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
                                />
                                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                                    Simplified Molecular Input Line Entry System notation
                                </p>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                        Compound Name
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="e.g. Aspirin Analog"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                        Formula (optional)
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="e.g. C9H8O4"
                                        value={formula}
                                        onChange={(e) => setFormula(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                    Molecular Weight (optional)
                                </label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="e.g. 180.16"
                                    value={molecularWeight}
                                    onChange={(e) => setMolecularWeight(e.target.value)}
                                    step={0.01}
                                />
                            </div>
                        </GlassCard>
                    ) : activeTab === "sketch" ? (
                        <div>
                            <MoleculeDrawer
                                onSmilesChange={handleDrawerSmiles}
                                onFormulaChange={handleDrawerFormula}
                                onMWChange={handleDrawerMW}
                            />
                            {smiles && (
                                <GlassCard className="" glow="blue" padding="16px" style={{ marginTop: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <Atom size={14} style={{ color: "var(--accent-blue)" }} />
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Generated SMILES</span>
                                    </div>
                                    <code style={{
                                        display: "block", padding: "8px 12px", borderRadius: 8,
                                        background: "rgba(59,130,246,0.08)", fontSize: "0.85rem",
                                        fontFamily: "monospace", color: "var(--accent-blue-light)",
                                        wordBreak: "break-all",
                                    }}>{smiles}</code>
                                    <div style={{ marginTop: 12 }}>
                                        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                                            Compound Name
                                        </label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="e.g. Aspirin Analog"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />
                                    </div>
                                </GlassCard>
                            )}
                        </div>
                    ) : (
                        <GlassCard>
                            <div
                                style={{
                                    border: "2px dashed var(--glass-border)",
                                    borderRadius: 12,
                                    padding: 40,
                                    textAlign: "center",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                }}
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
                                onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--glass-border)"; }}
                            >
                                <Upload size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
                                <p style={{ fontWeight: 600, marginBottom: 4 }}>Drop structure file here</p>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    Supports .mol, .sdf, .pdb, .mol2, .xyz
                                </p>
                            </div>
                        </GlassCard>
                    )}
                </div>

                {/* Sidebar */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard glow="blue">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <Atom size={18} style={{ color: "var(--accent-blue)" }} />
                            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Molecule Summary</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>SMILES</div>
                                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", color: smiles ? "var(--accent-cyan)" : "var(--text-muted)", marginTop: 4 }}>
                                    {smiles || "Not entered yet"}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</div>
                                <div style={{ fontSize: "0.85rem", marginTop: 4, color: name ? "var(--text-primary)" : "var(--text-muted)" }}>
                                    {name || "—"}
                                </div>
                            </div>
                            {formula && (
                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Formula</div>
                                    <div style={{ fontSize: "0.85rem", marginTop: 4 }}>{formula}</div>
                                </div>
                            )}
                        </div>
                    </GlassCard>

                    <GlassCard padding="12px 16px">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileText size={14} style={{ color: "var(--text-muted)" }} />
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                Tip: Use canonical SMILES for best accuracy
                            </span>
                        </div>
                    </GlassCard>

                    <motion.button
                        className="btn-primary"
                        disabled={loading || !smiles.trim()}
                        whileHover={{ scale: loading ? 1 : 1.02 }}
                        whileTap={{ scale: loading ? 1 : 0.97 }}
                        onClick={handleProceed}
                        style={{
                            width: "100%",
                            justifyContent: "center",
                            padding: "14px 24px",
                            opacity: loading || !smiles.trim() ? 0.6 : 1,
                        }}
                    >
                        {loading ? (
                            <>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                    <Loader2 size={16} />
                                </motion.div>
                                Saving...
                            </>
                        ) : (
                            <>
                                Proceed to Configuration
                                <ArrowRight size={16} />
                            </>
                        )}
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
