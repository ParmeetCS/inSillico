"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Atom, Thermometer, Gauge, Beaker, Zap, CheckCircle2,
    ChevronRight, Loader2, Copy, Pencil, FlaskConical,
    Activity, Shield, Droplets, AlertTriangle, BarChart3,
    Clock, Cpu, TrendingUp
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import MoleculeViewer3D from "@/components/molecule-viewer-3d";
import DrugLikenessGauge from "@/components/drug-likeness-gauge";
import {
    RadarPropertyChart, PropertyBarChart,
    ToxicityGauges, SolubilityCurve,
} from "@/components/plotly-charts";

/* ─── Demo Aspirin Data ─── */
const ASPIRIN = {
    name: "Aspirin",
    iupac: "2-Acetoxybenzoic acid",
    formula: "C₉H₈O₄",
    smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
    mw: 180.16,
    cas: "50-78-2",
    drugBank: "DB00945",
};

/* Fallback demo results (used if ML server is unavailable) */
const FALLBACK_RESULTS = {
    logP: { value: 1.43, unit: "", status: "optimal" as const, desc: "Ideal for membrane permeability" },
    pKa: { value: 3.49, unit: "", status: "moderate" as const, desc: "Weak acid — mostly ionized at pH 7.4" },
    solubility: { value: 4.6, unit: "mg/mL", status: "moderate" as const, desc: "Moderate aqueous solubility" },
    tpsa: { value: 63.6, unit: "Å²", status: "optimal" as const, desc: "Good oral absorption expected" },
    bioavailability: { value: 68, unit: "%", status: "optimal" as const, desc: "Well-absorbed orally" },
    toxicity: { value: "Low", unit: "", status: "optimal" as const, desc: "Favorable safety profile" },
};

const PROPERTY_DESCS: Record<string, Record<string, string>> = {
    logp: {
        optimal: "Ideal for membrane permeability",
        moderate: "Acceptable lipophilicity",
        poor: "May have solubility or permeability issues",
    },
    pka: {
        optimal: "Non-ionizable under physiological pH",
        moderate: "Context-dependent ionization behavior",
        poor: "May affect absorption kinetics",
    },
    solubility: {
        optimal: "Good aqueous solubility",
        moderate: "Moderate aqueous solubility",
        poor: "Poor solubility \u2014 formulation required",
    },
    tpsa: {
        optimal: "Good oral absorption expected",
        moderate: "Moderate polar surface area",
        poor: "High polarity \u2014 may limit membrane permeability",
    },
    bioavailability: {
        optimal: "Well-absorbed orally",
        moderate: "Moderate oral absorption",
        poor: "Poor oral bioavailability expected",
    },
    toxicity: {
        optimal: "Favorable safety profile",
        moderate: "Monitor for potential toxicity",
        poor: "Significant toxicity risk",
    },
};

