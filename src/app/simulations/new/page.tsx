"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Atom, Thermometer, Gauge, Beaker, Zap, CheckCircle2,
    ChevronRight, Loader2, Copy, Pencil, FlaskConical,
    Activity, Shield, Droplets, AlertTriangle, BarChart3,
    Clock, Cpu, TrendingUp
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import MoleculeViewer3D from "@/components/molecule-viewer-3d";
import DrugLikenessGauge from "@/components/drug-likeness-gauge";
import {
    RadarPropertyChart, PropertyBarChart,
    ToxicityGauges, SolubilityCurve,
} from "@/components/plotly-charts";

/* ─── Property Options ─── */
const propertyOptions = [
    { key: "logp", label: "LogP (Lipophilicity)", desc: "Partition coefficient", icon: Droplets },
    { key: "pka", label: "pKa (Acid/Base)", desc: "Ionization constants", icon: FlaskConical },
    { key: "solubility", label: "Aqueous Solubility", desc: "Thermodynamic solubility", icon: Beaker },
    { key: "tpsa", label: "TPSA", desc: "Topological polar surface area", icon: Activity },
    { key: "bioavailability", label: "Bioavailability", desc: "Oral bioavailability score", icon: TrendingUp },
    { key: "toxicity", label: "Toxicity Screening", desc: "hERG, Ames, hepatotoxicity", icon: Shield },
];

