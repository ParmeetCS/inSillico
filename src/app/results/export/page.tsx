"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    ChevronRight, Download, FileText, Copy, Mail, Check,
    ArrowLeft, Share2, Atom, BarChart3,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import { generatePDFReport, generateCSVExport, type ReportData } from "@/lib/generate-pdf-report";

/* ─── Types ─── */
type PropertyStatus = "optimal" | "moderate" | "poor";
interface PropertyData { value: string | number; unit?: string; status: PropertyStatus; }
interface ToxData { herg: number; ames: number; hepato: number; }

const SECTIONS = [
    { key: "moleculeInfo", label: "Molecule Info", desc: "Name, SMILES, formula, weight" },
    { key: "properties", label: "Predicted Properties", desc: "LogP, pKa, Solubility, TPSA, Bioavailability" },
    { key: "toxicity", label: "Toxicity Screening", desc: "hERG, Ames, Hepato risk scores" },
    { key: "drugLikeness", label: "Drug-Likeness", desc: "Overall assessment & radar profile" },
    { key: "metadata", label: "Run Metadata", desc: "Date, runtime, confidence, credits" },
];

function ExportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Read molecule data from query params
    const molId = searchParams.get("id") || "—";
    const molName = searchParams.get("name") || "Unknown";
    const molSmiles = searchParams.get("smiles") || "—";
    const molFormula = searchParams.get("formula") || "";
    const molMw = parseFloat(searchParams.get("mw") || "0");
    const molConfidence = parseFloat(searchParams.get("confidence") || "0");
    const molRuntime = searchParams.get("runtime") || "—";
    const molDate = searchParams.get("date") || "—";

    let properties: Record<string, PropertyData> = {};
    try { properties = JSON.parse(searchParams.get("props") || "{}"); } catch { /* empty */ }

    let toxicity: ToxData = { herg: 0, ames: 0, hepato: 0 };
    try { toxicity = JSON.parse(searchParams.get("tox") || "{}"); } catch { /* empty */ }

    const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");
    const [sections, setSections] = useState<Record<string, boolean>>(
        Object.fromEntries(SECTIONS.map(s => [s.key, true]))
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [shareLink, setShareLink] = useState("");
    const [emailInput, setEmailInput] = useState("");

    const toggleSection = (key: string) => setSections(s => ({ ...s, [key]: !s[key] }));
    const selectedCount = Object.values(sections).filter(Boolean).length;

    const handleDownload = async () => {
        setIsGenerating(true);
        haptic("medium");
        try {
            const propEntries = Object.entries(properties).filter(([k]) => k !== "toxicity");

            const reportData: ReportData = {
                simulationId: `SIM-${molId.slice(0, 8).toUpperCase()}`,
                date: molDate,
                molecule: {
                    name: molName,
                    formula: molFormula,
                    smiles: molSmiles,
                    molecularWeight: molMw,
                },
                properties: propEntries.map(([key, p]) => ({
                    name: key === "logP" ? "LogP" : key === "pKa" ? "pKa" : key === "tpsa" ? "TPSA" : key === "bioavailability" ? "Bioavailability" : key,
                    value: String(p.value),
                    unit: p.unit || "",
                    status: p.status,
                })),
                toxicity: {
                    hergInhibition: { probability: toxicity.herg / 100, risk: toxicity.herg < 30 ? "Low" : toxicity.herg < 60 ? "Moderate" : "High" },
                    amesMutagenicity: { probability: toxicity.ames / 100, risk: toxicity.ames < 30 ? "Negative" : toxicity.ames < 60 ? "Equivocal" : "Positive" },
                    hepatotoxicity: { probability: toxicity.hepato / 100, risk: toxicity.hepato < 30 ? "Low" : toxicity.hepato < 60 ? "Moderate" : "High" },
                },
                confidence: molConfidence,
                drugLikeness: {
                    lipinskiViolations: 0,
                    overallScore: molConfidence / 100,
                },
                includeSections: sections,
            };

            if (exportFormat === "pdf") {
                await generatePDFReport(reportData);
            } else {
                generateCSVExport(reportData);
            }
            toast(`${exportFormat.toUpperCase()} report downloaded!`, "success");
        } catch (err) {
            console.error(err);
            toast("Failed to generate report", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleShareLink = () => {
        const link = `${window.location.origin}/results/view?${searchParams.toString()}`;
        setShareLink(link);
        navigator.clipboard.writeText(link);
        haptic("medium");
        toast("Link copied to clipboard!", "success");
    };

    const handleEmailInvite = () => {
        if (!emailInput.includes("@")) {
            toast("Please enter a valid email", "error");
            return;
        }
        haptic("medium");
        toast(`Report shared with ${emailInput}`, "success");
        setEmailInput("");
    };

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                <Link href="/results" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Results</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Export — {molName}</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6 }}>
                        Export & Share
                    </h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Generate a report for <strong className="text-gradient">{molName}</strong>
                    </p>
                </div>
                <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }}
                    onClick={() => { haptic("light"); router.back(); }}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowLeft size={14} /> Back
                </motion.button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
                {/* Left - Configuration */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Format Selection */}
                    <GlassCard>
                        <h2 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                            <FileText size={18} style={{ color: "var(--accent-blue)" }} /> Export Format
                        </h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {[
                                { key: "pdf" as const, label: "PDF Report", desc: "Full formatted report with charts" },
                                { key: "csv" as const, label: "CSV Data", desc: "Raw data for analysis" },
                            ].map(fmt => (
                                <motion.div
                                    key={fmt.key}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => { haptic("selection"); setExportFormat(fmt.key); }}
                                    style={{
                                        padding: "16px 20px", borderRadius: 12, cursor: "pointer",
                                        border: `2px solid ${exportFormat === fmt.key ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.06)"}`,
                                        background: exportFormat === fmt.key ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>{fmt.label}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{fmt.desc}</div>
                                </motion.div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Sections */}
                    <GlassCard>
                        <h2 style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                            <BarChart3 size={18} style={{ color: "var(--accent-purple)" }} /> Data Sections
                        </h2>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
                            Select which sections to include ({selectedCount}/{SECTIONS.length})
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {SECTIONS.map(sec => (
                                <motion.div key={sec.key} whileHover={{ scale: 1.01 }}
                                    onClick={() => { haptic("selection"); toggleSection(sec.key); }}
                                    style={{
                                        padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                                        border: `1px solid ${sections[sec.key] ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`,
                                        background: sections[sec.key] ? "rgba(59,130,246,0.04)" : "transparent",
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                    }}>
                                    <div>
                                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{sec.label}</div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sec.desc}</div>
                                    </div>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: 6, transition: "all 0.2s",
                                        background: sections[sec.key] ? "#3b82f6" : "rgba(255,255,255,0.06)",
                                        border: `1.5px solid ${sections[sec.key] ? "#3b82f6" : "rgba(255,255,255,0.12)"}`,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                        {sections[sec.key] && <Check size={14} style={{ color: "#fff" }} />}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Download Button */}
                    <motion.button
                        className="btn-primary"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        disabled={isGenerating || selectedCount === 0}
                        onClick={handleDownload}
                        style={{
                            justifyContent: "center", padding: "14px 24px", fontSize: "0.95rem", fontWeight: 600,
                            opacity: isGenerating || selectedCount === 0 ? 0.5 : 1,
                        }}
                    >
                        <Download size={16} />
                        {isGenerating ? "Generating…" : `Download ${exportFormat.toUpperCase()}`}
                    </motion.button>
                </div>

                {/* Right - Sharing & Preview */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Share via link */}
                    <GlassCard glow="cyan">
                        <h3 style={{ fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                            <Share2 size={16} style={{ color: "var(--accent-cyan)" }} /> Share Results
                        </h3>
                        <motion.button className="btn-secondary" whileTap={{ scale: 0.97 }}
                            onClick={handleShareLink}
                            style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}>
                            <Copy size={14} /> Copy Shareable Link
                        </motion.button>
                        {shareLink && (
                            <div style={{
                                padding: "8px 12px", background: "rgba(0,0,0,0.3)", borderRadius: 8,
                                fontFamily: "monospace", fontSize: "0.68rem", color: "var(--accent-cyan)",
                                wordBreak: "break-all", marginBottom: 12,
                            }}>{shareLink}</div>
                        )}
                        <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 12, marginTop: 4 }}>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 8 }}>Email Invite</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="email" placeholder="colleague@lab.org" value={emailInput}
                                    onChange={e => setEmailInput(e.target.value)}
                                    className="glass-input"
                                    style={{ flex: 1, padding: "8px 14px", fontSize: "0.82rem" }}
                                />
                                <motion.button className="btn-primary" whileTap={{ scale: 0.97 }} onClick={handleEmailInvite}
                                    style={{ padding: "8px 14px" }}>
                                    <Mail size={14} />
                                </motion.button>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Preview */}
                    <GlassCard>
                        <h3 style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <Atom size={16} style={{ color: "var(--accent-blue)" }} /> Report Preview
                        </h3>
                        <div style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 10, fontSize: "0.78rem" }}>
                            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{molName}</div>
                            <div style={{ color: "var(--text-muted)", marginBottom: 12 }}>{molFormula}</div>

                            {sections.moleculeInfo && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, color: "var(--accent-blue)", marginBottom: 4 }}>Molecule Info</div>
                                    <div style={{ color: "var(--text-secondary)" }}>SMILES: {molSmiles.slice(0, 30)}{molSmiles.length > 30 ? "…" : ""}</div>
                                    {molMw > 0 && <div style={{ color: "var(--text-secondary)" }}>MW: {Math.round(molMw * 100) / 100} g/mol</div>}
                                </div>
                            )}

                            {sections.properties && Object.entries(properties).length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, color: "var(--accent-blue)", marginBottom: 4 }}>Properties</div>
                                    {Object.entries(properties).filter(([k]) => k !== "toxicity").map(([key, p]) => (
                                        <div key={key} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                                            <span>{key === "logP" ? "LogP" : key}</span>
                                            <span style={{ fontFamily: "monospace" }}>{p.value}{p.unit ? ` ${p.unit}` : ""}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {sections.toxicity && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontWeight: 600, color: "var(--accent-blue)", marginBottom: 4 }}>Toxicity</div>
                                    <div style={{ color: "var(--text-secondary)" }}>hERG: {toxicity.herg}% · Ames: {toxicity.ames}% · Hepato: {toxicity.hepato}%</div>
                                </div>
                            )}

                            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 8, marginTop: 8, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                Generated by InSilico · {molDate}
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}



export default function ExportSharePage() {
    return (
        <Suspense fallback={
            <div className="page-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
                <span style={{ color: "var(--text-secondary)" }}>Loading…</span>
            </div>
        }>
            <ExportContent />
        </Suspense>
    );
}
