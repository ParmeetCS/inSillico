"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Upload,
    Pencil,
    ArrowRight,
    Atom,
    FileText,
    Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

export default function MoleculeInputPage() {
    const { user } = useAuth();
    const router = useRouter();
    const supabase = createClient();

    const [activeTab, setActiveTab] = useState<"draw" | "upload">("draw");
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
            // Get fresh session token to ensure authenticated requests
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated. Please log in again.");

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
            const headers = {
                "Content-Type": "application/json",
                "apikey": supabaseKey,
                "Authorization": `Bearer ${session.access_token}`,
                "Prefer": "return=representation",
            };

            // 1. Ensure we have a project
            let projectId: string;
            const projRes = await fetch(
                `${supabaseUrl}/rest/v1/projects?select=id&user_id=eq.${user.id}&limit=1`,
                { headers }
            );
            const projects = await projRes.json();

            if (Array.isArray(projects) && projects.length > 0) {
                projectId = projects[0].id;
            } else {
                const newProjRes = await fetch(`${supabaseUrl}/rest/v1/projects?select=id`, {
                    method: "POST",
                    headers: { ...headers, "Prefer": "return=representation" },
                    body: JSON.stringify({ user_id: user.id, name: "My First Project", description: "Default project" }),
                });
                if (!newProjRes.ok) throw new Error("Failed to create project: " + (await newProjRes.text()));
                const [newProject] = await newProjRes.json();
                projectId = newProject.id;
            }

            // 2. Create the molecule
            const molRes = await fetch(`${supabaseUrl}/rest/v1/molecules?select=id`, {
                method: "POST",
                headers: { ...headers, "Prefer": "return=representation" },
                body: JSON.stringify({
                    project_id: projectId,
                    user_id: user.id,
                    name: name.trim() || `Compound-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    smiles: smiles.trim(),
                    formula: formula.trim() || null,
                    molecular_weight: molecularWeight ? parseFloat(molecularWeight) : null,
                }),
            });

            if (!molRes.ok) {
                const errText = await molRes.text();
                throw new Error(`Molecule save failed (${molRes.status}): ${errText}`);
            }

            const [molecule] = await molRes.json();

            haptic("success");
            toast("Molecule saved! Configure your simulation.", "success");
            router.push(`/simulations/new?molecule=${molecule.id}&project=${projectId}`);
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
                        Enter a SMILES string or upload a structure file
                    </p>

                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
                        {[
                            { key: "draw" as const, label: "SMILES Input", icon: Pencil },
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

                    {activeTab === "draw" ? (
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
