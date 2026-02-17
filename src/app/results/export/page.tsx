"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight, Download, FileText, Table2, Check,
    Copy, Mail, Send, Link2, Shield, Beaker, Activity,
    Droplets, FlaskConical, TrendingUp, Eye, Lock,
    Atom, BarChart3, Clock, Zap, Maximize2, ArrowLeft,
    CheckCircle2, AlertTriangle, Sparkles
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import {
    generatePDFReport,
    generateCSVExport,
    type ReportData,
} from "@/lib/generate-pdf-report";

/* ─── Hardcoded Demo Data (Aspirin) ─── */
const DEMO_REPORT_DATA: ReportData = {
    simulationId: "SIM-4821",
    date: "2026-02-17",
    molecule: {
        name: "Aspirin",
        formula: "C₉H₈O₄",
        smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
        mw: 180.16,
        iupac: "2-Acetoxybenzoic acid",
        cas: "50-78-2",
        drugBank: "DB00945",
    },
    properties: [
        { label: "LogP", value: 1.43, status: "optimal", description: "Ideal for membrane permeability" },
        { label: "pKa (acidic)", value: 3.49, status: "moderate", description: "Weak acid — mostly ionized at pH 7.4" },
        { label: "Solubility", value: 4.6, unit: "mg/mL", status: "moderate", description: "Moderate aqueous solubility" },
        { label: "TPSA", value: 63.6, unit: "Å²", status: "optimal", description: "Good oral absorption expected" },
        { label: "Bioavailability", value: 68, unit: "%", status: "optimal", description: "Well-absorbed orally" },
        { label: "Toxicity Risk", value: "Low", status: "optimal", description: "Favorable safety profile" },
    ],
    toxicity: [
        { label: "hERG Inhibition", value: 18, risk: "Low" },
        { label: "Ames Mutagenicity", value: 12, risk: "Low" },
        { label: "Hepatotoxicity", value: 25, risk: "Low" },
    ],
    conditions: {
        temperature: "298.15 K",
        pressure: "1.0 atm",
        solvent: "Water (TIP3P)",
        computeCost: "30 credits",
        runtime: "~42 seconds",
        confidence: "94.8%",
    },
    includeSections: {
        moleculeInfo: true,
        properties: true,
        toxicity: true,
        solubilityCurve: true,
        rawMetadata: true,
    },
};

type FormatType = "pdf" | "csv";