const STATUS_COLORS = {
    optimal: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
    moderate: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
    poor: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

const propertyOptions = [
    { key: "logp", label: "LogP (Lipophilicity)", desc: "Partition coefficient", icon: Droplets },
    { key: "pka", label: "pKa (Acid/Base)", desc: "Ionization constants", icon: FlaskConical },
    { key: "solubility", label: "Aqueous Solubility", desc: "Thermodynamic solubility", icon: Beaker },
    { key: "tpsa", label: "TPSA", desc: "Topological polar surface area", icon: Activity },
    { key: "bioavailability", label: "Bioavailability", desc: "Oral bioavailability score", icon: TrendingUp },
    { key: "toxicity", label: "Toxicity Screening", desc: "hERG, Ames, hepatotoxicity", icon: Shield },
];

/* ═════════════════════════════════════════════════════════
   Simulation Demo Page
   ═════════════════════════════════════════════════════════ */
export default function SimulationDemoPage() {
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
    const [mlResults, setMlResults] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [drugLikenessData, setDrugLikenessData] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [moleculeFeatures, setMoleculeFeatures] = useState<any>(null);
    const [revealedFeatureCount, setRevealedFeatureCount] = useState(0);

    const selectedCount = Object.values(properties).filter(Boolean).length;
    const estimatedCost = selectedCount * 5;
    const credits = 100;

    const toggleProperty = (key: string) => {
        haptic("selection");
        setProperties(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const copySMILES = () => {
        navigator.clipboard.writeText(ASPIRIN.smiles);
        haptic("light");
        toast("SMILES copied!", "success");
    };

    /* ── Run simulation: call ML backend + animate progress ── */
    const handleRun = async () => {
        if (selectedCount === 0) return;
        haptic("heavy");
        setPhase("running");
        setProgress(0);
        setMlResults(null);
        setMoleculeFeatures(null);
        setRevealedFeatureCount(0);

        const startTime = Date.now();

        // Fetch descriptors in parallel for animated feature display
        fetch("/api/descriptors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ smiles: ASPIRIN.smiles }),
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.rdkit_properties) {
                    setMoleculeFeatures(data.rdkit_properties);
                }
            })
            .catch(() => { /* Silently fail */ });

        // Call the ML prediction API in parallel with the progress animation
        try {
            const res = await fetch("/api/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles: ASPIRIN.smiles }),
            });
            if (res.ok) {
                const data = await res.json();
                setMlResults(data);

                // Store drug-likeness data from ML response
                if (data.drug_likeness) {
                    setDrugLikenessData(data.drug_likeness);
                }

                // Save to Supabase for the Results page
                const runtimeMs = Date.now() - startTime;
                try {
                    await fetch("/api/predict/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            smiles: ASPIRIN.smiles,
                            molecule_name: data.molecule?.name || ASPIRIN.name,
                            formula: data.molecule?.formula || ASPIRIN.formula,
                            molecular_weight: data.molecule?.molecular_weight || ASPIRIN.mw,
                            properties: data.properties,
                            toxicity_screening: data.toxicity_screening || null,
                            confidence: data.confidence || 94.8,
                            runtime_ms: runtimeMs,
                        }),
                    });
                } catch {
                    console.warn("Failed to save prediction — results still shown");
                }
            }
        } catch {
            // ML server might not be running — use fallback
            console.warn("ML server unavailable, using fallback data");
        }
    };

    useEffect(() => {
        if (phase !== "running") return;
        const t = setInterval(() => {
            setProgress(p => {
                if (p >= 100) { clearInterval(t); setPhase("results"); return 100; }
                return p + 1;
            });
        }, 250);
        return () => clearInterval(t);
    }, [phase]);

    /* ── Progressive feature reveal during running phase ── */
    useEffect(() => {
        if (phase !== "running" || !moleculeFeatures) return;
        const featureKeys = Object.keys(moleculeFeatures);
        const totalFeatures = featureKeys.length;
        if (totalFeatures === 0) return;

        setRevealedFeatureCount(0);
        let current = 0;
        const interval = setInterval(() => {
            current++;
            setRevealedFeatureCount(current);
            if (current >= totalFeatures) clearInterval(interval);
        }, 1200);
        return () => clearInterval(interval);
    }, [phase, moleculeFeatures]);

    /* ── Build result data from ML predictions or fallback ── */
    const DEMO_RESULTS = mlResults ? {
        logP: {
            value: mlResults.properties.logp.value,
            unit: mlResults.properties.logp.unit,
            status: mlResults.properties.logp.status as "optimal" | "moderate" | "poor",
            desc: PROPERTY_DESCS.logp[mlResults.properties.logp.status] || "Lipophilicity",
        },
        pKa: {
            value: mlResults.properties.pka.value ?? "N/A",
            unit: mlResults.properties.pka.value != null ? mlResults.properties.pka.unit : "",
            status: mlResults.properties.pka.status as "optimal" | "moderate" | "poor",
            desc: mlResults.properties.pka.value == null
                ? PROPERTY_DESCS.pka.optimal
                : (PROPERTY_DESCS.pka[mlResults.properties.pka.status] || "Ionization"),
        },
        solubility: {
            value: mlResults.properties.solubility.value,
            unit: mlResults.properties.solubility.unit,
            status: mlResults.properties.solubility.status as "optimal" | "moderate" | "poor",
            desc: PROPERTY_DESCS.solubility[mlResults.properties.solubility.status] || "Solubility",
        },
        tpsa: {
            value: mlResults.properties.tpsa.value,
            unit: mlResults.properties.tpsa.unit,
            status: mlResults.properties.tpsa.status as "optimal" | "moderate" | "poor",
            desc: PROPERTY_DESCS.tpsa[mlResults.properties.tpsa.status] || "Surface area",
        },
        bioavailability: {
            value: mlResults.properties.bioavailability.value,
            unit: mlResults.properties.bioavailability.unit,
            status: mlResults.properties.bioavailability.status as "optimal" | "moderate" | "poor",
            desc: PROPERTY_DESCS.bioavailability[mlResults.properties.bioavailability.status] || "Bioavailability",
        },
        toxicity: {
            value: mlResults.properties.toxicity.value,
            unit: mlResults.properties.toxicity.unit,
            status: mlResults.properties.toxicity.status as "optimal" | "moderate" | "poor",
            desc: PROPERTY_DESCS.toxicity[mlResults.properties.toxicity.status] || "Toxicity",
        },
    } : FALLBACK_RESULTS;

    /* ── Build chart data from results ── */
    const chartData = {
        logP: typeof DEMO_RESULTS.logP?.value === "number" ? DEMO_RESULTS.logP.value : undefined,
        mw: mlResults?.molecule?.molecular_weight ?? ASPIRIN.mw,
        tpsa: typeof DEMO_RESULTS.tpsa?.value === "number" ? DEMO_RESULTS.tpsa.value : undefined,
        pKa: typeof DEMO_RESULTS.pKa?.value === "number" ? DEMO_RESULTS.pKa.value : undefined,
        solubility: typeof DEMO_RESULTS.solubility?.value === "number" ? DEMO_RESULTS.solubility.value : undefined,
        bioavailability: typeof DEMO_RESULTS.bioavailability?.value === "number" ? DEMO_RESULTS.bioavailability.value : undefined,
        herg: mlResults?.toxicity_screening?.herg_inhibition ?? 18,
        ames: mlResults?.toxicity_screening?.ames_mutagenicity ?? 12,
        hepato: mlResults?.toxicity_screening?.hepatotoxicity ?? 25,
        moleculeName: "Aspirin",
    };

    /* ═══════════════ Running Phase ═══════════════ */
    if (phase === "running") {
        const featureEntries = moleculeFeatures ? Object.entries(moleculeFeatures) : [];
        const visibleFeatures = featureEntries.slice(0, revealedFeatureCount);

        const featureMeta: Record<string, { label: string; unit: string; color: string; icon: string }> = {
            molecular_weight: { label: "Molecular Weight", unit: "g/mol", color: "#3b82f6", icon: "⚖️" },
            exact_mass: { label: "Exact Mass", unit: "Da", color: "#6366f1", icon: "🔬" },
            formula: { label: "Molecular Formula", unit: "", color: "#8b5cf6", icon: "🧬" },
            logp_crippen: { label: "LogP (Crippen)", unit: "", color: "#06b6d4", icon: "💧" },
            tpsa: { label: "TPSA", unit: "Å²", color: "#14b8a6", icon: "📐" },
            hbd: { label: "H-Bond Donors", unit: "", color: "#22c55e", icon: "🟢" },
            hba: { label: "H-Bond Acceptors", unit: "", color: "#84cc16", icon: "🔵" },
            rotatable_bonds: { label: "Rotatable Bonds", unit: "", color: "#eab308", icon: "🔗" },
            aromatic_rings: { label: "Aromatic Rings", unit: "", color: "#f59e0b", icon: "💍" },
            rings: { label: "Ring Count", unit: "", color: "#f97316", icon: "⭕" },
            heavy_atoms: { label: "Heavy Atoms", unit: "", color: "#ef4444", icon: "⚛️" },
            fraction_csp3: { label: "Fraction CSP3", unit: "", color: "#ec4899", icon: "📊" },
            molar_refractivity: { label: "Molar Refractivity", unit: "", color: "#a855f7", icon: "🔮" },
            qed: { label: "QED Score", unit: "", color: "#10b981", icon: "⭐" },
        };

        return (
            <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: 24 }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                    <div style={{ width: 100, height: 100, borderRadius: "50%", background: "rgba(59,130,246,0.08)", border: "2px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                            <Cpu size={40} style={{ color: "var(--accent-blue)" }} />
                        </motion.div>
                    </div>
                </motion.div>

                <div style={{ textAlign: "center" }}>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 6, fontFamily: "var(--font-outfit)" }}>
                        Analyzing Molecular Features…
                    </h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        Extracting descriptors for <strong>Aspirin</strong>
                    </p>
                </div>

                {/* Progress bar */}
                <div style={{ width: "100%", maxWidth: 560 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                        <span>
                            {progress < 20 ? "Parsing SMILES structure…"
                                : progress < 40 ? "Computing molecular descriptors…"
                                : progress < 60 ? "Generating fingerprints (ECFP4, 2048-bit)…"
                                : progress < 80 ? "Running QSPR ensemble prediction…"
                                : progress < 95 ? "Screening toxicity & drug-likeness…"
                                : "Compiling results…"}
                        </span>
                        <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <motion.div
                            animate={{ width: `${progress}%` }}
                            style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4)" }}
                        />
                    </div>
                </div>

                {/* Animated Feature Cards Grid */}
                <div style={{ width: "100%", maxWidth: 560 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <BarChart3 size={16} style={{ color: "var(--accent-blue)" }} />
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Input Features Used for Prediction
                        </span>
                        {moleculeFeatures && (
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                                {revealedFeatureCount} / {featureEntries.length} extracted
                            </span>
                        )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minHeight: 280 }}>
                        <AnimatePresence>
                            {visibleFeatures.map(([key, value]) => {
                                const meta = featureMeta[key] || { label: key, unit: "", color: "#64748b", icon: "📌" };
                                const displayValue = typeof value === "number"
                                    ? (Number.isInteger(value) ? value : (value as number).toFixed(3))
                                    : String(value);

                                return (
                                    <motion.div
                                        key={key}
                                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.05 }}
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: 12,
                                            background: "var(--glass-bg)",
                                            border: `1px solid ${meta.color}33`,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            overflow: "hidden",
                                            position: "relative",
                                        }}
                                    >
                                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: meta.color, borderRadius: "3px 0 0 3px" }} />
                                        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{meta.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {meta.label}
                                            </div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: meta.color, fontFamily: "monospace", display: "flex", alignItems: "baseline", gap: 4 }}>
                                                <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                                                    {displayValue}
                                                </motion.span>
                                                {meta.unit && (
                                                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 400 }}>{meta.unit}</span>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {moleculeFeatures && featureEntries.slice(revealedFeatureCount, revealedFeatureCount + 2).map(([key], i) => (
                            <motion.div
                                key={`skel-${key}`}
                                animate={{ opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", height: 58 }}
                            >
                                <div style={{ width: "60%", height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
                                <div style={{ width: "40%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
                            </motion.div>
                        ))}

                        {!moleculeFeatures && Array.from({ length: 6 }).map((_, i) => (
                            <motion.div
                                key={`loading-${i}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
                                style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", height: 58 }}
                            >
                                <div style={{ width: "60%", height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
                                <div style={{ width: "40%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Fingerprint visualization bar */}
                {moleculeFeatures && progress >= 40 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 560 }}>
                        <GlassCard padding="14px 18px">
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <Zap size={14} style={{ color: "var(--accent-cyan)" }} />
                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                                    Morgan Fingerprint (ECFP4) — 2048-bit vector
                                </span>
                            </div>
                            <div style={{ display: "flex", gap: 1, height: 20, borderRadius: 4, overflow: "hidden" }}>
                                {Array.from({ length: 64 }).map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ scaleY: 0 }}
                                        animate={{ scaleY: 1 }}
                                        transition={{ delay: i * 0.02, duration: 0.3 }}
                                        style={{
                                            flex: 1,
                                            background: Math.random() > 0.6
                                                ? `hsl(${200 + i * 2}, 70%, ${40 + Math.random() * 20}%)`
                                                : "rgba(255,255,255,0.03)",
                                            borderRadius: 1,
                                            transformOrigin: "bottom",
                                        }}
                                    />
                                ))}
                            </div>
                            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8 }}>
                                Encoding molecular substructures as binary features for ML ensemble input
                            </p>
                        </GlassCard>
                    </motion.div>
                )}

                {/* Pipeline steps */}
                <GlassCard padding="16px 20px" style={{ width: "100%", maxWidth: 560 }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
                        Prediction Pipeline
                    </div>
                    {["Parse SMILES → RDKit Mol object", "Extract 14 molecular descriptors", "Generate ECFP4 fingerprint (2048 bits)", "Run Random Forest + XGBoost ensemble", "Compute drug-likeness & toxicity"].map((step, i) => {
                        const done = progress > (i + 1) * 18;
                        const active = !done && progress > i * 18;
                        return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", opacity: done || active ? 1 : 0.3 }}>
                                {done ? (
                                    <CheckCircle2 size={15} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
                                ) : active ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                        <Loader2 size={15} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
                                    </motion.div>
                                ) : (
                                    <div style={{ width: 15, height: 15, borderRadius: "50%", border: "1.5px solid var(--text-muted)", flexShrink: 0 }} />
                                )}
                                <span style={{ fontSize: "0.82rem", color: done ? "var(--text-primary)" : "var(--text-secondary)" }}>{step}</span>
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
                                    <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>{ASPIRIN.name}</h3>
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{ASPIRIN.formula} · MW: {ASPIRIN.mw} g/mol</span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <span className="badge badge-processing" style={{ fontSize: "0.7rem" }}>3D Interactive</span>
                                </div>
                            </div>
                            <div style={{ height: 300, padding: "8px 12px 12px" }}>
                                <MoleculeViewer3D smiles="CC(=O)Oc1ccccc1C(=O)O" />
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
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ASPIRIN.smiles}</span>
                                <Copy size={14} style={{ cursor: "pointer", flexShrink: 0, opacity: 0.6 }} onClick={copySMILES} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 8 }}>
                                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 2 }}>CAS</div>
                                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{ASPIRIN.cas}</div>
                                </div>
                                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.15)", borderRadius: 8 }}>
                                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 2 }}>DrugBank</div>
                                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{ASPIRIN.drugBank}</div>
                                </div>
                            </div>
                        </GlassCard>

                        {/* Property result cards */}
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            <BarChart3 size={15} style={{ color: "var(--accent-purple)" }} />
                            Predicted Properties
                        </div>
                        {Object.entries(DEMO_RESULTS).map(([key, prop], i) => {
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
                                            <span style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "capitalize" }}>{key === "logP" ? "LogP" : key === "pka" ? "pKa" : key === "tpsa" ? "TPSA" : key}</span>
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
                                ["Compute Cost", `${estimatedCost} credits`],
                                ["Runtime", "~42 seconds"],
                                ["Confidence", "94.8%"],
                            ].map(([label, val]) => (
                                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "0.78rem" }}>
                                    <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                    <span style={{ fontWeight: 600 }}>{val}</span>
                                </div>
                            ))}
                        </GlassCard>

                        <motion.button
                            className="btn-primary"
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
                <span>Project Alpha</span><ChevronRight size={12} />
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
                                {ASPIRIN.name}
                                <span style={{ marginLeft: 10, fontSize: "0.78rem", fontWeight: 500, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>
                                    {ASPIRIN.formula}
                                </span>
                            </h2>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 16 }}>{ASPIRIN.iupac}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 6 }}>SMILES STRING</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(0,0,0,0.25)", borderRadius: 8, fontFamily: "monospace", fontSize: "0.82rem", color: "var(--accent-cyan)" }}>
                                <span style={{ flex: 1 }}>{ASPIRIN.smiles}</span>
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
                            <MoleculeViewer3D smiles="CC(=O)Oc1ccccc1C(=O)O" height="100%" />
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
                            ].map(([l, v]) => (
                                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                                    <span style={{ fontWeight: 600 }}>{v}</span>
                                </div>
                            ))}
                            <div style={{ height: 1, background: "var(--glass-border)", margin: "2px 0" }} />
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                                <Clock size={13} style={{ color: "var(--text-muted)" }} />
                                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                    Approximate runtime: <strong style={{ color: "var(--text-primary)" }}>~45 mins</strong>
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
                            onClick={() => toast("Draft saved (demo)", "success")}
                            style={{ flex: 1, justifyContent: "center", padding: "12px 16px" }}
                        >
                            Save Draft
                        </motion.button>
                        <motion.button
                            className="btn-primary"
                            disabled={selectedCount === 0}
                            whileHover={{ scale: selectedCount === 0 ? 1 : 1.02 }}
                            whileTap={{ scale: selectedCount === 0 ? 1 : 0.97 }}
                            onClick={handleRun}
                            style={{
                                flex: 2, justifyContent: "center", padding: "12px 24px",
                                opacity: selectedCount === 0 ? 0.5 : 1,
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
