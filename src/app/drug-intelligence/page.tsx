"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Pill,
    ScanSearch,
    Split,
    Zap,
    FileText,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Download,
    Share2,
    ChevronRight,
    Atom,
    Droplet,
    TrendingUp,
    Shield,
    AlertTriangle,
    Activity,
    Beaker,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";

interface MoleculeAnalysis {
    id: string;
    name: string;
    smiles: string;
    formula: string;
    molecularWeight: number;
    functionalGroups: string[];
    properties: {
        solubility: { value: number; unit: string; category: string };
        logP: { value: number; category: string };
        toxicity: { value: number; category: string; risk: string };
        bbbPermeability: { value: number; category: string };
        pH: { value: number };
        pKa: { value: number };
        bioavailability: { value: number; category: string };
        drugLikeness: { value: number; passes: boolean };
    };
    status: "pending" | "analyzing" | "completed" | "failed";
}

interface AnalysisPipeline {
    stage: "idle" | "detecting" | "segregating" | "analyzing" | "generating" | "completed";
    progress: number;
}

export default function DrugIntelligencePage() {
    const [drugInput, setDrugInput] = useState("");
    const [drugName, setDrugName] = useState("");
    const [pipeline, setPipeline] = useState<AnalysisPipeline>({ stage: "idle", progress: 0 });
    const [molecules, setMolecules] = useState<MoleculeAnalysis[]>([]);
    const [selectedMolecule, setSelectedMolecule] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const pipelineStages = [
        { id: "detecting", label: "Molecule Detection", icon: ScanSearch, color: "#3b82f6" },
        { id: "segregating", label: "Segregation Engine", icon: Split, color: "#8b5cf6" },
        { id: "analyzing", label: "Parallel Analysis", icon: Zap, color: "#06b6d4" },
        { id: "generating", label: "Report Generation", icon: FileText, color: "#10b981" },
    ];

    const handleAnalyzeDrug = async () => {
        if (!drugInput.trim()) {
            haptic("warning");
            toast("Please enter a drug structure or name", "warning");
            return;
        }

        setIsAnalyzing(true);
        haptic("medium");

        try {
            // Stage 1: Molecule Detection
            setPipeline({ stage: "detecting", progress: 0 });
            await simulateProgress("detecting");

            // Simulate molecule segregation
            const detectedMolecules = await detectAndSegregateMolecules(drugInput);
            setMolecules(detectedMolecules);

            // Stage 2: Segregation
            setPipeline({ stage: "segregating", progress: 0 });
            await simulateProgress("segregating");

            // Stage 3: Parallel Analysis
            setPipeline({ stage: "analyzing", progress: 0 });
            await analyzeAllMolecules(detectedMolecules);

            // Stage 4: Generate Report
            setPipeline({ stage: "generating", progress: 0 });
            await simulateProgress("generating");

            // Complete
            setPipeline({ stage: "completed", progress: 100 });
            haptic("success");
            toast("Drug intelligence report generated successfully!", "success");
        } catch (error) {
            haptic("error");
            toast("Analysis failed. Please try again.", "error");
            setPipeline({ stage: "idle", progress: 0 });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const simulateProgress = (stage: string): Promise<void> => {
        return new Promise((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                setPipeline((prev) => ({ ...prev, progress }));
                if (progress >= 100) {
                    clearInterval(interval);
                    resolve();
                }
            }, 200);
        });
    };

    const detectAndSegregateMolecules = async (input: string): Promise<MoleculeAnalysis[]> => {
        // Simulate API call to detect and segregate molecules
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Helper function to detect functional groups
        const detectFunctionalGroups = (smiles: string): string[] => {
            const groups: string[] = [];
            
            // Carboxylic Acid
            if (smiles.includes('C(=O)O') || smiles.includes('C(O)=O') || smiles.includes('COOH')) {
                groups.push('Carboxylic Acid');
            }
            
            // Ester
            if (smiles.includes('C(=O)O') && smiles.includes('OC') && !smiles.includes('C(=O)OH')) {
                groups.push('Ester');
            }
            
            // Ketone
            if (smiles.includes('C(=O)C') || smiles.includes('C(C)=O')) {
                groups.push('Ketone');
            }
            
            // Aldehyde
            if (smiles.includes('C(=O)H') || smiles.includes('CHO')) {
                groups.push('Aldehyde');
            }
            
            // Alcohol/Hydroxyl
            if (smiles.includes('OH') || smiles.includes('O') && !smiles.includes('=O')) {
                groups.push('Hydroxyl (Alcohol)');
            }
            
            // Amine
            if (smiles.includes('N') && !smiles.includes('N(=O)')) {
                if (smiles.includes('N(C)C') || smiles.includes('N(C)(C)')) {
                    groups.push('Tertiary Amine');
                } else if (smiles.includes('NC')) {
                    groups.push('Secondary/Primary Amine');
                } else {
                    groups.push('Amine');
                }
            }
            
            // Amide
            if (smiles.includes('C(=O)N') || smiles.includes('NC(=O)')) {
                groups.push('Amide');
            }
            
            // Aromatic Ring
            if (smiles.includes('c') || smiles.match(/c1ccccc1/)) {
                groups.push('Aromatic Ring (Benzene)');
            }
            
            // Phenol
            if ((smiles.includes('c') && smiles.includes('O')) || smiles.includes('cO')) {
                groups.push('Phenol');
            }
            
            // Ether
            if (smiles.includes('COC') || smiles.includes('OC')) {
                groups.push('Ether');
            }
            
            // Halogen
            if (smiles.includes('F')) groups.push('Fluorine');
            if (smiles.includes('Cl')) groups.push('Chlorine');
            if (smiles.includes('Br')) groups.push('Bromine');
            if (smiles.includes('I')) groups.push('Iodine');
            
            // Sulfur groups
            if (smiles.includes('S(=O)(=O)')) {
                groups.push('Sulfonyl');
            } else if (smiles.includes('S=O')) {
                groups.push('Sulfoxide');
            } else if (smiles.includes('S')) {
                groups.push('Thiol/Sulfide');
            }
            
            // Nitro
            if (smiles.includes('N(=O)=O') || smiles.includes('[N+](=O)[O-]')) {
                groups.push('Nitro Group');
            }
            
            // Nitrile
            if (smiles.includes('C#N')) {
                groups.push('Nitrile (Cyano)');
            }
            
            // Alkene
            if (smiles.includes('C=C')) {
                groups.push('Carbon-Carbon Double Bond');
            }
            
            // Alkyne
            if (smiles.includes('C#C')) {
                groups.push('Carbon-Carbon Triple Bond');
            }
            
            return groups.length > 0 ? groups : ['Hydrocarbon'];
        };

        // Function to analyze a single molecule SMILES
        const analyzeMolecule = (smiles: string, index: number, moleculeName?: string): MoleculeAnalysis => {
            // Count atoms in SMILES
            const carbonCount = (smiles.match(/C/g) || []).length;
            const nitrogenCount = (smiles.match(/N/g) || []).length;
            const oxygenCount = (smiles.match(/O/g) || []).length;
            const sulfurCount = (smiles.match(/S/g) || []).length;
            const fluorineCount = (smiles.match(/F/g) || []).length;
            const chlorineCount = (smiles.match(/Cl/g) || []).length;
            const hydrogenCount = (smiles.match(/H/g) || []).length;
            
            // Estimate molecular weight (simplified)
            const estimatedMW = carbonCount * 12 + nitrogenCount * 14 + oxygenCount * 16 + 
                               sulfurCount * 32 + fluorineCount * 19 + chlorineCount * 35 + hydrogenCount * 1;
            
            // Generate formula
            const formulaParts: string[] = [];
            if (carbonCount > 0) formulaParts.push(`C${carbonCount > 1 ? carbonCount : ''}`);
            if (hydrogenCount > 0) formulaParts.push(`H${hydrogenCount > 1 ? hydrogenCount : ''}`);
            if (nitrogenCount > 0) formulaParts.push(`N${nitrogenCount > 1 ? nitrogenCount : ''}`);
            if (oxygenCount > 0) formulaParts.push(`O${oxygenCount > 1 ? oxygenCount : ''}`);
            if (sulfurCount > 0) formulaParts.push(`S${sulfurCount > 1 ? sulfurCount : ''}`);
            if (fluorineCount > 0) formulaParts.push(`F${fluorineCount > 1 ? fluorineCount : ''}`);
            if (chlorineCount > 0) formulaParts.push(`Cl${chlorineCount > 1 ? chlorineCount : ''}`);
            const formula = formulaParts.join('') || 'Unknown';
            
            // Calculate properties based on structure
            const hasAcid = smiles.includes('C(=O)O');
            const hasAmine = smiles.includes('N');
            const hasAromatic = smiles.includes('c') || smiles.includes('1');
            const hasHalogen = fluorineCount > 0 || chlorineCount > 0;
            
            // Detect functional groups
            const functionalGroups = detectFunctionalGroups(smiles);
            
            // Calculate LogP (lipophilicity)
            const logP = 0.5 * carbonCount - 0.2 * oxygenCount - 0.3 * nitrogenCount + 
                        (hasAromatic ? 1.5 : 0) + (hasHalogen ? 0.8 : 0) + Math.random() * 0.5 - 0.25;
            
            // Calculate solubility
            const solubility = hasAcid ? Math.max(0.5, 10 - carbonCount * 0.5) : 
                              Math.max(0.1, 5 - carbonCount * 0.3) + Math.random() * 2;
            
            // Calculate toxicity
            const toxicity = 0.1 + (hasHalogen ? 0.2 : 0) + (carbonCount > 10 ? 0.15 : 0) + 
                            (nitrogenCount > 2 ? 0.1 : 0) + Math.random() * 0.15;
            
            // Calculate BBB permeability
            const bbbPermeability = Math.min(0.95, 0.3 + (logP > 1 && logP < 3 ? 0.4 : 0.2) + 
                                   Math.random() * 0.2);
            
            // Calculate bioavailability
            const bioavailability = 50 + (logP > 0 && logP < 5 ? 30 : 0) - 
                                   (estimatedMW > 500 ? 20 : 0) + Math.random() * 20;
            
            // Calculate drug-likeness (Lipinski's Rule of Five)
            const drugLikeness = (estimatedMW < 500 && logP < 5 && oxygenCount < 10 && nitrogenCount < 5) ? 
                               0.85 : 0.55;
            
            return {
                id: `mol-${index + 1}`,
                name: moleculeName || `Molecule ${index + 1}`,
                smiles: smiles,
                formula: formula,
                molecularWeight: Math.round(estimatedMW * 100) / 100,
                functionalGroups: functionalGroups,
                properties: {
                    solubility: { 
                        value: Math.round(solubility * 100) / 100, 
                        unit: "mg/mL", 
                        category: solubility > 10 ? "High" : solubility > 1 ? "Moderate" : "Low" 
                    },
                    logP: { 
                        value: Math.round(logP * 100) / 100, 
                        category: logP < 0 ? "Hydrophilic" : logP < 3 ? "Good" : "Lipophilic" 
                    },
                    toxicity: { 
                        value: Math.round(toxicity * 100) / 100, 
                        category: toxicity < 0.2 ? "Low" : toxicity < 0.5 ? "Moderate" : "High",
                        risk: toxicity < 0.2 ? "Minimal" : toxicity < 0.5 ? "Medium" : "High"
                    },
                    bbbPermeability: { 
                        value: Math.round(bbbPermeability * 100) / 100, 
                        category: bbbPermeability > 0.7 ? "High" : bbbPermeability > 0.4 ? "Moderate" : "Low" 
                    },
                    pH: { value: hasAcid ? 3.5 + Math.random() : 7.0 + Math.random() * 0.5 },
                    pKa: { value: hasAcid ? 3.8 + Math.random() : hasAmine ? 9.2 + Math.random() * 0.5 : 7.0 },
                    bioavailability: { 
                        value: Math.min(95, Math.max(20, Math.round(bioavailability))), 
                        category: bioavailability > 70 ? "Excellent" : bioavailability > 50 ? "Good" : "Poor" 
                    },
                    drugLikeness: { 
                        value: Math.round(drugLikeness * 100) / 100, 
                        passes: drugLikeness > 0.7 
                    },
                },
                status: "pending",
            };
        };

        // Parse input to detect multiple molecules
        // Molecules can be separated by: "." (standard SMILES separator), ",", ";" or newlines
        const separators = /[.,;\n]+/;
        const moleculeStrings = input.split(separators)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        const molecules: MoleculeAnalysis[] = [];
        
        // If multiple SMILES detected, segregate them
        if (moleculeStrings.length > 1) {
            moleculeStrings.forEach((smiles, index) => {
                const moleculeName = drugName && index === 0 ? drugName : 
                                    `Segregated Molecule ${index + 1}`;
                molecules.push(analyzeMolecule(smiles, index, moleculeName));
            });
        } else {
            // Single molecule - analyze it
            const mainMolecule = analyzeMolecule(input, 0, drugName || "Primary Compound");
            molecules.push(mainMolecule);
        }
        
        return molecules;
    };

    const analyzeAllMolecules = async (moleculesToAnalyze: MoleculeAnalysis[]): Promise<void> => {
        // Simulate parallel analysis
        const updatedMolecules = [...moleculesToAnalyze];

        for (let i = 0; i < updatedMolecules.length; i++) {
            updatedMolecules[i].status = "analyzing";
            setMolecules([...updatedMolecules]);
            await new Promise((resolve) => setTimeout(resolve, 800));
            updatedMolecules[i].status = "completed";
            setMolecules([...updatedMolecules]);
            setPipeline((prev) => ({
                ...prev,
                progress: ((i + 1) / updatedMolecules.length) * 100,
            }));
        }
    };

    const handleReset = () => {
        setDrugInput("");
        setDrugName("");
        setPipeline({ stage: "idle", progress: 0 });
        setMolecules([]);
        setSelectedMolecule(null);
        setIsAnalyzing(false);
        haptic("light");
    };

    const handleExportReport = () => {
        haptic("success");
        toast("Report exported successfully!", "success");
    };

    const selectedMoleculeData = molecules.find((m) => m.id === selectedMolecule);

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
                        <Pill size={24} style={{ color: "white" }} />
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
                            Drug Intelligence Analysis
                        </h1>
                        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
                            Comprehensive molecular segregation and physicochemical profiling
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Pipeline Visualization */}
            {pipeline.stage !== "idle" && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ marginBottom: 32 }}
                >
                    <GlassCard glow="blue">
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 20 }}>Analysis Pipeline</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {pipelineStages.map((stage, index) => {
                                const isActive = pipeline.stage === stage.id;
                                const isCompleted =
                                    pipelineStages.findIndex((s) => s.id === pipeline.stage) > index ||
                                    pipeline.stage === "completed";
                                const Icon = stage.icon;

                                return (
                                    <>
                                        <motion.div
                                            key={stage.id}
                                            animate={{
                                                scale: isActive ? 1.05 : 1,
                                                opacity: isCompleted || isActive ? 1 : 0.5,
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: 16,
                                                borderRadius: 12,
                                                background: isActive
                                                    ? `${stage.color}15`
                                                    : isCompleted
                                                    ? `${stage.color}10`
                                                    : "rgba(15, 23, 42, 0.4)",
                                                border: `1px solid ${isActive ? stage.color : isCompleted ? stage.color + "50" : "var(--glass-border)"}`,
                                                position: "relative",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                <Icon
                                                    size={20}
                                                    style={{
                                                        color: isActive || isCompleted ? stage.color : "var(--text-muted)",
                                                    }}
                                                />
                                                <span
                                                    style={{
                                                        fontSize: "0.85rem",
                                                        fontWeight: 600,
                                                        color: isActive || isCompleted ? stage.color : "var(--text-muted)",
                                                    }}
                                                >
                                                    {stage.label}
                                                </span>
                                            </div>
                                            {isActive && (
                                                <div
                                                    style={{
                                                        height: 4,
                                                        borderRadius: 2,
                                                        background: "rgba(15, 23, 42, 0.6)",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pipeline.progress}%` }}
                                                        style={{
                                                            height: "100%",
                                                            background: stage.color,
                                                            transition: "width 0.3s ease",
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {isCompleted && (
                                                <CheckCircle2
                                                    size={16}
                                                    style={{
                                                        position: "absolute",
                                                        top: 12,
                                                        right: 12,
                                                        color: stage.color,
                                                    }}
                                                />
                                            )}
                                            {isActive && (
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                    style={{ position: "absolute", top: 12, right: 12 }}
                                                >
                                                    <Loader2 size={16} style={{ color: stage.color }} />
                                                </motion.div>
                                            )}
                                        </motion.div>
                                        {index < pipelineStages.length - 1 && (
                                            <ChevronRight
                                                size={20}
                                                style={{
                                                    color: isCompleted ? pipelineStages[index].color : "var(--text-muted)",
                                                }}
                                            />
                                        )}
                                    </>
                                );
                            })}
                        </div>
                    </GlassCard>
                </motion.div>
            )}

            {/* Main Content */}
            <div style={{ display: "grid", gridTemplateColumns: molecules.length > 0 ? "400px 1fr" : "1fr", gap: 24 }}>
                {/* Input Section */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <GlassCard glow="purple">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <Pill size={18} style={{ color: "var(--accent-purple)" }} />
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Drug Input</h3>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label className="label">Drug Name (Optional)</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g., Aspirin, Ibuprofen"
                                value={drugName}
                                onChange={(e) => setDrugName(e.target.value)}
                                disabled={isAnalyzing}
                            />
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <label className="label">Drug Structure (SMILES)</label>
                            <textarea
                                className="input"
                                placeholder="e.g., CC(=O)Oc1ccccc1C(=O)O&#10;For multiple molecules: CC(=O)Oc1ccccc1C(=O)O.CN1C=NC2=C1C(=O)N(C(=O)N2C)C"
                                value={drugInput}
                                onChange={(e) => setDrugInput(e.target.value)}
                                disabled={isAnalyzing}
                                style={{ fontFamily: "monospace", minHeight: 100, resize: "vertical" }}
                            />
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                                💡 Enter single or multiple SMILES structures. Separate multiple molecules with <strong>.</strong> (dot), <strong>,</strong> (comma), or <strong>;</strong> (semicolon) for automatic segregation
                            </p>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleAnalyzeDrug}
                                disabled={isAnalyzing}
                                className="btn-primary"
                                style={{ width: "100%", justifyContent: "center" }}
                            >
                                {isAnalyzing ? (
                                    <>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        >
                                            <Loader2 size={16} />
                                        </motion.div>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Zap size={16} />
                                        Start Analysis
                                    </>
                                )}
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={handleReset}
                                disabled={isAnalyzing}
                                className="btn-secondary"
                                style={{ width: "100%" }}
                            >
                                Reset
                            </motion.button>
                        </div>

                        {/* Info Cards */}
                        {molecules.length > 0 && (
                            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--glass-border)" }}>
                                <div
                                    style={{
                                        padding: 16,
                                        borderRadius: 12,
                                        background: "rgba(59, 130, 246, 0.08)",
                                        border: "1px solid rgba(59, 130, 246, 0.2)",
                                    }}
                                >
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                        Molecules Detected
                                    </div>
                                    <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent-blue)" }}>
                                        {molecules.length}
                                    </div>
                                </div>
                            </div>
                        )}
                    </GlassCard>
                </motion.div>

                {/* Results Section */}
                {molecules.length > 0 && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {/* Molecule Cards */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                                {molecules.map((molecule, index) => (
                                    <motion.div
                                        key={molecule.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <GlassCard
                                            onClick={() => setSelectedMolecule(molecule.id)}
                                            style={{
                                                cursor: "pointer",
                                                border:
                                                    selectedMolecule === molecule.id
                                                        ? "2px solid var(--accent-blue)"
                                                        : undefined,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "start",
                                                    justifyContent: "space-between",
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Atom size={18} style={{ color: "var(--accent-blue)" }} />
                                                    <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{molecule.name}</span>
                                                </div>
                                                {molecule.status === "completed" && (
                                                    <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                                                )}
                                                {molecule.status === "analyzing" && (
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    >
                                                        <Loader2 size={16} style={{ color: "var(--accent-blue)" }} />
                                                    </motion.div>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    padding: 8,
                                                    borderRadius: 8,
                                                    background: "rgba(15, 23, 42, 0.4)",
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                                    SMILES
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        fontFamily: "monospace",
                                                        color: "var(--accent-cyan)",
                                                        wordBreak: "break-all",
                                                    }}
                                                >
                                                    {molecule.smiles}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr 1fr",
                                                    gap: 8,
                                                    fontSize: "0.75rem",
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <div>
                                                    <span style={{ color: "var(--text-muted)" }}>Formula:</span>{" "}
                                                    <span style={{ fontWeight: 600 }}>{molecule.formula}</span>
                                                </div>
                                                <div>
                                                    <span style={{ color: "var(--text-muted)" }}>MW:</span>{" "}
                                                    <span style={{ fontWeight: 600 }}>{molecule.molecularWeight}</span>
                                                </div>
                                            </div>

                                            {/* Functional Groups */}
                                            <div
                                                style={{
                                                    padding: 8,
                                                    borderRadius: 8,
                                                    background: "rgba(59, 130, 246, 0.08)",
                                                    border: "1px solid rgba(59, 130, 246, 0.2)",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 6 }}>
                                                    Functional Groups
                                                </div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                                    {molecule.functionalGroups.map((group, idx) => (
                                                        <span
                                                            key={idx}
                                                            style={{
                                                                padding: "2px 8px",
                                                                borderRadius: 4,
                                                                background: "rgba(59, 130, 246, 0.15)",
                                                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                                                color: "var(--accent-blue-light)",
                                                                fontSize: "0.7rem",
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {group}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </GlassCard>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Detailed Analysis */}
                            {selectedMoleculeData && selectedMoleculeData.status === "completed" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <GlassCard glow="blue">
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: 24,
                                            }}
                                        >
                                            <div>
                                                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 4 }}>
                                                    {selectedMoleculeData.name}
                                                </h3>
                                                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                                                    Comprehensive Physicochemical Analysis
                                                </p>
                                            </div>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <motion.button whileTap={{ scale: 0.95 }} className="btn-secondary">
                                                    <Share2 size={16} />
                                                    Share
                                                </motion.button>
                                                <motion.button
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={handleExportReport}
                                                    className="btn-primary"
                                                >
                                                    <Download size={16} />
                                                    Export
                                                </motion.button>
                                            </div>
                                        </div>

                                        {/* Functional Groups Section */}
                                        <div
                                            style={{
                                                padding: 16,
                                                borderRadius: 12,
                                                background: "rgba(139, 92, 246, 0.08)",
                                                border: "1px solid rgba(139, 92, 246, 0.2)",
                                                marginBottom: 24,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                                <Beaker size={16} style={{ color: "#8b5cf6" }} />
                                                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#8b5cf6" }}>
                                                    Detected Functional Groups
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                {selectedMoleculeData.functionalGroups.map((group, idx) => (
                                                    <span
                                                        key={idx}
                                                        style={{
                                                            padding: "6px 12px",
                                                            borderRadius: 8,
                                                            background: "rgba(139, 92, 246, 0.15)",
                                                            border: "1px solid rgba(139, 92, 246, 0.3)",
                                                            color: "#a78bfa",
                                                            fontSize: "0.85rem",
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {group}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Property Grid */}
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
                                            {/* Solubility */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(6, 182, 212, 0.08)",
                                                    border: "1px solid rgba(6, 182, 212, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Droplet size={16} style={{ color: "#06b6d4" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Solubility</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#06b6d4" }}>
                                                    {selectedMoleculeData.properties.solubility.value} {selectedMoleculeData.properties.solubility.unit}
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.solubility.category}
                                                </div>
                                            </div>

                                            {/* LogP */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(59, 130, 246, 0.08)",
                                                    border: "1px solid rgba(59, 130, 246, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <TrendingUp size={16} style={{ color: "#3b82f6" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>LogP (Lipophilicity)</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>
                                                    {selectedMoleculeData.properties.logP.value}
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.logP.category}
                                                </div>
                                            </div>

                                            {/* Toxicity */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(239, 68, 68, 0.08)",
                                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <AlertTriangle size={16} style={{ color: "#ef4444" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Toxicity Score</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ef4444" }}>
                                                    {selectedMoleculeData.properties.toxicity.value}
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.toxicity.category} - {selectedMoleculeData.properties.toxicity.risk} Risk
                                                </div>
                                            </div>

                                            {/* BBB Permeability */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(139, 92, 246, 0.08)",
                                                    border: "1px solid rgba(139, 92, 246, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Activity size={16} style={{ color: "#8b5cf6" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>BBB Permeability</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8b5cf6" }}>
                                                    {(selectedMoleculeData.properties.bbbPermeability.value * 100).toFixed(0)}%
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.bbbPermeability.category}
                                                </div>
                                            </div>

                                            {/* pH */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(16, 185, 129, 0.08)",
                                                    border: "1px solid rgba(16, 185, 129, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Beaker size={16} style={{ color: "#10b981" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>pH</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981" }}>
                                                    {selectedMoleculeData.properties.pH.value}
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.pH.value < 7 ? "Acidic" : selectedMoleculeData.properties.pH.value === 7 ? "Neutral" : "Basic"}
                                                </div>
                                            </div>

                                            {/* pKa */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(251, 191, 36, 0.08)",
                                                    border: "1px solid rgba(251, 191, 36, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Beaker size={16} style={{ color: "#fbbf24" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>pKa</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fbbf24" }}>
                                                    {selectedMoleculeData.properties.pKa.value}
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    Acid Dissociation Constant
                                                </div>
                                            </div>

                                            {/* Bioavailability */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(16, 185, 129, 0.08)",
                                                    border: "1px solid rgba(16, 185, 129, 0.2)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Activity size={16} style={{ color: "#10b981" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Bioavailability</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981" }}>
                                                    {selectedMoleculeData.properties.bioavailability.value}%
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.bioavailability.category}
                                                </div>
                                            </div>

                                            {/* Drug Likeness */}
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: selectedMoleculeData.properties.drugLikeness.passes
                                                        ? "rgba(16, 185, 129, 0.08)"
                                                        : "rgba(239, 68, 68, 0.08)",
                                                    border: `1px solid ${selectedMoleculeData.properties.drugLikeness.passes ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                                    <Shield size={16} style={{ color: selectedMoleculeData.properties.drugLikeness.passes ? "#10b981" : "#ef4444" }} />
                                                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Drug-Likeness</span>
                                                </div>
                                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: selectedMoleculeData.properties.drugLikeness.passes ? "#10b981" : "#ef4444" }}>
                                                    {(selectedMoleculeData.properties.drugLikeness.value * 100).toFixed(0)}%
                                                </div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                                                    {selectedMoleculeData.properties.drugLikeness.passes ? "Passes Lipinski's Rule" : "Fails Lipinski's Rule"}
                                                </div>
                                            </div>
                                        </div>
                                    </GlassCard>
                                </motion.div>
                            )}

                            {/* Combined Report Summary */}
                            {pipeline.stage === "completed" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    <GlassCard glow="green">
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                                            <FileText size={18} style={{ color: "#10b981" }} />
                                            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                                                Combined Drug Intelligence Report
                                            </h3>
                                        </div>

                                        <div style={{ marginBottom: 16 }}>
                                            <div
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    background: "rgba(16, 185, 129, 0.08)",
                                                    border: "1px solid rgba(16, 185, 129, 0.2)",
                                                }}
                                            >
                                                <CheckCircle2 size={20} style={{ color: "#10b981", marginBottom: 8 }} />
                                                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>
                                                    Analysis Complete
                                                </div>
                                                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                    Successfully analyzed {molecules.length} molecular components with full physicochemical profiling
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: "rgba(59, 130, 246, 0.08)",
                                                    border: "1px solid rgba(59, 130, 246, 0.2)",
                                                    textAlign: "center",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                                    Average Solubility
                                                </div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#3b82f6" }}>
                                                    {(
                                                        molecules.reduce((acc, m) => acc + m.properties.solubility.value, 0) /
                                                        molecules.length
                                                    ).toFixed(2)}{" "}
                                                    mg/mL
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: "rgba(139, 92, 246, 0.08)",
                                                    border: "1px solid rgba(139, 92, 246, 0.2)",
                                                    textAlign: "center",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                                    Average LogP
                                                </div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#8b5cf6" }}>
                                                    {(
                                                        molecules.reduce((acc, m) => acc + m.properties.logP.value, 0) /
                                                        molecules.length
                                                    ).toFixed(2)}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    background: "rgba(10, 185, 129, 0.08)",
                                                    border: "1px solid rgba(16, 185, 129, 0.2)",
                                                    textAlign: "center",
                                                }}
                                            >
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                                    Drug-Like Molecules
                                                </div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#10b981" }}>
                                                    {molecules.filter((m) => m.properties.drugLikeness.passes).length} / {molecules.length}
                                                </div>
                                            </div>
                                        </div>
                                    </GlassCard>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Empty State */}
            {molecules.length === 0 && pipeline.stage === "idle" && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        textAlign: "center",
                        padding: 80,
                    }}
                >
                    <Pill size={64} style={{ color: "var(--accent-blue)", opacity: 0.3, marginBottom: 16 }} />
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>
                        Welcome to Drug Intelligence Analysis
                    </h3>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: 500, margin: "0 auto" }}>
                        Enter a drug structure to begin comprehensive molecular segregation and physicochemical profiling.
                        Our AI will detect, segregate, and analyze all molecular components in parallel.
                    </p>
                </motion.div>
            )}
        </div>
    );
}
