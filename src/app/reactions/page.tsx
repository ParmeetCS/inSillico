"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
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
    Video,
    VideoOff,
    Camera,
    RotateCw,
    Atom,
    Loader2,
    Activity,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
    MoleculeData,
    ReactionData,
    VisualizationMode,
    RecordingState,
} from "@/components/molecular/types";
import type { MolecularSceneHandle } from "@/components/molecular/MolecularScene";

// Dynamic import – Three.js must only load client-side
const MolecularScene = dynamic(
    () => import("@/components/molecular/MolecularScene"),
    { ssr: false }
);

const ML_API = process.env.NEXT_PUBLIC_ML_API_URL || "http://localhost:5001";

// ─── Demo molecules for quick start ────────────────────────────────────────
const DEMO_MOLECULES: { name: string; smiles: string }[] = [
    { name: "Ethanol", smiles: "CCO" },
    { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
    { name: "Caffeine", smiles: "Cn1c(=O)c2c(ncn2C)n(C)c1=O" },
    { name: "Benzene", smiles: "c1ccccc1" },
    { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
    { name: "Water", smiles: "O" },
];

const PRESET_REACTIONS: {
    name: string;
    equation: string;
    reactant: string;
    product: string;
    bondChanges: { type: "form" | "break"; atom1: number; atom2: number }[];
}[] = [
    {
        name: "Dehydration",
        equation: "C₂H₅OH → C₂H₄ + H₂O",
        reactant: "CCO",
        product: "C=C",
        bondChanges: [
            { type: "break", atom1: 2, atom2: 3 },
            { type: "form", atom1: 1, atom2: 2 },
        ],
    },
    {
        name: "Oxidation",
        equation: "CH₃OH → CH₂O",
        reactant: "CO",
        product: "C=O",
        bondChanges: [
            { type: "form", atom1: 1, atom2: 2 },
        ],
    },
    {
        name: "Hydrogenation",
        equation: "C₂H₄ + H₂ → C₂H₆",
        reactant: "C=C",
        product: "CC",
        bondChanges: [
            { type: "break", atom1: 1, atom2: 2 },
        ],
    },
    {
        name: "Esterification",
        equation: "CH₃COOH + CH₃OH → CH₃COOCH₃",
        reactant: "CC(=O)O",
        product: "CC(=O)OC",
        bondChanges: [
            { type: "form", atom1: 4, atom2: 5 },
        ],
    },
];

export default function ReactionLabPage() {
    // ─── State ────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<"kinetics" | "thermodynamics" | "yield" | "ai">("kinetics");
    const [isPlaying, setIsPlaying] = useState(false);
    const [temperature, setTemperature] = useState(25);
    const [pressure, setPressure] = useState(1);
    const [pH, setPH] = useState(7);
    const [reactionTime, setReactionTime] = useState(60);
    const [stirringRate, setStirringRate] = useState(300);
    const [animationSpeed, setAnimationSpeed] = useState(1);
    const [solvent, setSolvent] = useState("water");
    const [mechanismType, setMechanismType] = useState("SN2");
    const [liveMode, setLiveMode] = useState(false);
    const [showMechanism, setShowMechanism] = useState(false);
    const [showTransition, setShowTransition] = useState(false);
    const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>("ball-stick");
    const [autoRotate, setAutoRotate] = useState(false);

    // Molecule & reaction data
    const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
    const [reactionData, setReactionData] = useState<ReactionData | null>(null);
    const [viewMode, setViewMode] = useState<"molecule" | "reaction">("molecule");
    const [smilesInput, setSmilesInput] = useState("CCO");
    const [reactantSmiles, setReactantSmiles] = useState("CCO");
    const [productSmiles, setProductSmiles] = useState("CC=O");

    // Loading / recording
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recording, setRecording] = useState<RecordingState>({ isRecording: false, duration: 0, blob: null });
    const [progress, setProgress] = useState(0);
    const [vibrationTemp, setVibrationTemp] = useState(0);

    const sceneRef = useRef<MolecularSceneHandle>(null);
    const lastBlobRef = useRef<Blob | null>(null);

    // ─── Fetch 3D from backend ──────────────────────────────────────────
    const generate3D = useCallback(async (smiles: string) => {
        setLoading(true);
        setError(null);
        setReactionData(null);
        setViewMode("molecule");
        try {
            const res = await fetch(`${ML_API}/generate-3d`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles, num_conformers: 5 }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || "Failed to generate 3D");
            }
            const data = await res.json();
            setMoleculeData(data as MoleculeData);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    const generateReaction3D = useCallback(async () => {
        setLoading(true);
        setError(null);
        setMoleculeData(null);
        setViewMode("reaction");
        try {
            const res = await fetch(`${ML_API}/generate-reaction-3d`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reactant_smiles: reactantSmiles,
                    product_smiles: productSmiles,
                    bond_changes: [],
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || "Failed to generate reaction");
            }
            const data = await res.json();
            setReactionData(data as ReactionData);
            setIsPlaying(true);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [reactantSmiles, productSmiles]);

    // Auto-load demo molecule
    useEffect(() => {
        generate3D("CCO");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Recording callbacks ──────────────────────────────────────────────
    const handleRecordingChange = useCallback((state: RecordingState) => {
        setRecording(state);
        if (state.blob) lastBlobRef.current = state.blob;
    }, []);

    const toggleRecording = useCallback(() => {
        if (recording.isRecording) {
            sceneRef.current?.stopRecording();
        } else {
            sceneRef.current?.startRecording((blob) => {
                lastBlobRef.current = blob;
            });
        }
    }, [recording.isRecording]);

    // ─── Vibration derived from temperature slider ──────────────────────
    useEffect(() => {
        setVibrationTemp(Math.max(0, temperature + 273));
    }, [temperature]);

    // ─── Render ─────────────────────────────────────────────────────────
    return (
        <div className="page-container">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: "var(--gradient-accent)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <FlaskConical size={24} style={{ color: "white" }} />
                    </div>
                    <div>
                        <h1
                            style={{
                                fontSize: "2rem",
                                fontWeight: 800,
                                fontFamily: "var(--font-outfit), sans-serif",
                                margin: 0,
                            }}
                        >
                            Reaction Lab
                        </h1>
                        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
                            Real-time 3D molecular visualization &amp; reaction simulation engine
                        </p>
                    </div>
                </div>

                {/* Quick-load Demo Molecules + Preset Reactions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                    {DEMO_MOLECULES.map((mol) => (
                        <motion.button
                            key={mol.name}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                setSmilesInput(mol.smiles);
                                generate3D(mol.smiles);
                            }}
                            className="badge badge-processing"
                            style={{ cursor: "pointer", padding: "6px 12px", fontSize: "0.8rem" }}
                        >
                            <Atom size={12} />
                            {mol.name}
                        </motion.button>
                    ))}
                    <div style={{ width: 1, background: "var(--glass-border)", margin: "0 4px" }} />
                    {PRESET_REACTIONS.map((rx) => (
                        <motion.button
                            key={rx.name}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                setReactantSmiles(rx.reactant);
                                setProductSmiles(rx.product);
                                setLoading(true);
                                setError(null);
                                setMoleculeData(null);
                                setViewMode("reaction");
                                fetch(`${ML_API}/generate-reaction-3d`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        reactant_smiles: rx.reactant,
                                        product_smiles: rx.product,
                                        bond_changes: rx.bondChanges,
                                    }),
                                })
                                    .then((r) => r.json())
                                    .then((data) => {
                                        setReactionData(data);
                                        setIsPlaying(true);
                                    })
                                    .catch((e) => setError(e.message))
                                    .finally(() => setLoading(false));
                            }}
                            className="badge badge-completed"
                            style={{ cursor: "pointer", padding: "6px 12px", fontSize: "0.8rem" }}
                        >
                            <Zap size={12} />
                            {rx.name}
                        </motion.button>
                    ))}
                </div>
            </motion.div>

            {/* 3-Panel Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 320px", gap: 20, marginBottom: 32 }}>
                {/* LEFT PANEL – Input */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                    <GlassCard glow="blue" style={{ height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <FlaskConical size={18} style={{ color: "var(--accent-blue)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Molecule / Reaction Input</h3>
                        </div>

                        {/* Mode Toggle */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setViewMode("molecule")}
                                style={{
                                    padding: "10px",
                                    borderRadius: 8,
                                    border: "1px solid",
                                    borderColor: viewMode === "molecule" ? "var(--accent-blue)" : "var(--glass-border)",
                                    background: viewMode === "molecule" ? "rgba(59,130,246,0.1)" : "transparent",
                                    color: viewMode === "molecule" ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                <Atom size={14} style={{ marginRight: 6 }} />
                                Single Molecule
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setViewMode("reaction")}
                                style={{
                                    padding: "10px",
                                    borderRadius: 8,
                                    border: "1px solid",
                                    borderColor: viewMode === "reaction" ? "var(--accent-purple)" : "var(--glass-border)",
                                    background: viewMode === "reaction" ? "rgba(139,92,246,0.1)" : "transparent",
                                    color: viewMode === "reaction" ? "var(--accent-purple)" : "var(--text-secondary)",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                <Zap size={14} style={{ marginRight: 6 }} />
                                Reaction
                            </motion.button>
                        </div>

                        {viewMode === "molecule" ? (
                            <>
                                <div style={{ marginBottom: 20 }}>
                                    <label className="label">SMILES</label>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            type="text"
                                            className="input"
                                            value={smilesInput}
                                            onChange={(e) => setSmilesInput(e.target.value)}
                                            placeholder="e.g. CCO, c1ccccc1"
                                            style={{ flex: 1, fontFamily: "monospace" }}
                                            onKeyDown={(e) => e.key === "Enter" && generate3D(smilesInput)}
                                        />
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => generate3D(smilesInput)}
                                        className="btn-primary"
                                        disabled={loading || !smilesInput}
                                        style={{ width: "100%", marginTop: 8 }}
                                    >
                                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                        Generate 3D Structure
                                    </motion.button>
                                </div>

                                {moleculeData && (
                                    <div style={{ marginBottom: 20 }}>
                                        <label className="label">Structure Info</label>
                                        <div
                                            style={{
                                                padding: 12,
                                                borderRadius: 8,
                                                background: "rgba(59,130,246,0.05)",
                                                border: "1px solid rgba(59,130,246,0.2)",
                                                fontSize: "0.8rem",
                                            }}
                                        >
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                                <div><span style={{ color: "var(--text-muted)" }}>Atoms:</span> {moleculeData.atoms.length}</div>
                                                <div><span style={{ color: "var(--text-muted)" }}>Bonds:</span> {moleculeData.bonds.length}</div>
                                                <div style={{ gridColumn: "1/-1" }}>
                                                    <span style={{ color: "var(--text-muted)" }}>SMILES:</span>{" "}
                                                    <code style={{ color: "var(--accent-cyan)" }}>{moleculeData.smiles}</code>
                                                </div>
                                                {moleculeData.conformers && moleculeData.conformers.length > 0 && (
                                                    <div style={{ gridColumn: "1/-1" }}>
                                                        <span style={{ color: "var(--text-muted)" }}>Conformers:</span>{" "}
                                                        <span style={{ color: "var(--accent-purple)" }}>
                                                            {moleculeData.conformers.length}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <label className="label">Reactant SMILES</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={reactantSmiles}
                                        onChange={(e) => setReactantSmiles(e.target.value)}
                                        placeholder="e.g. CCO"
                                        style={{ fontFamily: "monospace" }}
                                    />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label className="label">Product SMILES</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={productSmiles}
                                        onChange={(e) => setProductSmiles(e.target.value)}
                                        placeholder="e.g. CC=O"
                                        style={{ fontFamily: "monospace" }}
                                    />
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={generateReaction3D}
                                    className="btn-primary"
                                    disabled={loading || !reactantSmiles || !productSmiles}
                                    style={{ width: "100%", marginBottom: 16 }}
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                    Simulate Reaction
                                </motion.button>

                                <div style={{ marginBottom: 16 }}>
                                    <label className="label">Mechanism Type</label>
                                    <select className="input" value={mechanismType} onChange={(e) => setMechanismType(e.target.value)}>
                                        <option value="SN1">SN1</option>
                                        <option value="SN2">SN2</option>
                                        <option value="E1">E1</option>
                                        <option value="E2">E2</option>
                                        <option value="radical">Radical</option>
                                        <option value="photochemical">Photochemical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Catalyst (Optional)</label>
                                    <input type="text" className="input" placeholder="e.g., Pt, Pd/C, H₂SO₄" />
                                </div>
                            </>
                        )}

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{
                                        marginTop: 12,
                                        padding: 12,
                                        borderRadius: 8,
                                        background: "rgba(239,68,68,0.1)",
                                        border: "1px solid rgba(239,68,68,0.3)",
                                        color: "#ef4444",
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    <AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </GlassCard>
                </motion.div>

                {/* MIDDLE PANEL – 3D Viewer */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <GlassCard glow="purple" style={{ height: "100%" }}>
                        <div style={{ position: "relative", marginBottom: 16 }}>
                            {loading && (
                                <div
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        zIndex: 10,
                                        background: "rgba(10,14,26,0.7)",
                                        borderRadius: 12,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexDirection: "column",
                                        gap: 12,
                                    }}
                                >
                                    <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-blue)" }} />
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        {viewMode === "reaction" ? "Computing reaction geometries..." : "Generating 3D coordinates..."}
                                    </div>
                                </div>
                            )}

                            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, display: "flex", gap: 8 }}>
                                {liveMode && <StatusBadge status="processing" label="Live Mode" />}
                                {recording.isRecording && <StatusBadge status="processing" label="Recording" />}
                            </div>

                            <MolecularScene
                                ref={sceneRef}
                                molecule={viewMode === "molecule" ? moleculeData : null}
                                reaction={viewMode === "reaction" ? reactionData : null}
                                mode={visualizationMode}
                                autoRotate={autoRotate}
                                temperature={vibrationTemp}
                                animationSpeed={animationSpeed}
                                isPlaying={isPlaying}
                                onProgressChange={setProgress}
                                onRecordingChange={handleRecordingChange}
                                height={400}
                                style={{
                                    background: "linear-gradient(135deg, rgba(59,130,246,0.03), rgba(139,92,246,0.03))",
                                    border: "1px solid var(--glass-border)",
                                }}
                            />
                        </div>

                        {/* Playback Controls */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    setIsPlaying(!isPlaying);
                                    if (viewMode === "reaction") {
                                        if (isPlaying) sceneRef.current?.pauseReaction();
                                        else sceneRef.current?.playReaction();
                                    }
                                }}
                                className="btn-secondary"
                                style={{ flex: 1 }}
                            >
                                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                {isPlaying ? "Pause" : "Play"}
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    sceneRef.current?.resetReaction();
                                    sceneRef.current?.resetCamera();
                                    setProgress(0);
                                }}
                                className="btn-secondary"
                            >
                                <RotateCcw size={16} />
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setAutoRotate(!autoRotate)}
                                className="btn-secondary"
                                style={{
                                    borderColor: autoRotate ? "var(--accent-blue)" : undefined,
                                    color: autoRotate ? "var(--accent-blue)" : undefined,
                                }}
                            >
                                <RotateCw size={16} />
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    const png = sceneRef.current?.takeScreenshot();
                                    if (png) {
                                        const a = document.createElement("a");
                                        a.href = png;
                                        a.download = "molecule-screenshot.png";
                                        a.click();
                                    }
                                }}
                                className="btn-secondary"
                            >
                                <Camera size={16} />
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={toggleRecording}
                                className="btn-secondary"
                                style={{
                                    borderColor: recording.isRecording ? "#ef4444" : undefined,
                                    color: recording.isRecording ? "#ef4444" : undefined,
                                }}
                            >
                                {recording.isRecording ? <VideoOff size={16} /> : <Video size={16} />}
                            </motion.button>
                            {lastBlobRef.current && !recording.isRecording && (
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        if (lastBlobRef.current) {
                                            sceneRef.current?.downloadRecording(lastBlobRef.current);
                                        }
                                    }}
                                    className="btn-secondary"
                                >
                                    <Download size={16} />
                                </motion.button>
                            )}
                        </div>

                        {/* Speed */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <label className="label">Animation Speed</label>
                                <span style={{ fontSize: "0.8rem", color: "var(--accent-blue)" }}>{animationSpeed}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="3"
                                step="0.1"
                                value={animationSpeed}
                                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                                style={{ width: "100%" }}
                            />
                        </div>

                        {/* Visualization Mode */}
                        <div style={{ marginBottom: 16 }}>
                            <label className="label">Visualization Mode</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                {(["ball-stick", "space-filling", "wireframe"] as VisualizationMode[]).map((m) => (
                                    <motion.button
                                        key={m}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setVisualizationMode(m)}
                                        style={{
                                            padding: "8px 12px",
                                            borderRadius: 8,
                                            border: "1px solid",
                                            borderColor: visualizationMode === m ? "var(--accent-blue)" : "var(--glass-border)",
                                            background: visualizationMode === m ? "rgba(59,130,246,0.1)" : "transparent",
                                            color: visualizationMode === m ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {m.replace("-", " ")}
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Toggles */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {[
                                { label: "Show Mechanism Steps", value: showMechanism, setter: setShowMechanism },
                                { label: "Show Transition State", value: showTransition, setter: setShowTransition },
                                { label: "Live Mode (Auto Re-render)", value: liveMode, setter: setLiveMode },
                            ].map((toggle) => (
                                <label
                                    key={toggle.label}
                                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer" }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={toggle.value}
                                        onChange={(e) => toggle.setter(e.target.checked)}
                                        style={{ cursor: "pointer" }}
                                    />
                                    {toggle.label}
                                </label>
                            ))}
                        </div>

                        {/* Energy Profile */}
                        <div style={{ marginTop: 16 }}>
                            <label className="label">Energy Profile</label>
                            <div
                                style={{
                                    height: 80,
                                    borderRadius: 8,
                                    background: "rgba(15, 23, 42, 0.4)",
                                    border: "1px solid var(--glass-border)",
                                    position: "relative",
                                    overflow: "hidden",
                                }}
                            >
                                <svg width="100%" height="100%" viewBox="0 0 200 80" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="energyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" style={{ stopColor: "#3b82f6", stopOpacity: 0.3 }} />
                                            <stop offset="50%" style={{ stopColor: "#ef4444", stopOpacity: 0.3 }} />
                                            <stop offset="100%" style={{ stopColor: "#10b981", stopOpacity: 0.3 }} />
                                        </linearGradient>
                                    </defs>
                                    <path
                                        d="M 0 60 Q 40 55 60 50 Q 90 10 100 15 Q 110 20 140 45 Q 170 55 200 50"
                                        fill="none"
                                        stroke="url(#energyGrad)"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M 0 60 Q 40 55 60 50 Q 90 10 100 15 Q 110 20 140 45 Q 170 55 200 50 L 200 80 L 0 80 Z"
                                        fill="url(#energyGrad)"
                                        opacity="0.2"
                                    />
                                    <line
                                        x1={progress * 200}
                                        y1="0"
                                        x2={progress * 200}
                                        y2="80"
                                        stroke="#3b82f6"
                                        strokeWidth="1.5"
                                        opacity="0.6"
                                    />
                                </svg>
                                <div style={{ position: "absolute", bottom: 4, left: 8, fontSize: "0.6rem", color: "var(--text-muted)" }}>
                                    Reactants
                                </div>
                                <div style={{ position: "absolute", top: 4, left: "45%", fontSize: "0.6rem", color: "var(--text-muted)" }}>
                                    TS‡
                                </div>
                                <div style={{ position: "absolute", bottom: 4, right: 8, fontSize: "0.6rem", color: "var(--text-muted)" }}>
                                    Products
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <label className="label">Reaction Progress</label>
                                <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)" }}>
                                    {Math.round(progress * 100)}%
                                </span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "rgba(15, 23, 42, 0.6)", overflow: "hidden" }}>
                                <motion.div
                                    style={{
                                        height: "100%",
                                        width: `${progress * 100}%`,
                                        background: "var(--gradient-accent)",
                                    }}
                                    transition={{ duration: 0.1 }}
                                />
                            </div>
                        </div>
                    </GlassCard>
                </motion.div>

                {/* RIGHT PANEL – Conditions */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <GlassCard glow="blue" style={{ height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <Gauge size={18} style={{ color: "var(--accent-cyan)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Reaction Conditions</h3>
                        </div>

                        {/* Temperature */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <Thermometer size={14} style={{ color: "var(--accent-blue)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>Temperature</label>
                                <span style={{ fontSize: "0.85rem", color: "var(--accent-blue)", marginLeft: "auto" }}>
                                    {temperature}°C
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-50"
                                max="500"
                                value={temperature}
                                onChange={(e) => setTemperature(parseInt(e.target.value))}
                                style={{ width: "100%" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>-50°C</span>
                                <span style={{ color: "var(--accent-cyan)", fontSize: "0.7rem" }}>
                                    <Activity size={10} style={{ display: "inline", marginRight: 2 }} />
                                    Vibration: {vibrationTemp > 0 ? "ON" : "OFF"}
                                </span>
                                <span>500°C</span>
                            </div>
                        </div>

                        {/* Pressure */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <Gauge size={14} style={{ color: "var(--accent-purple)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>Pressure</label>
                                <span style={{ fontSize: "0.85rem", color: "var(--accent-purple)", marginLeft: "auto" }}>
                                    {pressure} atm
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="100"
                                step="0.1"
                                value={pressure}
                                onChange={(e) => setPressure(parseFloat(e.target.value))}
                                style={{ width: "100%" }}
                            />
                        </div>

                        {/* pH */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <Droplet size={14} style={{ color: "var(--accent-cyan)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>pH</label>
                                <span style={{ fontSize: "0.85rem", color: "var(--accent-cyan)", marginLeft: "auto" }}>{pH}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="14"
                                step="0.1"
                                value={pH}
                                onChange={(e) => setPH(parseFloat(e.target.value))}
                                style={{ width: "100%" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>Acidic</span>
                                <span>Neutral</span>
                                <span>Basic</span>
                            </div>
                        </div>

                        {/* Solvent */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Solvent</label>
                            <select className="input" value={solvent} onChange={(e) => setSolvent(e.target.value)}>
                                <option value="water">Water</option>
                                <option value="ethanol">Ethanol</option>
                                <option value="dmso">DMSO</option>
                                <option value="acetone">Acetone</option>
                                <option value="thf">THF</option>
                                <option value="dcm">DCM</option>
                            </select>
                        </div>

                        {/* Reaction Time */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <Clock size={14} style={{ color: "var(--text-muted)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>Reaction Time</label>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                                <input
                                    type="number"
                                    className="input"
                                    value={reactionTime}
                                    onChange={(e) => setReactionTime(parseInt(e.target.value))}
                                />
                                <select className="input" style={{ width: 100 }}>
                                    <option value="seconds">seconds</option>
                                    <option value="minutes">minutes</option>
                                    <option value="hours">hours</option>
                                </select>
                            </div>
                        </div>

                        {/* Stirring */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <RotateCcw size={14} style={{ color: "var(--text-muted)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>Stirring Rate</label>
                                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginLeft: "auto" }}>
                                    {stirringRate} rpm
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                step="50"
                                value={stirringRate}
                                onChange={(e) => setStirringRate(parseInt(e.target.value))}
                                style={{ width: "100%" }}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                    if (viewMode === "reaction") generateReaction3D();
                                    else generate3D(smilesInput);
                                }}
                                className="btn-primary"
                                style={{ width: "100%" }}
                                disabled={loading}
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                {viewMode === "reaction" ? "Run Reaction" : "Generate Simulation"}
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                    setTemperature(25);
                                    setPressure(1);
                                    setPH(7);
                                    setStirringRate(300);
                                    setReactionTime(60);
                                }}
                                className="btn-secondary"
                                style={{ width: "100%" }}
                            >
                                <RotateCcw size={16} />
                                Reset Conditions
                            </motion.button>
                        </div>
                    </GlassCard>
                </motion.div>
            </div>

            {/* Bottom Insights */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <GlassCard>
                    <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--glass-border)" }}>
                        {[
                            { key: "kinetics" as const, label: "Kinetics", icon: TrendingUp },
                            { key: "thermodynamics" as const, label: "Thermodynamics", icon: Thermometer },
                            { key: "yield" as const, label: "Yield Prediction", icon: CheckCircle2 },
                            { key: "ai" as const, label: "AI Suggestions", icon: Lightbulb },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <motion.button
                                    key={tab.key}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "12px 20px",
                                        border: "none",
                                        borderBottom: activeTab === tab.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
                                        background: "transparent",
                                        color: activeTab === tab.key ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                        fontSize: "0.9rem",
                                        fontWeight: activeTab === tab.key ? 600 : 400,
                                        cursor: "pointer",
                                    }}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </motion.button>
                            );
                        })}
                    </div>

                    <div style={{ minHeight: 300 }}>
                        {activeTab === "kinetics" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Reaction Kinetics</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                                    {[
                                        { label: "Rate Constant (k)", value: "2.3 × 10⁻³", unit: "s⁻¹", color: "59,130,246" },
                                        { label: "Activation Energy", value: "45.2", unit: "kJ/mol", color: "139,92,246" },
                                        { label: "Half-Life (t½)", value: "301", unit: "seconds", color: "6,182,212" },
                                    ].map((stat) => (
                                        <div
                                            key={stat.label}
                                            style={{
                                                padding: 16,
                                                borderRadius: 12,
                                                background: `rgba(${stat.color}, 0.08)`,
                                                border: `1px solid rgba(${stat.color}, 0.2)`,
                                            }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                                {stat.label}
                                            </div>
                                            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: `rgb(${stat.color})` }}>
                                                {stat.value}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stat.unit}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === "thermodynamics" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Thermodynamic Analysis</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                                    {[
                                        { label: "ΔH (Enthalpy)", value: "-241.8", unit: "kJ/mol", note: "Exothermic", color: "#ef4444" },
                                        { label: "ΔG (Gibbs)", value: "-228.6", unit: "kJ/mol", note: "Spontaneous", color: "#3b82f6" },
                                        { label: "ΔS (Entropy)", value: "-44.4", unit: "J/(mol·K)", note: "↓ Disorder", color: "#8b5cf6" },
                                    ].map((td) => (
                                        <div
                                            key={td.label}
                                            style={{
                                                padding: 20,
                                                borderRadius: 12,
                                                background: `${td.color}14`,
                                                border: `1px solid ${td.color}33`,
                                            }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>{td.label}</div>
                                            <div style={{ fontSize: "2rem", fontWeight: 700, color: td.color }}>{td.value}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{td.unit}</div>
                                            <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#10b981" }}>
                                                <CheckCircle2 size={14} style={{ display: "inline", marginRight: 4 }} />
                                                {td.note}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === "yield" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Yield Prediction</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                                    <div>
                                        <div
                                            style={{
                                                padding: 24,
                                                borderRadius: 12,
                                                background: "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.1))",
                                                border: "1px solid rgba(16,185,129,0.3)",
                                                marginBottom: 16,
                                            }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                                Predicted Yield
                                            </div>
                                            <div style={{ fontSize: "3rem", fontWeight: 700, color: "#10b981" }}>87.5%</div>
                                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 8 }}>
                                                Under current conditions (T={temperature}°C, P={pressure} atm, pH={pH})
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {[
                                                "Increase temperature to 45°C for +3.2% yield",
                                                "Use 0.05 mol catalyst for better conversion",
                                                "Extend reaction time to 90 minutes",
                                            ].map((s, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 8,
                                                        background: "rgba(59,130,246,0.05)",
                                                        border: "1px solid rgba(59,130,246,0.2)",
                                                        fontSize: "0.85rem",
                                                    }}
                                                >
                                                    <Lightbulb size={14} style={{ display: "inline", marginRight: 8, color: "#fbbf24" }} />
                                                    {s}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>Side Products</h4>
                                        {[
                                            { name: "By-product A", pct: "8.2%", color: "#f97316" },
                                            { name: "By-product B", pct: "4.3%", color: "#ef4444" },
                                        ].map((sp) => (
                                            <div
                                                key={sp.name}
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: `${sp.color}14`,
                                                    border: `1px solid ${sp.color}33`,
                                                    marginBottom: 8,
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{sp.name}</div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: sp.color }}>{sp.pct}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "ai" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>AI-Powered Suggestions</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {[
                                        {
                                            title: "Reaction Optimization",
                                            desc: "Consider using a polar aprotic solvent like DMF to increase reaction rate by 15-20%",
                                            icon: TrendingUp,
                                            color: "#3b82f6",
                                        },
                                        {
                                            title: "Alternative Catalyst",
                                            desc: "Palladium on carbon (Pd/C) may provide better selectivity and reusability",
                                            icon: FlaskConical,
                                            color: "#8b5cf6",
                                        },
                                        {
                                            title: "Green Chemistry",
                                            desc: "Replace current solvent with water or ethanol to reduce environmental impact",
                                            icon: CheckCircle2,
                                            color: "#10b981",
                                        },
                                        {
                                            title: "Safety Consideration",
                                            desc: "Exothermic reaction detected. Implement cooling system to maintain temperature control",
                                            icon: AlertCircle,
                                            color: "#f97316",
                                        },
                                    ].map((suggestion, i) => {
                                        const Icon = suggestion.icon;
                                        return (
                                            <motion.div
                                                key={i}
                                                whileHover={{ scale: 1.01 }}
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: `${suggestion.color}08`,
                                                    border: `1px solid ${suggestion.color}30`,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "start", gap: 12 }}>
                                                    <Icon size={20} style={{ color: suggestion.color, flexShrink: 0, marginTop: 2 }} />
                                                    <div>
                                                        <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>
                                                            {suggestion.title}
                                                        </div>
                                                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                                            {suggestion.desc}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
