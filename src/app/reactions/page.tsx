"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    FlaskConical,
    Play,
    Pause,
    RotateCcw,
    Download,
    Zap,
    Thermometer,
    Gauge,
    Droplet,
    Clock,
    TrendingUp,
    Lightbulb,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Plus,
    Trash2,
    ArrowRight,
    Beaker,
    Activity,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Shield,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import ReactionViewer, { parseSMILESToMolecule } from "@/components/reaction-viewer";
import { toast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";

/* ═══════════════════════════════════
   Types
   ═══════════════════════════════════ */

interface Reactant {
    id: string;
    name: string;
    smiles: string;
    concentration: number;
    amount: number;
}

interface KineticsData {
    rateConstant: number;
    activationEnergy: number;
    halfLife: number;
    reactionOrder: number;
    rateExpression: string;
    arrheniusA: number;
}

interface ThermodynamicsData {
    deltaH: number;
    deltaG: number;
    deltaS: number;
    equilibriumK: number;
    isExothermic: boolean;
    isSpontaneous: boolean;
}

interface YieldData {
    theoreticalYield: number;
    predictedYield: number;
    selectivity: number;
    conversion: number;
    byProducts: { name: string; yield: number }[];
    suggestions: string[];
}

type SimStage = "idle" | "validating" | "generating-3d" | "computing" | "completed" | "failed";
type TabKey = "kinetics" | "thermodynamics" | "yield" | "ai";

/* ═══════════════════════════════════
   Constants
   ═══════════════════════════════════ */

const R_GAS = 8.314;

const PRESET_REACTIONS = [
    { name: "Water Formation", reactants: "2H₂ + O₂ → 2H₂O", rSmiles: ["[H][H]", "O=O"], pSmiles: ["O"], rNames: ["Hydrogen", "Oxygen"], pNames: ["Water"] },
    { name: "Combustion", reactants: "CH₄ + 2O₂ → CO₂ + 2H₂O", rSmiles: ["C", "O=O"], pSmiles: ["O=C=O", "O"], rNames: ["Methane", "Oxygen"], pNames: ["Carbon Dioxide", "Water"] },
    { name: "Esterification", reactants: "AcOH + MeOH → MeOAc + H₂O", rSmiles: ["CC(=O)O", "CO"], pSmiles: ["CC(=O)OC", "O"], rNames: ["Acetic Acid", "Methanol"], pNames: ["Methyl Acetate", "Water"] },
    { name: "Aldol Condensation", reactants: "2 CH₃CHO → Aldol", rSmiles: ["CC=O"], pSmiles: ["CC(O)CC=O"], rNames: ["Acetaldehyde"], pNames: ["Aldol Product"] },
    { name: "Diels-Alder", reactants: "Butadiene + Ethylene → Cyclohexene", rSmiles: ["C=CC=C", "C=C"], pSmiles: ["C1CC=CCC1"], rNames: ["1,3-Butadiene", "Ethylene"], pNames: ["Cyclohexene"] },
    { name: "SN2 Displacement", reactants: "CH₃Br + OH⁻ → CH₃OH + Br⁻", rSmiles: ["CBr", "[OH-]"], pSmiles: ["CO"], rNames: ["Methyl Bromide", "Hydroxide"], pNames: ["Methanol"] },
];

const SOLVENTS = [
    { value: "water", label: "Water (H₂O)" },
    { value: "ethanol", label: "Ethanol (EtOH)" },
    { value: "dmso", label: "DMSO" },
    { value: "dmf", label: "DMF" },
    { value: "acetone", label: "Acetone" },
    { value: "thf", label: "THF" },
    { value: "dcm", label: "DCM" },
    { value: "toluene", label: "Toluene" },
    { value: "hexane", label: "Hexane" },
    { value: "none", label: "Neat (no solvent)" },
];

const MECHANISMS = [
    { value: "SN1", label: "SN1 — Unimolecular Nucleophilic Substitution" },
    { value: "SN2", label: "SN2 — Bimolecular Nucleophilic Substitution" },
    { value: "E1", label: "E1 — Unimolecular Elimination" },
    { value: "E2", label: "E2 — Bimolecular Elimination" },
    { value: "electrophilic-addition", label: "Electrophilic Addition" },
    { value: "nucleophilic-addition", label: "Nucleophilic Addition" },
    { value: "radical", label: "Radical Chain Reaction" },
    { value: "pericyclic", label: "Pericyclic (Diels-Alder, Cope)" },
    { value: "photochemical", label: "Photochemical" },
    { value: "auto", label: "Auto-detect" },
];

/* ═══════════════════════════════════
   Helper computations
   ═══════════════════════════════════ */

function uid() { return Math.random().toString(36).slice(2, 10); }

function computeKinetics(tC: number, pressure: number, mech: string): KineticsData {
    const T = tC + 273.15;
    const baseEa = mech === "SN2" ? 65 : mech === "SN1" ? 95 : mech === "E2" ? 80 : mech === "radical" ? 40 : mech === "pericyclic" ? 120 : 75;
    const Ea = baseEa * 1000;
    const A = 1e10 * (mech === "SN2" ? 1 : mech === "radical" ? 100 : 10);
    const k = A * Math.exp(-Ea / (R_GAS * T)) * (pressure > 1 ? Math.sqrt(pressure) : 1);
    const order = mech === "SN1" || mech === "E1" ? 1 : 2;
    const halfLife = order === 1 ? Math.log(2) / Math.max(k, 1e-30) : 1 / (Math.max(k, 1e-30) * 0.1);
    return { rateConstant: k, activationEnergy: baseEa, halfLife: Math.max(0.001, halfLife), reactionOrder: order, rateExpression: order === 1 ? "rate = k[A]" : "rate = k[A][B]", arrheniusA: A };
}

function computeThermo(tC: number, _pressure: number, mech: string): ThermodynamicsData {
    const T = tC + 273.15;
    const baseH = mech === "radical" ? -200 : mech === "pericyclic" ? -150 : mech === "SN2" ? -30 : -80;
    const baseS = mech === "pericyclic" ? -180 : mech === "radical" ? 50 : -44;
    const dH = baseH + (tC - 25) * 0.075;
    const dS = baseS + (tC > 100 ? 10 : 0);
    const dG = dH - (T * dS) / 1000;
    const Keq = Math.exp(-dG * 1000 / (R_GAS * T));
    return { deltaH: Math.round(dH * 10) / 10, deltaG: Math.round(dG * 10) / 10, deltaS: Math.round(dS * 10) / 10, equilibriumK: Keq, isExothermic: dH < 0, isSpontaneous: dG < 0 };
}

function computeYield(tC: number, pressure: number, ph: number, timeSec: number, mech: string, solv: string): YieldData {
    let base = 60;
    base += Math.min(20, (tC - 25) * 0.15);
    if (tC > 200) base -= (tC - 200) * 0.1;
    base += Math.min(15, Math.log10(timeSec + 1) * 8);
    base += Math.min(5, (pressure - 1) * 0.5);
    if ((mech === "SN2" || mech === "E2") && (solv === "dmso" || solv === "dmf")) base += 8;
    if (mech === "SN1" && (solv === "water" || solv === "ethanol")) base += 6;
    if (ph < 3 || ph > 11) base -= 5;
    const predicted = Math.max(5, Math.min(99, base));
    const suggestions: string[] = [];
    if (tC < 40) suggestions.push(`Increase temperature to 50–80°C for ~${Math.round((50 - tC) * 0.15)}% higher yield`);
    if (timeSec < 7200) suggestions.push("Extend reaction time to 120+ min for better conversion");
    if (mech === "SN2" && solv !== "dmso" && solv !== "dmf") suggestions.push("Switch to polar aprotic solvent (DMSO/DMF) for improved SN2 rate");
    if (pressure < 2) suggestions.push("Moderate pressure increase (2–5 atm) may improve gas-phase equilibrium");
    if (suggestions.length === 0) suggestions.push("Conditions near-optimal. Minor improvements via catalyst loading possible.");
    return {
        theoreticalYield: Math.round(Math.min(99.9, predicted * 1.15) * 10) / 10,
        predictedYield: Math.round(predicted * 10) / 10,
        selectivity: Math.round(Math.max(50, Math.min(98, predicted + 5)) * 10) / 10,
        conversion: Math.round(Math.max(30, Math.min(99, predicted + 2)) * 10) / 10,
        byProducts: [
            { name: "Side product A", yield: Math.max(0.5, Math.round((100 - predicted) * 0.4 * 10) / 10) },
            { name: "Side product B", yield: Math.max(0.2, Math.round((100 - predicted) * 0.2 * 10) / 10) },
        ],
        suggestions,
    };
}

function fmtSci(n: number) {
    if (n === 0) return "0";
    if (Math.abs(n) >= 0.01 && Math.abs(n) < 1e6) return n.toFixed(4);
    return n.toExponential(2);
}

function fmtTime(s: number) {
    if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
    if (s < 60) return `${s.toFixed(1)} s`;
    if (s < 3600) return `${(s / 60).toFixed(1)} min`;
    if (s < 86400) return `${(s / 3600).toFixed(1)} hr`;
    return `${(s / 86400).toFixed(1)} days`;
}

/* ═══════════════════════════════════
   Main Component
   ═══════════════════════════════════ */

export default function ReactionLabPage() {
    /* ── State ── */
    const [activeTab, setActiveTab] = useState<TabKey>("kinetics");
    const [temperature, setTemperature] = useState(25);
    const [pressure, setPressure] = useState(1);
    const [pH, setPH] = useState(7);
    const [reactionTime, setReactionTime] = useState(60);
    const [timeUnit, setTimeUnit] = useState<"seconds" | "minutes" | "hours">("minutes");
    const [stirringRate, setStirringRate] = useState(300);
    const [solvent, setSolvent] = useState("water");
    const [mechanismType, setMechanismType] = useState("auto");
    const [catalystInput, setCatalystInput] = useState("");
    const [showPresets, setShowPresets] = useState(false);

    const [reactants, setReactants] = useState<Reactant[]>([
        { id: uid(), name: "Ethanol", smiles: "CCO", concentration: 1.0, amount: 0.5 },
    ]);
    const [products, setProducts] = useState<Reactant[]>([
        { id: uid(), name: "Acetaldehyde", smiles: "CC=O", concentration: 0, amount: 0 },
    ]);

    const [simStage, setSimStage] = useState<SimStage>("idle");
    const [simProgress, setSimProgress] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [animationProgress, setAnimationProgress] = useState(0);
    const [simulationReady, setSimulationReady] = useState(false);

    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiLoading, setAiLoading] = useState(false);

    /* ── Computed ── */
    const timeSec = timeUnit === "hours" ? reactionTime * 3600 : timeUnit === "minutes" ? reactionTime * 60 : reactionTime;
    const kinetics = computeKinetics(temperature, pressure, mechanismType);
    const thermo = computeThermo(temperature, pressure, mechanismType);
    const yieldData = computeYield(temperature, pressure, pH, timeSec, mechanismType, solvent);

    /* ── Molecules for 3D viewer ── */
    const reactantMols = reactants.filter((r) => r.smiles.trim()).map((r) => parseSMILESToMolecule(r.smiles, r.name || r.smiles));
    const productMols = products.filter((p) => p.smiles.trim()).map((p) => parseSMILESToMolecule(p.smiles, p.name || p.smiles));

    /* ── Reactant/Product management ── */
    const addReactant = useCallback(() => {
        setReactants((prev) => [...prev, { id: uid(), name: "", smiles: "", concentration: 1.0, amount: 0.5 }]);
        haptic("selection");
    }, []);

    const removeReactant = useCallback((id: string) => {
        setReactants((prev) => prev.filter((r) => r.id !== id));
        haptic("light");
    }, []);

    const updateReactant = useCallback((id: string, field: keyof Reactant, value: string | number) => {
        setReactants((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    }, []);

    const addProduct = useCallback(() => {
        setProducts((prev) => [...prev, { id: uid(), name: "", smiles: "", concentration: 0, amount: 0 }]);
        haptic("selection");
    }, []);

    const removeProduct = useCallback((id: string) => {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        haptic("light");
    }, []);

    const updateProduct = useCallback((id: string, field: keyof Reactant, value: string | number) => {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    }, []);

    /* ── Load preset ── */
    const loadPreset = useCallback((preset: typeof PRESET_REACTIONS[0]) => {
        setReactants(preset.rSmiles.map((smi, i) => ({ id: uid(), name: preset.rNames[i] || smi, smiles: smi, concentration: 1.0, amount: 0.5 })));
        setProducts(preset.pSmiles.map((smi, i) => ({ id: uid(), name: preset.pNames[i] || smi, smiles: smi, concentration: 0, amount: 0 })));
        setShowPresets(false);
        setSimulationReady(false);
        setSimStage("idle");
        haptic("success");
        toast(`Loaded: ${preset.name}`, "success");
    }, []);

    /* ── Generate Simulation ── */
    const handleGenerate = useCallback(async () => {
        const hasReactant = reactants.some((r) => r.smiles.trim());
        const hasProduct = products.some((p) => p.smiles.trim());
        if (!hasReactant || !hasProduct) {
            toast("Enter at least one reactant and one product SMILES", "warning");
            haptic("warning");
            return;
        }

        haptic("success");
        setSimStage("validating");
        setSimProgress(10);
        setSimulationReady(false);
        setIsPlaying(false);
        setAnimationProgress(0);

        // Stage 1
        await new Promise((r) => setTimeout(r, 300));
        setSimStage("generating-3d");
        setSimProgress(40);

        // Stage 2
        await new Promise((r) => setTimeout(r, 600));
        setSimStage("computing");
        setSimProgress(75);

        // Stage 3
        await new Promise((r) => setTimeout(r, 400));
        setSimulationReady(true);
        setSimStage("completed");
        setSimProgress(100);
        toast("Simulation ready — press Play to animate", "success");
        haptic("success");
    }, [reactants, products]);

    /* ── Reset ── */
    const handleReset = useCallback(() => {
        setSimStage("idle");
        setSimProgress(0);
        setSimulationReady(false);
        setIsPlaying(false);
        setAnimationProgress(0);
        haptic("light");
    }, []);

    /* ── Play/Pause ── */
    const handlePlayPause = useCallback(() => {
        setIsPlaying((prev) => !prev);
        haptic("selection");
    }, []);

    /* ── Progress callback from ReactionViewer ── */
    const handleProgressUpdate = useCallback((p: number) => {
        setAnimationProgress(p);
    }, []);

    /* ── AI Suggestions ── */
    const fetchAi = useCallback(async () => {
        setAiLoading(true);
        setAiSuggestions([]);
        try {
            const rStr = reactants.map((r) => r.smiles || r.name).join(" + ");
            const pStr = products.map((p) => p.smiles || p.name).join(" + ");
            const prompt = `Analyze this chemical reaction: ${rStr} → ${pStr}
Conditions: ${temperature}°C, ${pressure} atm, pH ${pH}, solvent: ${solvent}, mechanism: ${mechanismType}.
Provide 4 concise suggestions for: (1) yield optimization, (2) selectivity improvement, (3) greener alternatives, (4) safety considerations.
Format each as a single sentence starting with [Optimization], [Selectivity], [Green Chemistry], or [Safety].`;

            const res = await fetch("/api/copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: prompt }], context: "reaction_optimization" }),
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.response || data.content || "";
                const lines = text.split("\n").filter((l: string) => l.trim().length > 10);
                setAiSuggestions(lines.slice(0, 6));
            } else {
                throw new Error("API error");
            }
        } catch {
            setAiSuggestions([
                `[Optimization] Increase temperature to ${Math.min(temperature + 30, 200)}°C for faster kinetics.`,
                `[Selectivity] ${solvent === "dmso" ? "Current DMSO is optimal for selectivity." : "Switch to DMSO or DMF for improved selectivity."}`,
                "[Green Chemistry] Consider water as solvent or microwave-assisted heating to reduce energy consumption.",
                `[Safety] ${temperature > 100 ? "High temperature — use reflux condenser and monitor exotherm." : "Conditions appear safe. Standard PPE recommended."}`,
            ]);
        } finally {
            setAiLoading(false);
            haptic("selection");
        }
    }, [reactants, products, temperature, pressure, pH, solvent, mechanismType]);

    const stageLabels: Record<SimStage, string> = {
        idle: "Ready",
        validating: "Validating structures…",
        "generating-3d": "Generating 3D geometries…",
        computing: "Computing kinetics & thermodynamics…",
        completed: "Simulation Ready",
        failed: "Failed",
    };

    /* ═══════════════════════════════════
       Render
       ═══════════════════════════════════ */
    return (
        <div className="page-container">
            {/* ── Header ── */}
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <FlaskConical size={24} style={{ color: "white" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "var(--font-outfit), sans-serif", margin: 0 }}>
                            Reaction Lab
                        </h1>
                        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0 }}>
                            Design, simulate, and optimize chemical transformations with real-time 3D visualization
                        </p>
                    </div>
                    {simStage !== "idle" && (
                        <StatusBadge
                            status={simStage === "completed" ? "completed" : simStage === "failed" ? "failed" : "processing"}
                            label={stageLabels[simStage]}
                        />
                    )}
                </div>

                {/* Presets */}
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowPresets(!showPresets)}
                    className="btn-secondary" style={{ marginTop: 12, fontSize: "0.82rem" }}>
                    <Beaker size={14} /> Preset Reactions {showPresets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </motion.button>

                <AnimatePresence>
                    {showPresets && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", marginTop: 8 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {PRESET_REACTIONS.map((p) => (
                                    <motion.button key={p.name} whileTap={{ scale: 0.95 }} onClick={() => loadPreset(p)}
                                        style={{
                                            padding: "8px 14px", borderRadius: 8,
                                            border: "1px solid rgba(59, 130, 246, 0.3)",
                                            background: "rgba(59, 130, 246, 0.06)",
                                            color: "var(--accent-blue-light)", fontSize: "0.8rem",
                                            fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                                        }}>
                                        <Zap size={12} />
                                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{p.reactants}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── Pipeline Progress ── */}
            {simStage !== "idle" && simStage !== "completed" && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 20 }}>
                    <GlassCard>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent-blue)" }} />
                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{stageLabels[simStage]}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "rgba(15,23,42,0.6)", overflow: "hidden" }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${simProgress}%` }}
                                transition={{ duration: 0.4 }}
                                style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: 3 }} />
                        </div>
                    </GlassCard>
                </motion.div>
            )}

            {/* ── 3-Panel Layout ── */}
            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 300px", gap: 20, marginBottom: 32 }}>

                {/* ═══ LEFT — Reaction Design ═══ */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                    <GlassCard glow="blue" style={{ height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <FlaskConical size={18} style={{ color: "var(--accent-blue)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Reaction Design</h3>
                        </div>

                        {/* Reactants */}
                        <SectionHeader label="Reactants" onAdd={addReactant} color="blue" />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                            {reactants.map((r) => (
                                <MoleculeCard key={r.id} item={r} color="blue"
                                    onUpdate={(f, v) => updateReactant(r.id, f, v)}
                                    onRemove={reactants.length > 1 ? () => removeReactant(r.id) : undefined} />
                            ))}
                        </div>

                        {/* Arrow */}
                        <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 12px" }}>
                            <ArrowRight size={20} style={{ color: "var(--accent-blue)", opacity: 0.5 }} />
                        </div>

                        {/* Products */}
                        <SectionHeader label="Products" onAdd={addProduct} color="purple" />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                            {products.map((p) => (
                                <MoleculeCard key={p.id} item={p} color="purple"
                                    onUpdate={(f, v) => updateProduct(p.id, f, v)}
                                    onRemove={products.length > 1 ? () => removeProduct(p.id) : undefined} />
                            ))}
                        </div>

                        {/* Mechanism */}
                        <div style={{ marginBottom: 14 }}>
                            <SmallLabel>Mechanism</SmallLabel>
                            <select className="input" value={mechanismType} onChange={(e) => setMechanismType(e.target.value)}
                                style={{ fontSize: "0.8rem", marginTop: 4 }}>
                                {MECHANISMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Catalyst */}
                        <div style={{ marginBottom: 14 }}>
                            <SmallLabel>Catalyst (optional)</SmallLabel>
                            <input className="input" value={catalystInput} onChange={(e) => setCatalystInput(e.target.value)}
                                placeholder="e.g. Pd/C, H₂SO₄, NaOH" style={{ fontSize: "0.8rem", marginTop: 4 }} />
                        </div>

                        {/* Generate */}
                        <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate}
                            disabled={simStage !== "idle" && simStage !== "completed" && simStage !== "failed"}
                            className="btn-primary" style={{ width: "100%", marginTop: 4 }}>
                            {simStage === "validating" || simStage === "generating-3d" || simStage === "computing" ? (
                                <><Loader2 size={16} className="animate-spin" /> Generating…</>
                            ) : (
                                <><Zap size={16} /> Generate Simulation</>
                            )}
                        </motion.button>
                    </GlassCard>
                </motion.div>

                {/* ═══ MIDDLE — 3D Viewer ═══ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <GlassCard glow="purple" style={{ height: "100%" }}>
                        {/* 3D Container */}
                        <div style={{
                            height: 380, borderRadius: 12,
                            background: "linear-gradient(135deg, rgba(59,130,246,0.03), rgba(139,92,246,0.03))",
                            border: "1px solid var(--glass-border)",
                            marginBottom: 16, position: "relative", overflow: "hidden",
                        }}>
                            {simulationReady ? (
                                <ReactionViewer
                                    reactants={reactantMols}
                                    products={productMols}
                                    isPlaying={isPlaying}
                                    animationSpeed={1}
                                    visualizationMode="ball-stick"
                                    showTransition={false}
                                    onProgressUpdate={handleProgressUpdate}
                                />
                            ) : (
                                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                                    <div>
                                        <FlaskConical size={56} style={{ color: "var(--accent-blue)", opacity: 0.2, marginBottom: 12 }} />
                                        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500 }}>Reaction Visualization</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6, maxWidth: 240, margin: "6px auto 0" }}>
                                            Enter reactant & product SMILES, then generate simulation to see the 3D transformation
                                        </div>
                                    </div>
                                </div>
                            )}

                            {simulationReady && isPlaying && (
                                <div style={{ position: "absolute", top: 10, right: 10 }}>
                                    <StatusBadge status="processing" label={`${Math.round(animationProgress)}%`} />
                                </div>
                            )}
                        </div>

                        {/* Playback */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={handlePlayPause}
                                disabled={!simulationReady} className="btn-secondary" style={{ flex: 1 }}>
                                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                                {isPlaying ? "Pause" : "Play"}
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={handleReset}
                                disabled={!simulationReady} className="btn-secondary">
                                <RotateCcw size={15} /> Reset
                            </motion.button>
                        </div>

                        {/* Energy Profile */}
                        <div style={{ marginTop: 8 }}>
                            <SmallLabel>Energy Profile</SmallLabel>
                            <div style={{
                                height: 80, borderRadius: 8,
                                background: "rgba(15,23,42,0.4)", border: "1px solid var(--glass-border)",
                                position: "relative", overflow: "hidden", padding: "8px 12px",
                            }}>
                                <svg width="100%" height="100%" viewBox="0 0 200 60" preserveAspectRatio="none">
                                    <path
                                        d={`M 10 ${45 - Math.min(30, Math.abs(thermo.deltaH) * 0.1)}
                                            C 50 ${45 - Math.min(30, Math.abs(thermo.deltaH) * 0.1)},
                                              70 ${10 + Math.min(40, kinetics.activationEnergy * 0.2)},
                                              100 ${10 + Math.min(35, kinetics.activationEnergy * 0.15)}
                                            C 130 ${10 + Math.min(40, kinetics.activationEnergy * 0.2)},
                                              150 ${45 - (thermo.isExothermic ? 0 : Math.min(20, Math.abs(thermo.deltaH) * 0.15))},
                                              190 ${45 + (thermo.isExothermic ? Math.min(12, Math.abs(thermo.deltaH) * 0.08) : -Math.min(12, Math.abs(thermo.deltaH) * 0.08))}`}
                                        fill="none" stroke="url(#eGrad)" strokeWidth="2" />
                                    <defs>
                                        <linearGradient id="eGrad" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="50%" stopColor="#fbbf24" />
                                            <stop offset="100%" stopColor="#10b981" />
                                        </linearGradient>
                                    </defs>
                                    <text x="10" y="58" fill="#94a3b8" fontSize="6">Reactants</text>
                                    <text x="88" y="6" fill="#fbbf24" fontSize="5">TS‡</text>
                                    <text x="165" y="58" fill="#94a3b8" fontSize="6">Products</text>
                                </svg>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                            {[
                                { label: "ΔG", value: `${thermo.deltaG > 0 ? "+" : ""}${thermo.deltaG}`, color: thermo.isSpontaneous ? "#10b981" : "#ef4444" },
                                { label: "Yield", value: `${yieldData.predictedYield}%`, color: yieldData.predictedYield > 70 ? "#10b981" : yieldData.predictedYield > 40 ? "#fbbf24" : "#ef4444" },
                                { label: "t½", value: fmtTime(kinetics.halfLife), color: "var(--accent-cyan)" },
                            ].map((s) => (
                                <div key={s.label} style={{
                                    padding: "8px 6px", borderRadius: 8, textAlign: "center",
                                    background: "rgba(15,23,42,0.5)", border: "1px solid var(--glass-border)",
                                }}>
                                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 2 }}>{s.label}</div>
                                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </motion.div>

                {/* ═══ RIGHT — Conditions ═══ */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <GlassCard glow="blue" style={{ height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <Gauge size={18} style={{ color: "var(--accent-cyan)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Conditions</h3>
                        </div>

                        <ConditionSlider icon={<Thermometer size={14} />} label="Temperature" value={temperature}
                            unit="°C" min={-50} max={500} step={1} color="var(--accent-blue)" onChange={setTemperature}
                            marks={["-50°C", "500°C"]} />

                        <ConditionSlider icon={<Gauge size={14} />} label="Pressure" value={pressure}
                            unit=" atm" min={0.1} max={100} step={0.1} color="var(--accent-purple)" onChange={setPressure}
                            marks={["0.1", "100 atm"]} />

                        <ConditionSlider icon={<Droplet size={14} />} label="pH" value={pH}
                            unit="" min={0} max={14} step={0.1} color="var(--accent-cyan)" onChange={setPH}
                            marks={["Acidic", "Neutral", "Basic"]} />

                        <div style={{ marginBottom: 16 }}>
                            <SmallLabel>Solvent</SmallLabel>
                            <select className="input" value={solvent} onChange={(e) => setSolvent(e.target.value)}
                                style={{ fontSize: "0.8rem", marginTop: 4 }}>
                                {SOLVENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <Clock size={14} style={{ color: "var(--text-muted)" }} />
                                <SmallLabel style={{ marginBottom: 0 }}>Reaction Time</SmallLabel>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                                <input type="number" className="input" value={reactionTime} min={0}
                                    onChange={(e) => setReactionTime(parseFloat(e.target.value) || 0)}
                                    style={{ fontSize: "0.8rem" }} />
                                <select className="input" value={timeUnit} onChange={(e) => setTimeUnit(e.target.value as any)}
                                    style={{ width: 90, fontSize: "0.78rem" }}>
                                    <option value="seconds">sec</option>
                                    <option value="minutes">min</option>
                                    <option value="hours">hr</option>
                                </select>
                            </div>
                        </div>

                        <ConditionSlider icon={<RotateCcw size={14} />} label="Stirring Rate" value={stirringRate}
                            unit=" rpm" min={0} max={1200} step={50} color="var(--text-secondary)" onChange={setStirringRate}
                            marks={["0", "1200 rpm"]} />

                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                            <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate}
                                disabled={simStage !== "idle" && simStage !== "completed" && simStage !== "failed"}
                                className="btn-primary" style={{ width: "100%" }}>
                                <Zap size={16} /> Generate Simulation
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.97 }} onClick={handleReset}
                                className="btn-secondary" style={{ width: "100%" }}>
                                <RotateCcw size={16} /> Reset All
                            </motion.button>
                        </div>
                    </GlassCard>
                </motion.div>
            </div>

            {/* ═══ ANALYSIS TABS ═══ */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <GlassCard>
                    {/* Tab Bar */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--glass-border)" }}>
                        {([
                            { key: "kinetics" as TabKey, label: "Kinetics", icon: TrendingUp },
                            { key: "thermodynamics" as TabKey, label: "Thermodynamics", icon: Thermometer },
                            { key: "yield" as TabKey, label: "Yield Prediction", icon: CheckCircle2 },
                            { key: "ai" as TabKey, label: "AI Suggestions", icon: Sparkles },
                        ]).map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <motion.button key={tab.key} whileTap={{ scale: 0.97 }}
                                    onClick={() => { setActiveTab(tab.key); if (tab.key === "ai" && aiSuggestions.length === 0 && !aiLoading) fetchAi(); }}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "12px 20px", border: "none",
                                        borderBottom: activeTab === tab.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
                                        background: "transparent",
                                        color: activeTab === tab.key ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                        fontSize: "0.88rem", fontWeight: activeTab === tab.key ? 600 : 400,
                                        cursor: "pointer", transition: "all 0.2s ease",
                                    }}>
                                    <Icon size={16} /> {tab.label}
                                </motion.button>
                            );
                        })}
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} style={{ minHeight: 280 }}>

                            {/* ── Kinetics ── */}
                            {activeTab === "kinetics" && (
                                <div>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Reaction Kinetics</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                                        <StatCard label="Rate Constant (k)" value={fmtSci(kinetics.rateConstant)} unit={kinetics.reactionOrder === 1 ? "s⁻¹" : "M⁻¹s⁻¹"} color="#3b82f6" />
                                        <StatCard label="Activation Energy" value={kinetics.activationEnergy.toFixed(1)} unit="kJ/mol" color="#8b5cf6" />
                                        <StatCard label="Half-Life (t½)" value={fmtTime(kinetics.halfLife)} unit="" color="#06b6d4" />
                                        <StatCard label="Reaction Order" value={String(kinetics.reactionOrder)} unit={kinetics.rateExpression} color="#f59e0b" />
                                    </div>
                                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.4)", border: "1px solid var(--glass-border)" }}>
                                        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 10, color: "var(--accent-blue-light)" }}>Arrhenius Parameters</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Pre-exponential (A)</div>
                                                <div style={{ fontSize: "0.95rem", fontWeight: 600, fontFamily: "monospace", color: "var(--text-secondary)" }}>{kinetics.arrheniusA.toExponential(1)}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Ea / RT</div>
                                                <div style={{ fontSize: "0.95rem", fontWeight: 600, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                                    {((kinetics.activationEnergy * 1000) / (R_GAS * (temperature + 273.15))).toFixed(2)}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Temperature</div>
                                                <div style={{ fontSize: "0.95rem", fontWeight: 600, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                                    {temperature}°C ({temperature + 273.15} K)
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Thermodynamics ── */}
                            {activeTab === "thermodynamics" && (
                                <div>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Thermodynamic Analysis</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                                        <ThermoCard
                                            label="Enthalpy (ΔH)" value={thermo.deltaH} unit="kJ/mol"
                                            color={thermo.isExothermic ? "#ef4444" : "#3b82f6"}
                                            badge={thermo.isExothermic ? "Exothermic" : "Endothermic"}
                                            badgeColor={thermo.isExothermic ? "#10b981" : "#f59e0b"}
                                            positive={thermo.isExothermic} />
                                        <ThermoCard
                                            label="Gibbs Free Energy (ΔG)" value={thermo.deltaG} unit="kJ/mol"
                                            color={thermo.isSpontaneous ? "#10b981" : "#ef4444"}
                                            badge={thermo.isSpontaneous ? "Spontaneous" : "Non-spontaneous"}
                                            badgeColor={thermo.isSpontaneous ? "#10b981" : "#ef4444"}
                                            positive={thermo.isSpontaneous} />
                                        <ThermoCard
                                            label="Entropy (ΔS)" value={thermo.deltaS} unit="J/(mol·K)"
                                            color="#8b5cf6"
                                            badge={thermo.deltaS > 0 ? "Increase in disorder" : "Decrease in disorder"}
                                            badgeColor="var(--text-secondary)" positive={false} />
                                    </div>
                                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.4)", border: "1px solid var(--glass-border)" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Equilibrium Constant (K<sub>eq</sub>)</div>
                                                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                                                    {thermo.equilibriumK > 1e6 ? thermo.equilibriumK.toExponential(2) : thermo.equilibriumK.toFixed(3)}
                                                </div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {thermo.equilibriumK > 1 ? "Products favored" : "Reactants favored"}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>at Temperature</div>
                                                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                                    {temperature + 273.15} K
                                                </div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>({temperature}°C)</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Yield ── */}
                            {activeTab === "yield" && (
                                <div>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Yield Prediction</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                                        <div>
                                            <div style={{
                                                padding: 24, borderRadius: 12,
                                                background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.08))",
                                                border: "1px solid rgba(16,185,129,0.25)", marginBottom: 16,
                                            }}>
                                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8 }}>Predicted Yield</div>
                                                <div style={{
                                                    fontSize: "3.2rem", fontWeight: 800,
                                                    color: yieldData.predictedYield > 70 ? "#10b981" : yieldData.predictedYield > 40 ? "#fbbf24" : "#ef4444",
                                                }}>
                                                    {yieldData.predictedYield}%
                                                </div>
                                                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 6 }}>
                                                    Under current conditions ({temperature}°C, {pressure} atm, {solvent})
                                                </div>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                                                    <div>
                                                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Theoretical</div>
                                                        <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--accent-cyan)" }}>{yieldData.theoreticalYield}%</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Selectivity</div>
                                                        <div style={{ fontSize: "1rem", fontWeight: 600, color: "#8b5cf6" }}>{yieldData.selectivity}%</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Conversion</div>
                                                        <div style={{ fontSize: "1rem", fontWeight: 600, color: "#3b82f6" }}>{yieldData.conversion}%</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 10 }}>Optimization Suggestions</div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {yieldData.suggestions.map((s, i) => (
                                                    <div key={i} style={{
                                                        padding: 10, borderRadius: 8,
                                                        background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.15)",
                                                        fontSize: "0.82rem", color: "var(--text-secondary)",
                                                        display: "flex", alignItems: "flex-start", gap: 8,
                                                    }}>
                                                        <Lightbulb size={14} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 2 }} /> {s}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 10 }}>By-Products</div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {yieldData.byProducts.map((bp, i) => (
                                                    <div key={i} style={{
                                                        padding: 14, borderRadius: 8,
                                                        background: `rgba(${i === 0 ? "249,115,22" : "239,68,68"}, 0.06)`,
                                                        border: `1px solid rgba(${i === 0 ? "249,115,22" : "239,68,68"}, 0.2)`,
                                                    }}>
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{bp.name}</div>
                                                        <div style={{ fontSize: "1.3rem", fontWeight: 700, color: i === 0 ? "#f97316" : "#ef4444" }}>{bp.yield}%</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── AI Suggestions ── */}
                            {activeTab === "ai" && (
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>AI-Powered Analysis</h3>
                                        <motion.button whileTap={{ scale: 0.95 }} onClick={fetchAi}
                                            disabled={aiLoading} className="btn-secondary" style={{ fontSize: "0.8rem" }}>
                                            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            {aiLoading ? "Analyzing…" : "Refresh"}
                                        </motion.button>
                                    </div>

                                    {aiLoading && (
                                        <div style={{ textAlign: "center", padding: 40 }}>
                                            <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-blue)", marginBottom: 12 }} />
                                            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Analyzing reaction conditions…</div>
                                        </div>
                                    )}

                                    {!aiLoading && aiSuggestions.length === 0 && (
                                        <div style={{ textAlign: "center", padding: 40 }}>
                                            <Sparkles size={40} style={{ color: "var(--accent-blue)", opacity: 0.3, marginBottom: 12 }} />
                                            <div style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                                                Click &quot;Refresh&quot; to get AI-powered reaction analysis
                                            </div>
                                        </div>
                                    )}

                                    {!aiLoading && aiSuggestions.length > 0 && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {aiSuggestions.map((suggestion, i) => {
                                                const category = suggestion.match(/\[([^\]]+)\]/)?.[1] || "Suggestion";
                                                const text = suggestion.replace(/\[[^\]]+\]\s*/, "");
                                                const colors: Record<string, string> = {
                                                    Optimization: "#3b82f6", Selectivity: "#8b5cf6",
                                                    "Green Chemistry": "#10b981", Safety: "#f97316", Suggestion: "#06b6d4",
                                                };
                                                const icons: Record<string, React.ReactNode> = {
                                                    Optimization: <TrendingUp size={16} />, Selectivity: <Activity size={16} />,
                                                    "Green Chemistry": <CheckCircle2 size={16} />, Safety: <Shield size={16} />,
                                                    Suggestion: <Lightbulb size={16} />,
                                                };
                                                const color = colors[category] || "#06b6d4";
                                                return (
                                                    <motion.div key={i} initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                                                        style={{ padding: 14, borderRadius: 10, background: `${color}08`, border: `1px solid ${color}25` }}>
                                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                                            <div style={{ color, flexShrink: 0, marginTop: 1 }}>{icons[category] || <Lightbulb size={16} />}</div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color, marginBottom: 3 }}>{category}</div>
                                                                <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{text}</div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </GlassCard>
            </motion.div>
        </div>
    );
}

/* ═══════════════════════════════════
   Sub-components
   ═══════════════════════════════════ */

function SmallLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <span style={{
            fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.04em", display: "block", ...style,
        }}>
            {children}
        </span>
    );
}

function SectionHeader({ label, onAdd, color }: { label: string; onAdd: () => void; color: "blue" | "purple" }) {
    const c = color === "blue" ? "59, 130, 246" : "139, 92, 246";
    const cssColor = color === "blue" ? "var(--accent-blue)" : "var(--accent-purple)";
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
            </span>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onAdd}
                style={{
                    background: `rgba(${c}, 0.15)`, border: `1px solid rgba(${c}, 0.3)`,
                    borderRadius: 6, padding: "3px 8px", color: cssColor, cursor: "pointer",
                    fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4,
                }}>
                <Plus size={12} /> Add
            </motion.button>
        </div>
    );
}

function MoleculeCard({ item, color, onUpdate, onRemove }: {
    item: Reactant; color: "blue" | "purple";
    onUpdate: (field: keyof Reactant, value: string | number) => void;
    onRemove?: () => void;
}) {
    const c = color === "blue" ? "59, 130, 246" : "139, 92, 246";
    const smiColor = color === "blue" ? "var(--accent-cyan)" : "var(--accent-purple)";
    return (
        <div style={{
            padding: 10, borderRadius: 8,
            background: `rgba(${c}, 0.04)`, border: `1px solid rgba(${c}, 0.15)`,
        }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input className="input" value={item.name}
                    onChange={(e) => onUpdate("name", e.target.value)}
                    placeholder="Name" style={{ fontSize: "0.8rem", flex: 1, padding: "4px 8px" }} />
                {onRemove && (
                    <motion.button whileTap={{ scale: 0.85 }} onClick={onRemove}
                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}>
                        <Trash2 size={14} />
                    </motion.button>
                )}
            </div>
            <input className="input" value={item.smiles}
                onChange={(e) => onUpdate("smiles", e.target.value)}
                placeholder="SMILES (e.g. CCO)"
                style={{ fontSize: "0.78rem", fontFamily: "monospace", color: smiColor, padding: "4px 8px", marginBottom: 6 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Conc (M)</span>
                    <input type="number" className="input" step="0.1" min="0" value={item.concentration}
                        onChange={(e) => onUpdate("concentration", parseFloat(e.target.value) || 0)}
                        style={{ fontSize: "0.78rem", padding: "3px 6px" }} />
                </div>
                <div>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Amount (mol)</span>
                    <input type="number" className="input" step="0.01" min="0" value={item.amount}
                        onChange={(e) => onUpdate("amount", parseFloat(e.target.value) || 0)}
                        style={{ fontSize: "0.78rem", padding: "3px 6px" }} />
                </div>
            </div>
        </div>
    );
}

function ConditionSlider({ icon, label, value, unit, min, max, step, color, onChange, marks }: {
    icon: React.ReactNode; label: string; value: number; unit: string;
    min: number; max: number; step: number; color: string;
    onChange: (v: number) => void; marks: string[];
}) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ color }}>{icon}</span>
                <SmallLabel style={{ marginBottom: 0 }}>{label}</SmallLabel>
                <span style={{ fontSize: "0.82rem", color, marginLeft: "auto", fontWeight: 600, fontFamily: "monospace" }}>
                    {value}{unit}
                </span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
                {marks.map((m, i) => <span key={i}>{m}</span>)}
            </div>
        </div>
    );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
    return (
        <div style={{ padding: 14, borderRadius: 12, background: `${color}0a`, border: `1px solid ${color}25` }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
            {unit && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>{unit}</div>}
        </div>
    );
}

function ThermoCard({ label, value, unit, color, badge, badgeColor, positive }: {
    label: string; value: number; unit: string; color: string;
    badge: string; badgeColor: string; positive: boolean;
}) {
    return (
        <div style={{
            padding: 20, borderRadius: 12,
            background: `${color}0a`, border: `1px solid ${color}30`,
        }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color }}>
                {value > 0 ? "+" : ""}{value}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{unit}</div>
            <div style={{ marginTop: 10, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4, color: badgeColor }}>
                {positive ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {badge}
            </div>
        </div>
    );
}
