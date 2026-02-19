"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";

export default function ReactionLabPage() {
    const [activeTab, setActiveTab] = useState<"kinetics" | "thermodynamics" | "yield" | "ai">("kinetics");
    const [isPlaying, setIsPlaying] = useState(false);
    const [temperature, setTemperature] = useState(25);
    const [pressure, setPressure] = useState(1);
    const [pH, setPH] = useState(7);
    const [reactionTime, setReactionTime] = useState(60);
    const [stirringRate, setStirringRate] = useState(300);
    const [animationSpeed, setAnimationSpeed] = useState(1);
    const [reactionEquation, setReactionEquation] = useState("2H2 + O2 → 2H2O");
    const [solvent, setSolvent] = useState("water");
    const [mechanismType, setMechanismType] = useState("SN2");
    const [liveMode, setLiveMode] = useState(false);
    const [showMechanism, setShowMechanism] = useState(false);
    const [showTransition, setShowTransition] = useState(false);
    const [visualizationMode, setVisualizationMode] = useState("ball-stick");

    const [reactants, setReactants] = useState([
        { name: "Hydrogen", smiles: "[H][H]", concentration: 2, amount: 0.5 },
        { name: "Oxygen", smiles: "O=O", concentration: 1, amount: 0.25 },
    ]);

    const [products, setProducts] = useState([
        { name: "Water", smiles: "O", concentration: 0, amount: 0 },
    ]);

    const presetReactions = [
        { name: "Acid-Base", equation: "HCl + NaOH → NaCl + H2O" },
        { name: "Redox", equation: "Zn + Cu²⁺ → Zn²⁺ + Cu" },
        { name: "Polymerization", equation: "nC2H4 → (C2H4)n" },
        { name: "Combustion", equation: "CH4 + 2O2 → CO2 + 2H2O" },
    ];

    return (
        <div className="page-container">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginBottom: 32 }}
            >
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
                            Design, simulate, and visualize chemical transformations in real-time
                        </p>
                    </div>
                </div>

                {/* Preset Templates */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                    {presetReactions.map((preset) => (
                        <motion.button
                            key={preset.name}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setReactionEquation(preset.equation)}
                            className="badge badge-processing"
                            style={{
                                cursor: "pointer",
                                padding: "6px 12px",
                                fontSize: "0.8rem",
                            }}
                        >
                            <Zap size={12} />
                            {preset.name}
                        </motion.button>
                    ))}
                </div>
            </motion.div>

            {/* 3-Panel Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 320px", gap: 20, marginBottom: 32 }}>
                {/* LEFT PANEL - Reaction Input */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <GlassCard glow="blue" style={{ height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <FlaskConical size={18} style={{ color: "var(--accent-blue)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Reaction Input</h3>
                        </div>

                        {/* Reaction Equation */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Reaction Equation</label>
                            <textarea
                                className="input"
                                value={reactionEquation}
                                onChange={(e) => setReactionEquation(e.target.value)}
                                placeholder="2H2 + O2 → 2H2O"
                                style={{ fontFamily: "monospace", minHeight: 60, resize: "vertical" }}
                            />
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                className="btn-secondary"
                                style={{ width: "100%", marginTop: 8, fontSize: "0.85rem" }}
                            >
                                Auto Balance
                            </motion.button>
                        </div>

                        {/* Reactants */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Reactants</label>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {reactants.map((r, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: 12,
                                            borderRadius: 8,
                                            background: "rgba(59, 130, 246, 0.05)",
                                            border: "1px solid rgba(59, 130, 246, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
                                            {r.name}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "0.75rem",
                                                fontFamily: "monospace",
                                                color: "var(--accent-cyan)",
                                                marginBottom: 8,
                                            }}
                                        >
                                            {r.smiles}
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.75rem" }}>
                                            <div>
                                                <span style={{ color: "var(--text-muted)" }}>Conc:</span> {r.concentration} M
                                            </div>
                                            <div>
                                                <span style={{ color: "var(--text-muted)" }}>Amount:</span> {r.amount} mol
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                className="btn-secondary"
                                style={{ width: "100%", marginTop: 8, fontSize: "0.85rem" }}
                            >
                                + Add Reactant
                            </motion.button>
                        </div>

                        {/* Products */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Products</label>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {products.map((p, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: 12,
                                            borderRadius: 8,
                                            background: "rgba(139, 92, 246, 0.05)",
                                            border: "1px solid rgba(139, 92, 246, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
                                            {p.name}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "0.75rem",
                                                fontFamily: "monospace",
                                                color: "var(--accent-cyan)",
                                            }}
                                        >
                                            {p.smiles}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Mechanism Type */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Mechanism Type</label>
                            <select className="input" value={mechanismType} onChange={(e) => setMechanismType(e.target.value)}>
                                <option value="SN1">SN1 - Unimolecular Nucleophilic Substitution</option>
                                <option value="SN2">SN2 - Bimolecular Nucleophilic Substitution</option>
                                <option value="E1">E1 - Unimolecular Elimination</option>
                                <option value="E2">E2 - Bimolecular Elimination</option>
                                <option value="radical">Radical Chain Reaction</option>
                                <option value="photochemical">Photochemical</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>

                        {/* Catalyst */}
                        <div>
                            <label className="label">Catalyst (Optional)</label>
                            <input type="text" className="input" placeholder="e.g., Pt, Pd/C, H2SO4" />
                        </div>
                    </GlassCard>
                </motion.div>

                {/* MIDDLE PANEL - Animation Viewer */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <GlassCard glow="purple" style={{ height: "100%" }}>
                        {/* Animation Container */}
                        <div
                            style={{
                                height: 400,
                                borderRadius: 12,
                                background: "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(139,92,246,0.05))",
                                border: "1px solid var(--glass-border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: 16,
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            {/* Placeholder for 3D Viewer */}
                            <div style={{ textAlign: "center" }}>
                                <FlaskConical size={64} style={{ color: "var(--accent-blue)", opacity: 0.3, marginBottom: 12 }} />
                                <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                                    3D Molecular Animation Viewer
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                    Click "Generate Simulation" to start
                                </div>
                            </div>

                            {/* Live Badge */}
                            {liveMode && (
                                <div style={{ position: "absolute", top: 12, right: 12 }}>
                                    <StatusBadge status="processing" label="Live Mode" />
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="btn-secondary"
                                style={{ flex: 1 }}
                            >
                                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                {isPlaying ? "Pause" : "Play"}
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} className="btn-secondary">
                                <RotateCcw size={16} />
                                Reset
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} className="btn-secondary">
                                <Download size={16} />
                                Export
                            </motion.button>
                        </div>

                        {/* Speed Slider */}
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
                                {["ball-stick", "space-filling", "pathway"].map((mode) => (
                                    <motion.button
                                        key={mode}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setVisualizationMode(mode)}
                                        style={{
                                            padding: "8px 12px",
                                            borderRadius: 8,
                                            border: "1px solid",
                                            borderColor: visualizationMode === mode ? "var(--accent-blue)" : "var(--glass-border)",
                                            background: visualizationMode === mode ? "rgba(59,130,246,0.1)" : "transparent",
                                            color: visualizationMode === mode ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            transition: "all 0.2s ease",
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {mode.replace("-", " ")}
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Toggle Options */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {[
                                { label: "Show Mechanism Steps", value: showMechanism, setter: setShowMechanism },
                                { label: "Show Transition State", value: showTransition, setter: setShowTransition },
                                { label: "Live Mode (Auto Re-render)", value: liveMode, setter: setLiveMode },
                            ].map((toggle) => (
                                <label
                                    key={toggle.label}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: "0.85rem",
                                        cursor: "pointer",
                                    }}
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
                                    height: 120,
                                    borderRadius: 8,
                                    background: "rgba(15, 23, 42, 0.4)",
                                    border: "1px solid var(--glass-border)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    Energy diagram: Reactants → TS → Products
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <label className="label">Reaction Progress</label>
                                <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)" }}>0%</span>
                            </div>
                            <div
                                style={{
                                    height: 8,
                                    borderRadius: 4,
                                    background: "rgba(15, 23, 42, 0.6)",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        width: "0%",
                                        background: "var(--gradient-accent)",
                                        transition: "width 0.3s ease",
                                    }}
                                />
                            </div>
                        </div>
                    </GlassCard>
                </motion.div>

                {/* RIGHT PANEL - Conditions & Controls */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <GlassCard glow="cyan" style={{ height: "100%" }}>
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
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>-50°C</span>
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
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>0.1 atm</span>
                                <span>100 atm</span>
                            </div>
                        </div>

                        {/* pH */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <Droplet size={14} style={{ color: "var(--accent-cyan)" }} />
                                <label className="label" style={{ marginBottom: 0 }}>pH</label>
                                <span style={{ fontSize: "0.85rem", color: "var(--accent-cyan)", marginLeft: "auto" }}>
                                    {pH}
                                </span>
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
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>Acidic (0)</span>
                                <span>Neutral (7)</span>
                                <span>Basic (14)</span>
                            </div>
                        </div>

                        {/* Solvent */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Solvent</label>
                            <select className="input" value={solvent} onChange={(e) => setSolvent(e.target.value)}>
                                <option value="water">Water (H₂O)</option>
                                <option value="ethanol">Ethanol (C₂H₅OH)</option>
                                <option value="dmso">DMSO</option>
                                <option value="acetone">Acetone</option>
                                <option value="thf">Tetrahydrofuran (THF)</option>
                                <option value="dcm">Dichloromethane (DCM)</option>
                                <option value="custom">Custom</option>
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

                        {/* Stirring Rate */}
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

                        {/* Catalyst Amount */}
                        <div style={{ marginBottom: 24 }}>
                            <label className="label">Catalyst Amount</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                                <input type="number" className="input" placeholder="0.01" step="0.01" />
                                <select className="input" style={{ width: 80 }}>
                                    <option value="mol">mol</option>
                                    <option value="g">g</option>
                                    <option value="mg">mg</option>
                                </select>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <motion.button whileTap={{ scale: 0.97 }} className="btn-primary" style={{ width: "100%" }}>
                                <Zap size={16} />
                                Generate Simulation
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.97 }} className="btn-secondary" style={{ width: "100%" }}>
                                <RotateCcw size={16} />
                                Reset Conditions
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.97 }} className="btn-secondary" style={{ width: "100%" }}>
                                <TrendingUp size={16} />
                                Compare Runs
                            </motion.button>
                        </div>
                    </GlassCard>
                </motion.div>
            </div>

            {/* Reaction Insights Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <GlassCard>
                    {/* Tab Headers */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--glass-border)", paddingBottom: 0 }}>
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
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    <div style={{ minHeight: 300 }}>
                        {activeTab === "kinetics" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Reaction Kinetics</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                                    <div
                                        style={{
                                            padding: 16,
                                            borderRadius: 12,
                                            background: "rgba(59, 130, 246, 0.08)",
                                            border: "1px solid rgba(59, 130, 246, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                            Rate Constant (k)
                                        </div>
                                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-blue)" }}>
                                            2.3 × 10⁻³
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>s⁻¹</div>
                                    </div>
                                    <div
                                        style={{
                                            padding: 16,
                                            borderRadius: 12,
                                            background: "rgba(139, 92, 246, 0.08)",
                                            border: "1px solid rgba(139, 92, 246, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                            Activation Energy
                                        </div>
                                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-purple)" }}>
                                            45.2
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>kJ/mol</div>
                                    </div>
                                    <div
                                        style={{
                                            padding: 16,
                                            borderRadius: 12,
                                            background: "rgba(6, 182, 212, 0.08)",
                                            border: "1px solid rgba(6, 182, 212, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                            Half-Life (t½)
                                        </div>
                                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                                            301
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>seconds</div>
                                    </div>
                                </div>
                                <div
                                    style={{
                                        height: 250,
                                        borderRadius: 12,
                                        background: "rgba(15, 23, 42, 0.4)",
                                        border: "1px solid var(--glass-border)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        Rate vs Temperature Graph (Arrhenius Plot)
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "thermodynamics" && (
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>Thermodynamic Analysis</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                                    <div
                                        style={{
                                            padding: 20,
                                            borderRadius: 12,
                                            background: "rgba(239, 68, 68, 0.08)",
                                            border: "1px solid rgba(239, 68, 68, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                            Enthalpy Change (ΔH)
                                        </div>
                                        <div style={{ fontSize: "2rem", fontWeight: 700, color: "#ef4444" }}>-241.8</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>kJ/mol</div>
                                        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#10b981" }}>
                                            <CheckCircle2 size={14} style={{ display: "inline", marginRight: 4 }} />
                                            Exothermic
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            padding: 20,
                                            borderRadius: 12,
                                            background: "rgba(59, 130, 246, 0.08)",
                                            border: "1px solid rgba(59, 130, 246, 0.2)",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                            Gibbs Free Energy (ΔG)
                                        </div>
                                        <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent-blue)" }}>-228.6</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>kJ/mol</div>
                                        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#10b981" }}>
                                            <CheckCircle2 size={14} style={{ display: "inline", marginRight: 4 }} />
                                            Spontaneous (Exergonic)
                                        </div>
                                    </div>
                                </div>
                                <div
                                    style={{
                                        padding: 20,
                                        borderRadius: 12,
                                        background: "rgba(139, 92, 246, 0.08)",
                                        border: "1px solid rgba(139, 92, 246, 0.2)",
                                    }}
                                >
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                        Entropy Change (ΔS)
                                    </div>
                                    <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--accent-purple)" }}>-44.4</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>J/(mol·K)</div>
                                    <div style={{ marginTop: 12, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        Decrease in disorder
                                    </div>
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
                                                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1))",
                                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                                marginBottom: 16,
                                            }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                                                Predicted Yield
                                            </div>
                                            <div style={{ fontSize: "3rem", fontWeight: 700, color: "#10b981" }}>87.5%</div>
                                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 8 }}>
                                                Under current conditions
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>Optimization Suggestions</h4>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {[
                                                    "Increase temperature to 45°C for +3.2% yield",
                                                    "Use 0.05 mol catalyst for better conversion",
                                                    "Extend reaction time to 90 minutes",
                                                ].map((suggestion, i) => (
                                                    <div
                                                        key={i}
                                                        style={{
                                                            padding: 12,
                                                            borderRadius: 8,
                                                            background: "rgba(59, 130, 246, 0.05)",
                                                            border: "1px solid rgba(59, 130, 246, 0.2)",
                                                            fontSize: "0.85rem",
                                                        }}
                                                    >
                                                        <Lightbulb size={14} style={{ display: "inline", marginRight: 8, color: "#fbbf24" }} />
                                                        {suggestion}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>Side Products</h4>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: "rgba(249, 115, 22, 0.08)",
                                                    border: "1px solid rgba(249, 115, 22, 0.2)",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>By-product A</div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f97316" }}>8.2%</div>
                                            </div>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: "rgba(239, 68, 68, 0.08)",
                                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>By-product B</div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ef4444" }}>4.3%</div>
                                            </div>
                                        </div>
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
                                            desc: "Reaction is exothermic. Implement cooling system to maintain temperature control",
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
                                                    <div style={{ flex: 1 }}>
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
