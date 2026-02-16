"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    ArrowLeft,
    FileText,
    Table,
    Download,
    Copy,
    CheckCircle2,
    Link2,
    Mail,
    Clock,
    Shield,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<"pdf" | "csv">("pdf");
    const [copied, setCopied] = useState(false);
    const [includeStructures, setIncludeStructures] = useState(true);
    const [includeCurves, setIncludeCurves] = useState(true);
    const [includeMetadata, setIncludeMetadata] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText("https://insillico.app/share/abc123xyz");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="page-container">
            {/* Back */}
            <Link
                href="/results/SIM-4821"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    marginBottom: 24,
                }}
            >
                <ArrowLeft size={14} />
                Back to Analysis
            </Link>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
                {/* Left */}
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-outfit), sans-serif" }}>
                        Export & Collaborate
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 32 }}>
                        Download your results or share them with your team
                    </p>

                    {/* Export Configuration */}
                    <GlassCard style={{ marginBottom: 24 }}>
                        <h2 style={{ fontWeight: 600, marginBottom: 20 }}>Export Configuration</h2>

                        {/* Format Tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
                            {[
                                { key: "pdf" as const, label: "PDF Report", icon: FileText },
                                { key: "csv" as const, label: "CSV Data", icon: Table },
                            ].map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
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
                                    </button>
                                );
                            })}
                        </div>

                        {/* Include Data Points */}
                        <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Include Data Points</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[
                                { label: "Molecular Structures", checked: includeStructures, onChange: () => setIncludeStructures(!includeStructures) },
                                { label: "Solubility Curves", checked: includeCurves, onChange: () => setIncludeCurves(!includeCurves) },
                                { label: "Raw Metadata", checked: includeMetadata, onChange: () => setIncludeMetadata(!includeMetadata) },
                            ].map((item, i) => (
                                <label
                                    key={i}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "10px 14px",
                                        borderRadius: 8,
                                        background: "rgba(0,0,0,0.2)",
                                        cursor: "pointer",
                                        transition: "background 0.2s ease",
                                    }}
                                >
                                    <div
                                        onClick={item.onChange}
                                        style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: 6,
                                            border: `2px solid ${item.checked ? "var(--accent-blue)" : "var(--glass-border)"}`,
                                            background: item.checked ? "var(--accent-blue)" : "transparent",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            transition: "all 0.2s ease",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {item.checked && <CheckCircle2 size={12} color="white" />}
                                    </div>
                                    <span style={{ fontSize: "0.85rem" }}>{item.label}</span>
                                </label>
                            ))}
                        </div>

                        <button className="btn-primary" style={{ marginTop: 24, width: "100%", justifyContent: "center" }}>
                            <Download size={16} />
                            Download {activeTab === "pdf" ? "PDF Report" : "CSV Data"}
                        </button>
                    </GlassCard>

                    {/* Collaboration */}
                    <GlassCard>
                        <h2 style={{ fontWeight: 600, marginBottom: 20 }}>Collaborate</h2>

                        {/* Share Link */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <Link2 size={16} style={{ color: "var(--accent-blue)" }} />
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Share via Secure Link</span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="text"
                                    className="input"
                                    value="https://insillico.app/share/abc123xyz"
                                    readOnly
                                    style={{ fontSize: "0.8rem", fontFamily: "monospace" }}
                                />
                                <button
                                    onClick={handleCopy}
                                    className="btn-secondary"
                                    style={{ flexShrink: 0, gap: 6 }}
                                >
                                    {copied ? <CheckCircle2 size={14} color="var(--accent-green)" /> : <Copy size={14} />}
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                                <Clock size={12} style={{ color: "var(--text-muted)" }} />
                                <span className="badge badge-queued" style={{ fontSize: "0.7rem" }}>Link expires in 7 days</span>
                            </div>
                        </div>

                        {/* Invite */}
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <Mail size={16} style={{ color: "var(--accent-purple)" }} />
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Invite via Email</span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="colleague@example.com"
                                />
                                <button className="btn-primary" style={{ flexShrink: 0 }}>
                                    Send
                                </button>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                {/* Right — Preview */}
                <div>
                    <GlassCard glow="blue">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <Shield size={16} style={{ color: "var(--accent-blue)" }} />
                            <span style={{ fontWeight: 600 }}>Report Preview</span>
                        </div>

                        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 20 }}>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>COMPOUND</div>
                                <div style={{ fontWeight: 700, fontSize: "1rem" }}>Aspirin Analog MK-482</div>
                            </div>
                            <div style={{ height: 1, background: "var(--glass-border)", margin: "12px 0" }} />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                {[
                                    { label: "LogP", value: "2.45" },
                                    { label: "pKa", value: "3.49" },
                                    { label: "MW", value: "180.16" },
                                    { label: "TPSA", value: "63.6 Å²" },
                                    { label: "Solubility", value: "4.6 mg/mL" },
                                    { label: "Bioavail.", value: "0.85" },
                                ].map((item, i) => (
                                    <div key={i}>
                                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--accent-cyan)" }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ height: 1, background: "var(--glass-border)", margin: "16px 0" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Confidence Score</span>
                                <span className="text-gradient" style={{ fontWeight: 700, fontSize: "1.2rem" }}>94%</span>
                            </div>
                        </div>

                        <div style={{ marginTop: 16, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Version 1.0 • Generated Feb 16, 2026
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}