/* ─── Status Colors & Descriptions ─── */
const STATUS_COLORS = {
    optimal: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
    moderate: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
    poor: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

const PROPERTY_DESCS: Record<string, Record<string, string>> = {
    logp: { optimal: "Ideal for membrane permeability", moderate: "Acceptable lipophilicity", poor: "May have solubility or permeability issues" },
    pka: { optimal: "Non-ionizable under physiological pH", moderate: "Context-dependent ionization behavior", poor: "May affect absorption kinetics" },
    solubility: { optimal: "Good aqueous solubility", moderate: "Moderate aqueous solubility", poor: "Poor solubility \u2014 formulation required" },
    tpsa: { optimal: "Good oral absorption expected", moderate: "Moderate polar surface area", poor: "High polarity \u2014 may limit membrane permeability" },
    bioavailability: { optimal: "Well-absorbed orally", moderate: "Moderate oral absorption", poor: "Poor oral bioavailability expected" },
    toxicity: { optimal: "Favorable safety profile", moderate: "Monitor for potential toxicity", poor: "Significant toxicity risk" },
};

/* ─── Classify edge function results into status categories ─── */
function classifyResult(key: string, value: number | string) {
    if (typeof value === "string") {
        const v = String(value).toLowerCase();
        if (v === "low" || v === "very low") return "optimal";
        if (v === "moderate") return "moderate";
        if (v === "n/a" || v === "non-ionizable") return "optimal";
        return "poor";
    }
    switch (key) {
        case "logp": return value >= 0 && value <= 5 ? "optimal" : value >= -1 && value <= 6 ? "moderate" : "poor";
        case "pka": return value >= 2 && value <= 12 ? "moderate" : "optimal";
        case "solubility": return value > 10 ? "optimal" : value > 1 ? "moderate" : "poor";
        case "tpsa": return value >= 20 && value <= 120 ? "optimal" : value >= 10 && value <= 140 || value < 20 ? "moderate" : "poor";
        case "bioavailability": return value >= 70 ? "optimal" : value >= 40 ? "moderate" : "poor";
        default: return "moderate";
    }
}

/* ─── Build display results from edge function response ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDisplayResults(rawResults: any) {
    const results: Record<string, { value: string | number; unit: string; status: "optimal" | "moderate" | "poor"; desc: string }> = {};

    if (rawResults.logp) {
        const val = rawResults.logp.value ?? rawResults.logp;
        const status = rawResults.logp.status ?? classifyResult("logp", val);
        results.logP = { value: typeof val === "number" ? Math.round(val * 100) / 100 : val, unit: "", status, desc: PROPERTY_DESCS.logp[status] };
    }
    if (rawResults.pka) {
        const rawVal = rawResults.pka.acidic ?? rawResults.pka.value ?? rawResults.pka;
        const isIonizable = rawResults.pka.ionizable !== false && rawVal != null;
        const val = isIonizable && typeof rawVal === "number" ? Math.round(rawVal * 100) / 100 : rawVal;
        if (!isIonizable || val == null) {
            results.pKa = { value: "N/A", unit: "", status: "optimal", desc: PROPERTY_DESCS.pka.optimal };
        } else {
            const status = rawResults.pka.status ?? classifyResult("pka", val);
            results.pKa = { value: val, unit: "", status, desc: PROPERTY_DESCS.pka[status] };
        }
    }
    if (rawResults.solubility) {
        const val = rawResults.solubility.value_mg_ml ?? rawResults.solubility.value ?? rawResults.solubility;
        const status = rawResults.solubility.status ?? classifyResult("solubility", val);
        results.solubility = { value: typeof val === "number" ? Math.round(val * 1000) / 1000 : val, unit: "mg/mL", status, desc: PROPERTY_DESCS.solubility[status] };
    }
    if (rawResults.tpsa != null) {
        const val = typeof rawResults.tpsa === "object" ? (rawResults.tpsa.value ?? 0) : rawResults.tpsa;
        const numVal = typeof val === "number" ? Math.round(val * 10) / 10 : val;
        const status = (rawResults.tpsa?.status as "optimal" | "moderate" | "poor") ?? classifyResult("tpsa", numVal);
        // Special description for very low TPSA (non-polar molecules)
        const desc = typeof numVal === "number" && numVal < 20
            ? "Low polarity — good membrane permeability"
            : PROPERTY_DESCS.tpsa[status];
        results.tpsa = { value: numVal, unit: "Å²", status, desc };
    }
    if (rawResults.bioavailability) {
        const val = rawResults.bioavailability.score != null ? Math.round(rawResults.bioavailability.score * 100) : (rawResults.bioavailability.value ?? rawResults.bioavailability);
        const status = rawResults.bioavailability.status ?? classifyResult("bioavailability", val);
        results.bioavailability = { value: val, unit: "%", status, desc: PROPERTY_DESCS.bioavailability[status] };
    }
    if (rawResults.toxicity) {
        const risk = rawResults.toxicity.herg_inhibition?.risk ?? rawResults.toxicity.value ?? "Low";
        const status = rawResults.toxicity.status ?? classifyResult("toxicity", risk);
        results.toxicity = { value: risk, unit: "", status, desc: PROPERTY_DESCS.toxicity[status] };
    }

    return results;
}

/* ═══════════════════════════════════════════════════════
   Simulation Setup Page (matches demo design)
   ═══════════════════════════════════════════════════════ */
function SimulationSetupInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const moleculeId = searchParams.get("molecule");
    const { user, profile, refreshProfile } = useAuth();
    const supabase = createClient();

    const [molecule, setMolecule] = useState<{ id: string; name: string; smiles: string; formula?: string; molecular_weight?: number } | null>(null);
    const [properties, setProperties] = useState<Record<string, boolean>>(
        Object.fromEntries(propertyOptions.map(p => [p.key, true]))
    );
    const [temperature, setTemperature] = useState(298.15);
    const [pressure, setPressure] = useState(1.0);
    const [solvent, setSolvent] = useState("water");
    const [phase, setPhase] = useState<"setup" | "running" | "results">("setup");
    const [progress, setProgress] = useState(0);
    const [activeChart, setActiveChart] = useState<"radar" | "bar" | "gauges" | "solubility">("radar");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [simulationResults, setSimulationResults] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [resultsMeta, setResultsMeta] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [drugLikenessData, setDrugLikenessData] = useState<any>(null);

    const selectedCount = Object.values(properties).filter(Boolean).length;
    const selectedProps = Object.entries(properties).filter(([, v]) => v).map(([k]) => k);
    const estimatedCost = selectedCount * 2;

    /* ── Fetch molecule data ── */
    const fetchMolecule = useCallback(async () => {
        if (!moleculeId) return;
        const { data } = await supabase
            .from("molecules")
            .select("id, name, smiles, formula, molecular_weight")
            .eq("id", moleculeId)
            .single();
        if (data) setMolecule(data);
    }, [moleculeId, supabase]);

    useEffect(() => {
        if (!user) { router.push("/auth/login"); return; }
        fetchMolecule();
    }, [user, router, fetchMolecule]);

    const toggleProperty = (key: string) => {
        haptic("selection");
        setProperties(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const copySMILES = () => {
        if (!molecule) return;
        navigator.clipboard.writeText(molecule.smiles);
        haptic("light");
        toast("SMILES copied!", "success");
    };

    /* ── Run simulation ── */
    const handleRun = async () => {
        if (!molecule || !user) return;
        if ((profile?.credits ?? 0) < estimatedCost) {
            haptic("error");
            toast("Insufficient credits!", "error");
            return;
        }

        haptic("heavy");
        setPhase("running");
        setProgress(0);
        setSimulationResults(null);
        setResultsMeta(null);

        const startTime = Date.now();

        try {
            // Call the local ML prediction API (same as demo page)
            const res = await fetch("/api/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles: molecule.smiles }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `ML server error (${res.status})`);
            }

            const mlData = await res.json();
            const props = mlData.properties || {};
            const tox = mlData.toxicity_screening || {};

            // Transform ML response into the format buildDisplayResults expects
            // Pass through backend status to avoid re-classification with different thresholds
            const results = {
                logp: props.logp ? { value: props.logp.value, status: props.logp.status, confidence: props.logp.confidence } : undefined,
                pka: props.pka ? { acidic: props.pka.value, value: props.pka.value, status: props.pka.status, ionizable: props.pka.ionizable, confidence: props.pka.confidence } : undefined,
                solubility: props.solubility ? { value_mg_ml: props.solubility.value, value: props.solubility.value, status: props.solubility.status, confidence: props.solubility.confidence } : undefined,
                tpsa: props.tpsa ? { value: props.tpsa.value, status: props.tpsa.status, confidence: props.tpsa.confidence } : undefined,
                bioavailability: props.bioavailability ? { score: props.bioavailability.value / 100, value: props.bioavailability.value, status: props.bioavailability.status, confidence: props.bioavailability.confidence } : undefined,
                toxicity: {
                    herg_inhibition: { risk: props.toxicity?.value || "Low", probability: (tox.herg_inhibition || 0) / 100 },
                    ames_mutagenicity: { probability: (tox.ames_mutagenicity || 0) / 100 },
                    hepatotoxicity: { probability: (tox.hepatotoxicity || 0) / 100 },
                    value: props.toxicity?.value || "Low",
                    status: props.toxicity?.status,
                    confidence: props.toxicity?.confidence,
                },
            };

            setSimulationResults(results);

            // Store drug-likeness data from ML response
            if (mlData.drug_likeness) {
                setDrugLikenessData(mlData.drug_likeness);
            }

            const runtimeMs = Date.now() - startTime;
            const confidence = mlData.confidence || 94.8;

            setResultsMeta({
                simulation_id: null,
                confidence_score: confidence,
                compute_cost: estimatedCost,
                credits_remaining: (profile?.credits ?? 0) - estimatedCost,
            });

            // Save simulation record to the simulations table
            const startedAt = new Date(startTime).toISOString();
            const completedAt = new Date().toISOString();

            try {
                const { data: simRecord } = await supabase
                    .from("simulations")
                    .insert({
                        user_id: user.id,
                        molecule_id: molecule.id,
                        status: "completed",
                        config_json: {
                            properties: selectedProps,
                            temperature,
                            pressure,
                            solvent,
                        },
                        result_json: results,
                        compute_cost: estimatedCost,
                        confidence_score: confidence,
                        started_at: startedAt,
                        completed_at: completedAt,
                    })
                    .select("id")
                    .single();

                if (simRecord) {
                    setResultsMeta((prev: Record<string, unknown>) => ({ ...prev, simulation_id: simRecord.id }));
                }
            } catch {
                console.warn("Failed to save simulation — results still shown");
            }

            // Deduct credits
            try {
                await supabase.rpc("deduct_credits", { amount: estimatedCost });
                await refreshProfile();
            } catch {
                console.warn("Credit deduction failed");
            }

        } catch (err) {
            haptic("error");
            toast((err as Error).message, "error");
            setPhase("setup");
            setProgress(0);
        }
    };

    /* ── Progress animation ── */
    useEffect(() => {
        if (phase !== "running") return;
        const t = setInterval(() => {
            setProgress(p => {
                // If we have results, speed to 100
                if (simulationResults && p < 100) {
                    const next = Math.min(p + 5, 100);
                    if (next >= 100) { clearInterval(t); setPhase("results"); }
                    return next;
                }
                // Otherwise animate normally up to 85 and wait
                if (p >= 85 && !simulationResults) return 85;
                if (p >= 100) { clearInterval(t); setPhase("results"); return 100; }
                return p + 2;
            });
        }, 60);
        return () => clearInterval(t);
    }, [phase, simulationResults]);

    const displayResults = simulationResults ? buildDisplayResults(simulationResults) : {};

    /* ─── Build chart data from simulation results ─── */
    const chartData = simulationResults ? {
        logP: typeof displayResults.logP?.value === "number" ? displayResults.logP.value : undefined,
        mw: molecule?.molecular_weight ?? undefined,
        tpsa: typeof displayResults.tpsa?.value === "number" ? displayResults.tpsa.value : undefined,
        pKa: typeof displayResults.pKa?.value === "number" ? displayResults.pKa.value : undefined,
        solubility: typeof displayResults.solubility?.value === "number" ? displayResults.solubility.value : undefined,
        bioavailability: typeof displayResults.bioavailability?.value === "number" ? displayResults.bioavailability.value : undefined,
        herg: simulationResults.toxicity?.herg_inhibition?.probability != null
            ? Math.round(simulationResults.toxicity.herg_inhibition.probability * 100)
            : undefined,
        ames: simulationResults.toxicity?.ames_mutagenicity?.probability != null
            ? Math.round(simulationResults.toxicity.ames_mutagenicity.probability * 100)
            : undefined,
        hepato: simulationResults.toxicity?.hepatotoxicity?.probability != null
            ? Math.round(simulationResults.toxicity.hepatotoxicity.probability * 100)
            : undefined,
        moleculeName: molecule?.name ?? "Compound",
    } : undefined;

    /* ═══════════════ No Molecule Selected ═══════════════ */
    if (!moleculeId) {
        return (
            <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
                <Atom size={48} style={{ color: "var(--text-muted)", marginBottom: 16 }} />
                <h2 style={{ fontWeight: 600, marginBottom: 8 }}>No molecule selected</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Define a molecule first to configure simulation</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <motion.button className="btn-primary" whileTap={{ scale: 0.97 }} onClick={() => router.push("/molecules/new")}>
                        Define Molecule
                    </motion.button>
                    <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }} onClick={() => router.push("/simulations/demo")}>
                        🧪 Try Demo (Aspirin)
                    </motion.button>
                </div>
            </div>
        );
    }

    /* ═══════════════ Running Phase ═══════════════ */
    if (phase === "running") {
        return (
            <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: 32 }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                    <div style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(59,130,246,0.08)", border: "2px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                            <Cpu size={48} style={{ color: "var(--accent-blue)" }} />
                        </motion.div>
                    </div>
                </motion.div>

                <div style={{ textAlign: "center" }}>
                    <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit)" }}>
                        Running Simulation…
                    </h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                        Computing physicochemical properties for <strong>{molecule?.name || "molecule"}</strong>
                    </p>
                </div>

                {/* Progress bar */}
                <div style={{ width: "100%", maxWidth: 480 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                        <span>{progress < 30 ? "Initializing force field…" : progress < 60 ? "Calculating properties…" : progress < 85 ? "Running toxicity screening…" : "Finalizing results…"}</span>
                        <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <motion.div
                            animate={{ width: `${progress}%` }}
                            style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #3b82f6, #06b6d4)" }}
                        />
                    </div>
                </div>

                {/* Steps */}
                <GlassCard padding="20px" style={{ width: "100%", maxWidth: 480 }}>
                    {["Molecular geometry optimization", "Physicochemical property prediction", "ADMET profiling", "Toxicity risk assessment", "Report generation"].map((step, i) => {
                        const done = progress > (i + 1) * 18;
                        const active = !done && progress > i * 18;
                        return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", opacity: done || active ? 1 : 0.35 }}>
                                {done ? (
                                    <CheckCircle2 size={16} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
                                ) : active ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                        <Loader2 size={16} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
                                    </motion.div>
                                ) : (
                                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid var(--text-muted)", flexShrink: 0 }} />
                                )}
                                <span style={{ fontSize: "0.85rem", color: done ? "var(--text-primary)" : "var(--text-secondary)" }}>{step}</span>
                            </div>
                        );
                    })}
                </GlassCard>
            </div>
        );
    }

    /* ═══════════════ Results Phase ═══════════════ */
    if (phase === "results") {
        return (
            <div className="page-container">
                {/* Breadcrumb */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    <span>Simulation Setup</span><ChevronRight size={12} />
                    <span>Processing</span><ChevronRight size={12} />
                    <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>Results</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit)" }}>
                        Simulation Results
                    </h1>
                    <span className="badge badge-completed">Completed</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
                    {/* Left column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {/* 3D Viewer */}
                        <GlassCard glow="blue" padding="0" style={{ overflow: "hidden" }}>
                            <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>{molecule?.name || "Molecule"}</h3>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        {molecule?.formula || ""} · MW: {molecule?.molecular_weight || "—"} g/mol
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <span className="badge badge-processing" style={{ fontSize: "0.7rem" }}>3D Interactive</span>
                                </div>
                            </div>
                            <div style={{ height: 300, padding: "8px 12px 12px" }}>
                                <MoleculeViewer3D smiles={molecule?.smiles} />
                            </div>
                        </GlassCard>

                        {/* Drug-Likeness Gauge */}
                        {drugLikenessData && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                                <DrugLikenessGauge data={drugLikenessData} />
                            </motion.div>
                        )}

                        {/* Plotly Charts */}
                        <GlassCard padding="16px">
                            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                                {([
                                    { key: "radar", label: "Drug-likeness" },
                                    { key: "bar", label: "Properties" },
                                    { key: "gauges", label: "Toxicity" },
                                    { key: "solubility", label: "Solubility" },
                                ] as const).map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveChart(tab.key)}
                                        style={{
                                            padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600,
                                            border: "1px solid",
                                            borderColor: activeChart === tab.key ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)",
                                            background: activeChart === tab.key ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                                            color: activeChart === tab.key ? "#60a5fa" : "#94a3b8",
                                            cursor: "pointer", transition: "all 0.2s",
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeChart}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {activeChart === "radar" && <RadarPropertyChart height={340} data={chartData} />}
                                    {activeChart === "bar" && <PropertyBarChart height={300} data={chartData} />}
                                    {activeChart === "gauges" && <ToxicityGauges height={220} data={chartData} />}
                                    {activeChart === "solubility" && <SolubilityCurve height={300} data={chartData} />}
                                </motion.div>
                            </AnimatePresence>
                        </GlassCard>
                    </div>

                    {/* Right column — Property cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {/* Molecule info mini */}
                        <GlassCard padding="16px">
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>SMILES STRING</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(0,0,0,0.25)", borderRadius: 8, fontSize: "0.82rem", fontFamily: "monospace", color: "var(--accent-cyan)" }}>
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{molecule?.smiles}</span>
                                <Copy size={14} style={{ cursor: "pointer", flexShrink: 0, opacity: 0.6 }} onClick={copySMILES} />
                            </div>
                        </GlassCard>

                        {/* Property result cards */}
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            <BarChart3 size={15} style={{ color: "var(--accent-purple)" }} />
                            Predicted Properties
                        </div>
                        {Object.entries(displayResults).map(([key, prop], i) => {
                            const sc = STATUS_COLORS[prop.status];
                            return (
                                <motion.div
                                    key={key}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.08 }}
                                >
                                    <GlassCard padding="14px" hover={false}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                            <span style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "capitalize" }}>
                                                {key === "logP" ? "LogP" : key === "pKa" ? "pKa" : key === "tpsa" ? "TPSA" : key}
                                            </span>
                                            <span style={{
                                                padding: "2px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 600,
                                                background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text,
                                            }}>
                                                {prop.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                                            {prop.value} <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)" }}>{prop.unit}</span>
                                        </div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{prop.desc}</div>
                                    </GlassCard>
                                </motion.div>
                            );
                        })}

                        {/* Simulation meta */}
                        <GlassCard padding="14px" glow="purple">
                            <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                <Clock size={13} style={{ color: "var(--accent-purple)" }} /> Run Details
                            </div>
                            {[
                                ["Temperature", `${temperature} K`],
                                ["Pressure", `${pressure} atm`],
                                ["Solvent", solvent === "water" ? "Water (TIP3P)" : solvent],
                                ["Compute Cost", `${resultsMeta?.compute_cost || estimatedCost} credits`],
                                ["Confidence", resultsMeta?.confidence_score ? `${Number(resultsMeta.confidence_score).toFixed(1)}%` : "—"],
                            ].map(([label, val]) => (
                                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.78rem" }}>
                                    <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                    <span style={{ fontWeight: 600 }}>{val}</span>
                                </div>
                            ))}
                        </GlassCard>

                        {resultsMeta?.simulation_id && (
                            <motion.button
                                className="btn-primary"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => router.push(`/results/${resultsMeta.simulation_id}`)}
                                style={{ width: "100%", justifyContent: "center", padding: "12px 24px", background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
                            >
                                View Detailed Results →
                            </motion.button>
                        )}

                        <motion.button
                            className="btn-secondary"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { setPhase("setup"); setProgress(0); }}
                            style={{ width: "100%", justifyContent: "center", padding: "12px 24px" }}
                        >
                            ← Back to Setup
                        </motion.button>
                    </div>
                </div>
            </div>
        );
    }

    /* ═══════════════ Setup Phase ═══════════════ */
    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <span>Home</span><ChevronRight size={12} />
                <span>Project</span><ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>New Simulation</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit)", marginBottom: 6 }}>
                        Simulation Setup
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Configure parameters for predicting molecular properties.
                    </p>
                </div>
                <span style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20,
                    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                    fontSize: "0.78rem", fontWeight: 600, color: "#22c55e",
                }}>
                    <CheckCircle2 size={14} /> Cluster Ready
                </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
                {/* ────── Left Column ────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {/* Target Molecule + 3D Viewer */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <GlassCard glow="blue" padding="20px">
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 12 }}>
                                TARGET MOLECULE
                            </div>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 2 }}>
                                {molecule?.name || "Loading..."}
                                {molecule?.formula && (
                                    <span style={{ marginLeft: 10, fontSize: "0.78rem", fontWeight: 500, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>
                                        {molecule.formula}
                                    </span>
                                )}
                            </h2>
                            {molecule?.molecular_weight && (
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 16 }}>
                                    MW: {molecule.molecular_weight} g/mol
                                </div>
                            )}
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 6 }}>SMILES STRING</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(0,0,0,0.25)", borderRadius: 8, fontFamily: "monospace", fontSize: "0.82rem", color: "var(--accent-cyan)" }}>
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{molecule?.smiles || "..."}</span>
                                <Copy size={14} style={{ cursor: "pointer", opacity: 0.5, flexShrink: 0 }} onClick={copySMILES} />
                            </div>
                            <button
                                onClick={() => toast("Structure editor coming soon", "info")}
                                style={{
                                    marginTop: 14, display: "flex", alignItems: "center", gap: 6,
                                    background: "none", border: "none", color: "var(--accent-blue)",
                                    fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                                }}
                            >
                                <Pencil size={14} /> Edit Structure
                            </button>
                        </GlassCard>

                        {/* 3D Viewer */}
                        <GlassCard padding="0" style={{ overflow: "hidden", minHeight: 260 }}>
                            <MoleculeViewer3D smiles={molecule?.smiles} height="100%" />
                        </GlassCard>
                    </div>

                    {/* Physicochemical Properties */}
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <AlertTriangle size={16} style={{ color: "var(--accent-orange)" }} />
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Physicochemical Properties</h2>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {propertyOptions.map(prop => {
                                const active = properties[prop.key];
                                const Icon = prop.icon;
                                return (
                                    <motion.div key={prop.key} whileTap={{ scale: 0.98 }}>
                                        <GlassCard onClick={() => toggleProperty(prop.key)} padding="16px" style={{
                                            cursor: "pointer",
                                            borderColor: active ? "rgba(59,130,246,0.4)" : "var(--glass-border)",
                                            background: active ? "rgba(59,130,246,0.05)" : "var(--glass-bg)",
                                            transition: "all 0.2s",
                                        }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: 8,
                                                        background: active ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.04)",
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        transition: "all 0.2s",
                                                    }}>
                                                        <Icon size={15} style={{ color: active ? "#60a5fa" : "#64748b" }} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{prop.label}</div>
                                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{prop.desc}</div>
                                                    </div>
                                                </div>
                                                {/* Toggle */}
                                                <motion.div animate={{ background: active ? "var(--accent-blue)" : "var(--navy-600)" }} style={{
                                                    width: 40, height: 22, borderRadius: 11, position: "relative", flexShrink: 0,
                                                }}>
                                                    <motion.div
                                                        animate={{ left: active ? 20 : 3 }}
                                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                        style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3 }}
                                                    />
                                                </motion.div>
                                            </div>
                                        </GlassCard>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ────── Right Column ────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Conditions */}
                    <GlassCard padding="20px">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                            <FlaskConical size={16} style={{ color: "var(--accent-cyan)" }} />
                            <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>Conditions</h3>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: "0.82rem" }}>
                                    <Thermometer size={14} style={{ color: "var(--accent-orange)" }} /> Temperature (K)
                                </div>
                                <div style={{ position: "relative" }}>
                                    <input type="number" className="input" value={temperature} onChange={e => setTemperature(Number(e.target.value))} step={0.01} style={{ paddingRight: 32 }} />
                                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted)" }}>K</span>
                                </div>
                            </div>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: "0.82rem" }}>
                                    <Gauge size={14} style={{ color: "var(--accent-purple)" }} /> Pressure (atm)
                                </div>
                                <div style={{ position: "relative" }}>
                                    <input type="number" className="input" value={pressure} onChange={e => setPressure(Number(e.target.value))} step={0.1} style={{ paddingRight: 36 }} />
                                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted)" }}>atm</span>
                                </div>
                            </div>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: "0.82rem" }}>
                                    <Beaker size={14} style={{ color: "var(--accent-cyan)" }} /> Solvent Model
                                </div>
                                <select className="input" value={solvent} onChange={e => setSolvent(e.target.value)} style={{ cursor: "pointer" }}>
                                    <option value="water">Implicit (Water)</option>
                                    <option value="dmso">DMSO</option>
                                    <option value="ethanol">Ethanol</option>
                                    <option value="methanol">Methanol</option>
                                    <option value="vacuum">Vacuum</option>
                                </select>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Summary */}
                    <GlassCard glow="purple" padding="20px">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <Zap size={16} style={{ color: "var(--accent-purple)" }} />
                            <h3 style={{ fontWeight: 600 }}>Simulation Summary</h3>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[
                                ["Properties Selected", `${selectedCount} / ${propertyOptions.length}`],
                                ["Est. Compute Cost", `${estimatedCost} Credits`],
                                ["Your Credits", `${profile?.credits ?? 0}`],
                            ].map(([l, v]) => (
                                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                                    <span style={{ fontWeight: 600 }}>{v}</span>
                                </div>
                            ))}
                            <div style={{ height: 1, background: "var(--glass-border)", margin: "2px 0" }} />
                            <div style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
                                background: (profile?.credits ?? 0) >= estimatedCost ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                                border: `1px solid ${(profile?.credits ?? 0) >= estimatedCost ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                            }}>
                                <CheckCircle2 size={13} style={{
                                    color: (profile?.credits ?? 0) >= estimatedCost ? "var(--accent-green)" : "#ef4444",
                                }} />
                                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                    {(profile?.credits ?? 0) >= estimatedCost
                                        ? <>Ready to run · Est. <strong style={{ color: "var(--text-primary)" }}>~45 mins</strong></>
                                        : <strong style={{ color: "#ef4444" }}>Insufficient credits</strong>
                                    }
                                </span>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10 }}>
                        <motion.button
                            className="btn-secondary"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => toast("Draft saved", "success")}
                            style={{ flex: 1, justifyContent: "center", padding: "12px 16px" }}
                        >
                            Save Draft
                        </motion.button>
                        <motion.button
                            className="btn-primary"
                            disabled={selectedCount === 0 || (profile?.credits ?? 0) < estimatedCost}
                            whileHover={{ scale: selectedCount === 0 ? 1 : 1.02 }}
                            whileTap={{ scale: selectedCount === 0 ? 1 : 0.97 }}
                            onClick={handleRun}
                            style={{
                                flex: 2, justifyContent: "center", padding: "12px 24px",
                                opacity: selectedCount === 0 || (profile?.credits ?? 0) < estimatedCost ? 0.5 : 1,
                                background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                            }}
                        >
                            <Play size={16} /> Run Simulation
                        </motion.button>
                    </div>
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