const STATUS_COLORS = {
    optimal: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
    moderate: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
    poor: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

function ToxBarMini({ label, value }: { label: string; value: number }) {
    const color = value < 30 ? "#22c55e" : value < 60 ? "#f59e0b" : "#ef4444";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.58rem" }}>
            <span style={{ color: "#64748b", width: 42, flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${value}%`, borderRadius: 2, background: color }} />
            </div>
            <span style={{ color, fontWeight: 600, width: 22, textAlign: "right" }}>{value}%</span>
        </div>
    );
}

export default function ExportSharePage() {
    const [format, setFormat] = useState<FormatType>("pdf");
    const [sections, setSections] = useState({
        moleculeInfo: true,
        properties: true,
        toxicity: true,
        solubilityCurve: true,
        rawMetadata: false,
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [shareLink] = useState("https://platform.insilico-formulate.com/s/x92-alpha-7/res...");
    const [emailInput, setEmailInput] = useState("");
    const [linkExpiry] = useState("7 days");
    const [copied, setCopied] = useState(false);
    const emailRef = useRef<HTMLInputElement>(null);

    const toggleSection = (key: keyof typeof sections) => {
        haptic("selection");
        setSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleDownload = async () => {
        haptic("heavy");
        setIsGenerating(true);

        // Small delay for animation effect
        await new Promise(r => setTimeout(r, 800));

        const reportData: ReportData = {
            ...DEMO_REPORT_DATA,
            includeSections: sections,
        };

        try {
            if (format === "pdf") {
                generatePDFReport(reportData);
                toast("PDF report downloaded successfully!", "success");
            } else {
                generateCSVExport(reportData);
                toast("CSV data exported successfully!", "success");
            }
        } catch {
            toast("Failed to generate report", "error");
        }

        setIsGenerating(false);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareLink);
        haptic("light");
        setCopied(true);
        toast("Share link copied!", "success");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendEmail = () => {
        if (!emailInput.trim()) {
            toast("Please enter an email address", "warning");
            return;
        }
        haptic("light");
        toast(`Invitation sent to ${emailInput}`, "success");
        setEmailInput("");
    };

    const selectedCount = Object.values(sections).filter(Boolean).length;

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <Link href="/results" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Results</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Export & Share</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6 }}>
                        Export & Share
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        {DEMO_REPORT_DATA.molecule.name} — {DEMO_REPORT_DATA.molecule.formula} · Simulation {DEMO_REPORT_DATA.simulationId}
                    </p>
                </div>
                <span style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20,
                    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                    fontSize: "0.78rem", fontWeight: 600, color: "#22c55e",
                }}>
                    <CheckCircle2 size={14} /> ANALYSIS COMPLETE
                </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
                {/* ────── Left Column ────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Export Configuration */}
                    <GlassCard padding="24px">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <FileText size={16} style={{ color: "var(--accent-blue)" }} />
                            </div>
                            <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Export Configuration</h2>
                        </div>

                        {/* Format Toggle */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 10 }}>
                                FILE FORMAT
                            </div>
                            <div style={{
                                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
                                background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 3,
                                border: "1px solid var(--glass-border)",
                            }}>
                                {([
                                    { key: "pdf" as const, label: "PDF Report", icon: FileText },
                                    { key: "csv" as const, label: "CSV Data", icon: Table2 },
                                ]).map(opt => {
                                    const active = format === opt.key;
                                    return (
                                        <motion.button
                                            key={opt.key}
                                            onClick={() => { haptic("selection"); setFormat(opt.key); }}
                                            whileTap={{ scale: 0.98 }}
                                            style={{
                                                padding: "10px 16px", borderRadius: 10,
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                                fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
                                                border: "none",
                                                background: active
                                                    ? "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))"
                                                    : "transparent",
                                                color: active ? "#60a5fa" : "#64748b",
                                                transition: "all 0.2s",
                                                boxShadow: active ? "0 0 20px rgba(59,130,246,0.1)" : "none",
                                            }}
                                        >
                                            <opt.icon size={16} />
                                            {opt.label}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Include Data Points */}
                        <div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 12 }}>
                                INCLUDE DATA POINTS
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {[
                                    { key: "moleculeInfo" as const, label: "Molecule Information", desc: "Compound name, formula, SMILES, CAS number", icon: Atom },
                                    { key: "properties" as const, label: "Physicochemical Properties", desc: "LogP, pKa, TPSA, solubility, bioavailability", icon: BarChart3 },
                                    { key: "toxicity" as const, label: "Toxicity Screening", desc: "hERG, Ames mutagenicity, hepatotoxicity risk", icon: Shield },
                                    { key: "solubilityCurve" as const, label: "Solubility Curves", desc: "pH-dependent solubility profiles", icon: Activity },
                                    { key: "rawMetadata" as const, label: "Raw Metadata", desc: "Include timestamps, operator ID, and machine config", icon: Clock },
                                ].map(item => {
                                    const checked = sections[item.key];
                                    return (
                                        <motion.div
                                            key={item.key}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => toggleSection(item.key)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 14,
                                                padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                                                background: checked ? "rgba(59,130,246,0.05)" : "rgba(0,0,0,0.1)",
                                                border: `1px solid ${checked ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)"}`,
                                                transition: "all 0.2s",
                                            }}
                                        >
                                            {/* Checkbox */}
                                            <div style={{
                                                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                                border: `2px solid ${checked ? "#3b82f6" : "#475569"}`,
                                                background: checked ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "transparent",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                transition: "all 0.2s",
                                            }}>
                                                {checked && <Check size={13} style={{ color: "#fff" }} />}
                                            </div>

                                            <div style={{
                                                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                                                background: checked ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.04)",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                            }}>
                                                <item.icon size={16} style={{ color: checked ? "#60a5fa" : "#64748b" }} />
                                            </div>

                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: checked ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                    {item.label}
                                                </div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                    {item.desc}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Download Button */}
                        <motion.button
                            className="btn-primary"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownload}
                            disabled={isGenerating || selectedCount === 0}
                            style={{
                                width: "100%", justifyContent: "center", padding: "14px 24px",
                                marginTop: 24, fontSize: "0.9rem",
                                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                                opacity: selectedCount === 0 ? 0.5 : 1,
                            }}
                        >
                            {isGenerating ? (
                                <>
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    >
                                        <Sparkles size={18} />
                                    </motion.div>
                                    Generating Report…
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Download {format === "pdf" ? "Report" : "CSV Data"}
                                </>
                            )}
                        </motion.button>
                    </GlassCard>

                    {/* Collaborate Section */}
                    <GlassCard padding="24px">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(34,197,94,0.1))",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <Link2 size={16} style={{ color: "var(--accent-cyan)" }} />
                                </div>
                                <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Collaborate</h2>
                            </div>
                            <span style={{
                                padding: "4px 12px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 600,
                                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                                color: "#60a5fa",
                            }}>
                                Link expires in {linkExpiry}
                            </span>
                        </div>

                        {/* Share Link */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8 }}>
                                SHARE VIA SECURE LINK
                            </div>
                            <div style={{
                                display: "flex", gap: 8, alignItems: "center",
                            }}>
                                <div style={{
                                    flex: 1, display: "flex", alignItems: "center", gap: 8,
                                    padding: "10px 14px", borderRadius: 10,
                                    background: "rgba(0,0,0,0.25)",
                                    border: "1px solid var(--glass-border)",
                                }}>
                                    <Lock size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                    <span style={{
                                        fontSize: "0.82rem", color: "var(--text-secondary)",
                                        fontFamily: "monospace",
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                                    }}>
                                        {shareLink}
                                    </span>
                                </div>
                                <motion.button
                                    className="btn-secondary"
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleCopyLink}
                                    style={{
                                        padding: "10px 16px", gap: 6, fontSize: "0.82rem",
                                        borderColor: copied ? "rgba(34,197,94,0.4)" : undefined,
                                        color: copied ? "#22c55e" : undefined,
                                    }}
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? "Copied" : "Copy"}
                                </motion.button>
                            </div>
                        </div>

                        {/* Email Invite */}
                        <div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8 }}>
                                INVITE VIA EMAIL
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <div style={{ flex: 1, position: "relative" }}>
                                    <Mail size={15} style={{
                                        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                                        color: "var(--text-muted)",
                                    }} />
                                    <input
                                        ref={emailRef}
                                        className="input"
                                        placeholder="colleague@lab.com"
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleSendEmail()}
                                        style={{ paddingLeft: 36 }}
                                    />
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleSendEmail}
                                    style={{
                                        padding: "10px 18px", borderRadius: 10,
                                        background: "none", border: "none",
                                        color: "#3b82f6", fontSize: "0.85rem", fontWeight: 600,
                                        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                                    }}
                                >
                                    <Send size={14} />
                                    Send
                                </motion.button>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Back link */}
                    <Link
                        href="/results"
                        className="btn-secondary"
                        style={{ justifyContent: "center" }}
                        onClick={() => haptic("light")}
                    >
                        <ArrowLeft size={14} /> Back to Results
                    </Link>
                </div>

                {/* ────── Right Column — Report Preview ────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Report Preview</h3>
                        <button
                            onClick={() => { haptic("light"); toast("Full preview coming soon", "info"); }}
                            style={{
                                background: "none", border: "none", color: "var(--accent-blue)",
                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                            }}
                        >
                            <Maximize2 size={13} /> Expand
                        </button>
                    </div>

                    {/* PDF Preview Card */}
                    <GlassCard padding="0" glow="blue" style={{
                        overflow: "hidden",
                        background: "linear-gradient(180deg, #0c1220 0%, #0a0f1e 100%)",
                    }}>
                        {/* Preview header bar */}
                        <div style={{
                            padding: "14px 18px",
                            background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05))",
                            borderBottom: "1px solid var(--glass-border)",
                            display: "flex", alignItems: "center", gap: 10,
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <FileText size={14} style={{ color: "#fff" }} />
                            </div>
                            <div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                                    {DEMO_REPORT_DATA.molecule.name} Report
                                </div>
                                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                                    CONFIDENTIAL · INTERNAL USE
                                </div>
                            </div>
                        </div>

                        {/* Preview content */}
                        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                            {/* Summary Stats Row */}
                            <AnimatePresence>
                                {sections.moleculeInfo && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            display: "grid", gridTemplateColumns: "1fr 1fr",
                                            gap: 10, marginBottom: 4,
                                        }}>
                                            <div style={{
                                                padding: "12px 14px", borderRadius: 10,
                                                background: "rgba(255,255,255,0.02)",
                                                border: "1px solid rgba(255,255,255,0.06)",
                                            }}>
                                                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>
                                                    COMPOUNDS
                                                </div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>1</div>
                                            </div>
                                            <div style={{
                                                padding: "12px 14px", borderRadius: 10,
                                                background: "rgba(255,255,255,0.02)",
                                                border: "1px solid rgba(255,255,255,0.06)",
                                            }}>
                                                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>
                                                    AVG. CONFIDENCE
                                                </div>
                                                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#22c55e" }}>
                                                    {DEMO_REPORT_DATA.conditions.confidence}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Toxicity Section */}
                            <AnimatePresence>
                                {sections.toxicity && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            background: "rgba(255,255,255,0.02)",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}>
                                            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>
                                                TOXICITY SCREENING
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                                {DEMO_REPORT_DATA.toxicity.map(t => (
                                                    <ToxBarMini key={t.label} label={t.label.split(" ")[0]} value={t.value} />
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Properties Mini Distribution */}
                            <AnimatePresence>
                                {sections.properties && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            background: "rgba(255,255,255,0.02)",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}>
                                            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>
                                                DISTRIBUTION ANALYSIS
                                            </div>
                                            {/* Mini bars for properties */}
                                            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 50, marginBottom: 4 }}>
                                                {[42, 68, 35, 85, 60, 78, 45, 92, 55, 70, 48, 88].map((h, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${h}%` }}
                                                        transition={{ delay: i * 0.05, duration: 0.4 }}
                                                        style={{
                                                            flex: 1, borderRadius: "2px 2px 0 0",
                                                            background: `linear-gradient(180deg, ${i % 3 === 0 ? "#3b82f6" : i % 3 === 1 ? "#8b5cf6" : "#06b6d4"}, transparent)`,
                                                            opacity: 0.7,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Molecular Data Table Preview */}
                            <AnimatePresence>
                                {sections.properties && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            background: "rgba(255,255,255,0.02)",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}>
                                            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>
                                                MOLECULAR DATA SNIPPET
                                            </div>
                                            <table style={{ width: "100%", fontSize: "0.6rem", borderCollapse: "collapse" }}>
                                                <thead>
                                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                                        <th style={{ padding: "4px 6px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Property</th>
                                                        <th style={{ padding: "4px 6px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Value</th>
                                                        <th style={{ padding: "4px 6px", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {DEMO_REPORT_DATA.properties.slice(0, 4).map((p, i) => {
                                                        const sc = STATUS_COLORS[p.status];
                                                        return (
                                                            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                                                <td style={{ padding: "4px 6px", color: "var(--text-secondary)", fontWeight: 500 }}>{p.label}</td>
                                                                <td style={{ padding: "4px 6px", textAlign: "center", color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                                                                    {p.value} {p.unit || ""}
                                                                </td>
                                                                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                                                                    <span style={{
                                                                        padding: "1px 6px", borderRadius: 8,
                                                                        fontSize: "0.55rem", fontWeight: 600,
                                                                        background: sc.bg, color: sc.text,
                                                                    }}>
                                                                        {p.status.toUpperCase()}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Run Details Preview */}
                            <AnimatePresence>
                                {sections.rawMetadata && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            background: "rgba(255,255,255,0.02)",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}>
                                            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>
                                                RUN METADATA
                                            </div>
                                            {Object.entries(DEMO_REPORT_DATA.conditions).slice(0, 3).map(([k, v]) => (
                                                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "0.6rem" }}>
                                                    <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>{k}</span>
                                                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Preview footer */}
                        <div style={{
                            padding: "10px 18px",
                            borderTop: "1px solid var(--glass-border)",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                            <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                                Generated by InSilico Formulator · {DEMO_REPORT_DATA.date}
                            </span>
                            <span style={{ fontSize: "0.6rem", color: "var(--accent-blue)" }}>
                                Page 1 of 1
                            </span>
                        </div>
                    </GlassCard>

                    {/* Format info card */}
                    <GlassCard padding="16px" glow="purple">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: format === "pdf"
                                    ? "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.1))"
                                    : "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(6,182,212,0.1))",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                {format === "pdf" ? (
                                    <FileText size={18} style={{ color: "#ef4444" }} />
                                ) : (
                                    <Table2 size={18} style={{ color: "#22c55e" }} />
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                                    {format === "pdf" ? "PDF Report" : "CSV Data Export"}
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    {format === "pdf"
                                        ? "Branded, publication-ready report with properties table, toxicity bars, metadata, and executive summary"
                                        : "Raw data in comma-separated format, compatible with Excel, Google Sheets, and data analysis tools"
                                    }
                                </div>
                            </div>
                        </div>
                        <div style={{
                            marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap",
                        }}>
                            {format === "pdf" ? (
                                <>
                                    {["Branded Header", "Properties Table", "Toxicity Bars", "Run Details"].map(tag => (
                                        <span key={tag} style={{
                                            padding: "2px 8px", borderRadius: 6, fontSize: "0.62rem", fontWeight: 600,
                                            background: "rgba(59,130,246,0.08)", color: "#60a5fa",
                                            border: "1px solid rgba(59,130,246,0.15)",
                                        }}>
                                            {tag}
                                        </span>
                                    ))}
                                </>
                            ) : (
                                <>
                                    {["Excel Compatible", "UTF-8 Encoded", "Headers Included", "Machine Readable"].map(tag => (
                                        <span key={tag} style={{
                                            padding: "2px 8px", borderRadius: 6, fontSize: "0.62rem", fontWeight: 600,
                                            background: "rgba(34,197,94,0.08)", color: "#22c55e",
                                            border: "1px solid rgba(34,197,94,0.15)",
                                        }}>
                                            {tag}
                                        </span>
                                    ))}
                                </>
                            )}
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}
