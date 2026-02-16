"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    Save,
    Play,
    Atom,
    Thermometer,
    Gauge,
    Beaker,
    Zap,
    CheckCircle2,
    ChevronRight,
    Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

const propertyOptions = [
    { key: "logp", label: "LogP (Lipophilicity)", desc: "Partition coefficient", enabled: true },
    { key: "pka", label: "pKa (Acid/Base)", desc: "Ionization constants", enabled: true },
    { key: "solubility", label: "Aqueous Solubility", desc: "Thermodynamic solubility", enabled: true },
    { key: "tpsa", label: "TPSA", desc: "Topological polar surface area", enabled: false },
    { key: "bioavailability", label: "Bioavailability", desc: "Oral bioavailability score", enabled: true },
    { key: "toxicity", label: "Toxicity Screening", desc: "hERG, Ames, hepatotoxicity", enabled: true },
];

function SimulationSetupInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const moleculeId = searchParams.get("molecule");
    const projectId = searchParams.get("project");
    const { user, profile, refreshProfile } = useAuth();
    const supabase = createClient();

    const [molecule, setMolecule] = useState<{ id: string; name: string; smiles: string } | null>(null);
    const [properties, setProperties] = useState(
        propertyOptions.reduce((acc, p) => ({ ...acc, [p.key]: p.enabled }), {} as Record<string, boolean>)
    );
    const [temperature, setTemperature] = useState(298.15);
    const [pressure, setPressure] = useState(1.0);
    const [solvent, setSolvent] = useState("water");
    const [running, setRunning] = useState(false);

    const selectedProps = Object.entries(properties).filter(([, v]) => v).map(([k]) => k);
    const estimatedCost = selectedProps.length * 2;

    const fetchMolecule = useCallback(async () => {
        if (!moleculeId) return;
        const { data } = await supabase
            .from("molecules")
            .select("id, name, smiles")
            .eq("id", moleculeId)
            .single();
        if (data) setMolecule(data);
    }, [moleculeId, supabase]);

    useEffect(() => {
        if (!user) {
            router.push("/auth/login");
            return;
        }
        fetchMolecule();
    }, [user, router, fetchMolecule]);

    const toggleProperty = (key: string) => {
        haptic("selection");
        setProperties((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleRun = async () => {
        if (!molecule || !projectId || !user) return;
        if ((profile?.credits ?? 0) < estimatedCost) {
            haptic("error");
            toast("Insufficient credits!", "error");
            return;
        }

        haptic("heavy");
        setRunning(true);

        try {
            const config = {
                properties: selectedProps,
                temperature_k: temperature,
                pressure_atm: pressure,
                solvent_model: solvent,
            };

            // Call the simulate edge function — it handles everything:
            // creates simulation record, generates predictions, updates results, deducts credits
            const { data: result, error: fnErr } = await supabase.functions.invoke("simulate", {
                body: {
                    smiles: molecule.smiles,
                    molecule_id: molecule.id,
                    project_id: projectId,
                    config,
                },
            });

            if (fnErr) throw new Error(fnErr.message || "Simulation failed");
            if (result?.error) throw new Error(result.error);

            await refreshProfile();

            haptic("success");
            toast("Simulation complete!", "success");
            router.push(`/results/${result.simulation_id}`);
        } catch (err) {
            haptic("error");
            toast((err as Error).message, "error");
            setRunning(false);
        }
    };

    if (!moleculeId) {
        return (
            <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
                <Atom size={48} style={{ color: "var(--text-muted)", marginBottom: 16 }} />
                <h2 style={{ fontWeight: 600, marginBottom: 8 }}>No molecule selected</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Define a molecule first to configure simulation</p>
                <motion.button className="btn-primary" whileTap={{ scale: 0.97 }} onClick={() => router.push("/molecules/new")}>
                    Define Molecule
                </motion.button>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 24 }}>
                <span>Molecule Input</span>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Configure Simulation</span>
                <ChevronRight size={12} />
                <span>Results</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
                {/* Main */}
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit), sans-serif" }}>
                        Simulation Configuration
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 32 }}>
                        Select properties to predict and configure simulation conditions
                    </p>

                    {/* Target Molecule */}
                    <GlassCard glow="blue" style={{ marginBottom: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Atom size={20} style={{ color: "var(--accent-blue)" }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600 }}>Target Molecule</div>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    {molecule?.name || "Loading..."}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8, fontFamily: "monospace", fontSize: "0.85rem", color: "var(--accent-cyan)" }}>
                            {molecule?.smiles || "..."}
                        </div>
                    </GlassCard>

                    {/* Properties Selection */}
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16 }}>
                        Physicochemical Properties
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
                        {propertyOptions.map((prop) => (
                            <motion.div key={prop.key} whileTap={{ scale: 0.98 }}>
                                <GlassCard
                                    onClick={() => toggleProperty(prop.key)}
                                    padding="16px"
                                    style={{
                                        cursor: "pointer",
                                        borderColor: properties[prop.key] ? "rgba(59,130,246,0.4)" : "var(--glass-border)",
                                        background: properties[prop.key] ? "rgba(59,130,246,0.05)" : "var(--glass-bg)",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 2 }}>{prop.label}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{prop.desc}</div>
                                        </div>
                                        <motion.div
                                            animate={{ background: properties[prop.key] ? "var(--accent-blue)" : "var(--navy-600)" }}
                                            style={{
                                                width: 38,
                                                height: 22,
                                                borderRadius: 11,
                                                position: "relative",
                                                transition: "background 0.2s ease",
                                            }}
                                        >
                                            <motion.div
                                                animate={{ left: properties[prop.key] ? 19 : 3 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                style={{
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: "50%",
                                                    background: "white",
                                                    position: "absolute",
                                                    top: 3,
                                                }}
                                            />
                                        </motion.div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </div>

                    {/* Conditions */}
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16 }}>
                        Simulation Conditions
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <GlassCard padding="16px">
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <Thermometer size={16} style={{ color: "var(--accent-orange)" }} />
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Temperature</span>
                            </div>
                            <input
                                type="number"
                                className="input"
                                value={temperature}
                                onChange={(e) => setTemperature(Number(e.target.value))}
                                step={0.01}
                            />
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, display: "block" }}>Kelvin</span>
                        </GlassCard>
                        <GlassCard padding="16px">
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <Gauge size={16} style={{ color: "var(--accent-purple)" }} />
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Pressure</span>
                            </div>
                            <input
                                type="number"
                                className="input"
                                value={pressure}
                                onChange={(e) => setPressure(Number(e.target.value))}
                                step={0.1}
                            />
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, display: "block" }}>atm</span>
                        </GlassCard>
                        <GlassCard padding="16px">
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <Beaker size={16} style={{ color: "var(--accent-cyan)" }} />
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Solvent</span>
                            </div>
                            <select
                                className="input"
                                value={solvent}
                                onChange={(e) => setSolvent(e.target.value)}
                                style={{ cursor: "pointer" }}
                            >
                                <option value="water">Water (TIP3P)</option>
                                <option value="dmso">DMSO</option>
                                <option value="ethanol">Ethanol</option>
                                <option value="methanol">Methanol</option>
                                <option value="vacuum">Vacuum</option>
                            </select>
                        </GlassCard>
                    </div>
                </div>

                {/* Sidebar */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard glow="purple">
                        <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                            <Zap size={16} style={{ color: "var(--accent-purple)" }} />
                            Simulation Summary
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Properties Selected</span>
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{selectedProps.length} / {propertyOptions.length}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Estimated Cost</span>
                                <span className="text-gradient" style={{ fontWeight: 700 }}>{estimatedCost} credits</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Your Credits</span>
                                <span style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    color: (profile?.credits ?? 0) >= estimatedCost ? "var(--accent-green)" : "#ef4444",
                                }}>
                                    {profile?.credits ?? 0}
                                </span>
                            </div>
                            <div style={{ height: 1, background: "var(--glass-border)", margin: "4px 0" }} />
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <CheckCircle2 size={14} style={{
                                    color: (profile?.credits ?? 0) >= estimatedCost ? "var(--accent-green)" : "#ef4444",
                                }} />
                                <span style={{
                                    fontSize: "0.8rem",
                                    color: (profile?.credits ?? 0) >= estimatedCost ? "var(--accent-green)" : "#ef4444",
                                }}>
                                    {(profile?.credits ?? 0) >= estimatedCost ? "Ready to run" : "Insufficient credits"}
                                </span>
                            </div>
                        </div>
                    </GlassCard>

                    <motion.button
                        className="btn-primary"
                        disabled={running || selectedProps.length === 0 || (profile?.credits ?? 0) < estimatedCost}
                        whileHover={{ scale: running ? 1 : 1.02 }}
                        whileTap={{ scale: running ? 1 : 0.97 }}
                        onClick={handleRun}
                        style={{
                            width: "100%",
                            justifyContent: "center",
                            padding: "14px 24px",
                            opacity: running || selectedProps.length === 0 ? 0.6 : 1,
                        }}
                    >
                        {running ? (
                            <>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                    <Loader2 size={16} />
                                </motion.div>
                                Running Simulation...
                            </>
                        ) : (
                            <>
                                <Play size={16} />
                                Run Simulation
                            </>
                        )}
                    </motion.button>
                </div>
            </div>
        </div>
    );
}

export default function SimulationSetupPage() {
    return (
        <Suspense fallback={<div className="page-container"><p>Loading...</p></div>}>
            <SimulationSetupInner />
        </Suspense>
    );
}
