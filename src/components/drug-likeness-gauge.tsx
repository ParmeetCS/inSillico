"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2, XCircle, AlertTriangle, Shield, Sparkles,
    Beaker, FlaskConical, Award,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

/* ─── Types ─── */
interface LipinskiRule {
    rule: string;
    value: number;
    threshold: number;
    passed: boolean;
    unit: string;
}

interface DrugLikenessData {
    score: number;
    grade: string;
    qed: number;
    lipinski: {
        violations: number;
        rules: LipinskiRule[];
    };
    veber: {
        violations: number;
        rules: LipinskiRule[];
    };
    pains: {
        alert_count: number;
        passed: boolean;
        alerts: string[];
    };
}

/* ─── Color helpers ─── */
function scoreColor(score: number): string {
    if (score >= 80) return "#22c55e";
    if (score >= 60) return "#3b82f6";
    if (score >= 40) return "#f59e0b";
    return "#ef4444";
}

function gradeColor(grade: string): string {
    if (grade.startsWith("A")) return "#22c55e";
    if (grade.startsWith("B")) return "#3b82f6";
    if (grade.startsWith("C")) return "#f59e0b";
    return "#ef4444";
}

function gradeBg(grade: string): string {
    if (grade.startsWith("A")) return "rgba(34,197,94,0.10)";
    if (grade.startsWith("B")) return "rgba(59,130,246,0.10)";
    if (grade.startsWith("C")) return "rgba(245,158,11,0.10)";
    return "rgba(239,68,68,0.10)";
}

/* ─── Animated Circular Gauge ─── */
function CircularGauge({ score, grade, size = 200 }: { score: number; grade: string; size?: number }) {
    const [animatedScore, setAnimatedScore] = useState(0);

    useEffect(() => {
        // Animate from 0 to target score
        let frame: number;
        const start = Date.now();
        const duration = 1400;
        const animate = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimatedScore(Math.round(eased * score));
            if (progress < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [score]);

    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * 0.75; // 270° arc
    const offset = arcLength * (1 - animatedScore / 100);
    const color = scoreColor(score);

    return (
        <div style={{ position: "relative", width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
                {/* Background arc */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${arcLength} ${circumference}`}
                    strokeLinecap="round"
                />
                {/* Animated foreground arc */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${arcLength} ${circumference}`}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{
                        filter: `drop-shadow(0 0 8px ${color}60)`,
                        transition: "stroke-dashoffset 0.05s linear",
                    }}
                />
                {/* Glow ring */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={`${arcLength} ${circumference}`}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    opacity={0.3}
                    style={{ filter: `blur(4px)` }}
                />
            </svg>
            {/* Center text */}
            <div style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                paddingBottom: size * 0.05,
            }}>
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.3, stiffness: 200 }}
                    style={{
                        fontSize: size * 0.2,
                        fontWeight: 800,
                        fontFamily: "var(--font-outfit), sans-serif",
                        color,
                        lineHeight: 1,
                    }}
                >
                    {animatedScore}
                </motion.div>
                <div style={{ fontSize: size * 0.06, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.08em" }}>
                    OUT OF 100
                </div>
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                    style={{
                        marginTop: 8,
                        padding: "4px 16px",
                        borderRadius: 20,
                        background: gradeBg(grade),
                        border: `1px solid ${gradeColor(grade)}40`,
                        fontSize: size * 0.11,
                        fontWeight: 800,
                        color: gradeColor(grade),
                        letterSpacing: "0.04em",
                    }}
                >
                    {grade}
                </motion.div>
            </div>
        </div>
    );
}

/* ─── Rule Check Row ─── */
function RuleRow({ rule, value, threshold, passed, unit, delay }: LipinskiRule & { delay: number }) {
    const Icon = passed ? CheckCircle2 : XCircle;
    const color = passed ? "#22c55e" : "#ef4444";
    const pct = Math.min((value / threshold) * 100, 150);

    return (
        <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay }}
            style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: 10,
                background: passed ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.06)",
                border: `1px solid ${passed ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.15)"}`,
            }}
        >
            <Icon size={15} style={{ color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {rule}
                    </span>
                    <span style={{
                        fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace",
                        color: passed ? "var(--text-secondary)" : "#ef4444",
                    }}>
                        {value}{unit ? ` ${unit}` : ""}
                    </span>
                </div>
                {/* Progress bar showing value relative to threshold */}
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct, 100)}%` }}
                        transition={{ duration: 0.8, delay: delay + 0.2 }}
                        style={{
                            height: "100%", borderRadius: 2,
                            background: passed
                                ? `linear-gradient(90deg, ${color}, ${color}88)`
                                : `linear-gradient(90deg, #f59e0b, #ef4444)`,
                        }}
                    />
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════
   Main Export: DrugLikenessGauge
   ═══════════════════════════════════════════════════════ */
export default function DrugLikenessGauge({ data }: { data: DrugLikenessData }) {
    const { score, grade, qed, lipinski, veber, pains } = data;

    const summaryText = useMemo(() => {
        const parts: string[] = [];
        if (lipinski.violations === 0 && veber.violations === 0 && pains.passed) {
            parts.push("Excellent drug-like profile — passes all filter criteria.");
        } else {
            if (lipinski.violations > 0) {
                parts.push(`${lipinski.violations} Lipinski violation${lipinski.violations > 1 ? "s" : ""}`);
            }
            if (veber.violations > 0) {
                parts.push(`${veber.violations} Veber violation${veber.violations > 1 ? "s" : ""}`);
            }
            if (!pains.passed) {
                parts.push(`${pains.alert_count} PAINS alert${pains.alert_count > 1 ? "s" : ""}`);
            }
        }
        return parts.join(" · ");
    }, [lipinski, veber, pains]);

    const [activeSection, setActiveSection] = useState<"lipinski" | "veber" | "pains">("lipinski");

    return (
        <GlassCard glow={score >= 70 ? "blue" : undefined} style={{ overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Award size={20} style={{ color: gradeColor(grade) }} />
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem", fontFamily: "var(--font-outfit), sans-serif" }}>
                    Drugability Score
                </h3>
                <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.5 }}
                    style={{
                        marginLeft: "auto", padding: "3px 10px", borderRadius: 8,
                        fontSize: "0.7rem", fontWeight: 600,
                        background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                        color: "var(--accent-cyan)",
                    }}
                >
                    QED: {qed}
                </motion.span>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 20 }}>
                {summaryText}
            </p>

            {/* Gauge + Quick Stats */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}>
                <CircularGauge score={score} grade={grade} size={180} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Quick stat cards */}
                    {[
                        {
                            label: "Lipinski Ro5",
                            icon: FlaskConical,
                            value: `${4 - lipinski.violations}/4`,
                            sub: lipinski.violations === 0 ? "All rules pass" : `${lipinski.violations} violation${lipinski.violations > 1 ? "s" : ""}`,
                            color: lipinski.violations === 0 ? "#22c55e" : lipinski.violations <= 1 ? "#f59e0b" : "#ef4444",
                        },
                        {
                            label: "Veber Rules",
                            icon: Beaker,
                            value: `${2 - veber.violations}/2`,
                            sub: veber.violations === 0 ? "Good oral bioavail." : `${veber.violations} violation${veber.violations > 1 ? "s" : ""}`,
                            color: veber.violations === 0 ? "#22c55e" : "#f59e0b",
                        },
                        {
                            label: "PAINS Filter",
                            icon: Shield,
                            value: pains.passed ? "Clear" : `${pains.alert_count} alert${pains.alert_count > 1 ? "s" : ""}`,
                            sub: pains.passed ? "No interference" : pains.alerts[0] || "Assay interference",
                            color: pains.passed ? "#22c55e" : "#ef4444",
                        },
                    ].map((stat, i) => {
                        const StatIcon = stat.icon;
                        return (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + i * 0.15 }}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 12px", borderRadius: 10,
                                    background: "rgba(0,0,0,0.15)",
                                    border: "1px solid rgba(255,255,255,0.04)",
                                }}
                            >
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: `${stat.color}15`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0,
                                }}>
                                    <StatIcon size={15} style={{ color: stat.color }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em" }}>
                                        {stat.label}
                                    </div>
                                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: stat.color }}>
                                        {stat.value}
                                    </div>
                                </div>
                                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textAlign: "right", maxWidth: 100 }}>
                                    {stat.sub}
                                </span>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Section Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                {([
                    { key: "lipinski" as const, label: "Lipinski Ro5", count: lipinski.violations },
                    { key: "veber" as const, label: "Veber Rules", count: veber.violations },
                    { key: "pains" as const, label: "PAINS Filter", count: pains.alert_count },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveSection(tab.key)}
                        style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600,
                            border: "1px solid",
                            borderColor: activeSection === tab.key ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)",
                            background: activeSection === tab.key ? "rgba(59,130,246,0.10)" : "rgba(255,255,255,0.02)",
                            color: activeSection === tab.key ? "#60a5fa" : "#94a3b8",
                            cursor: "pointer", transition: "all 0.2s",
                            display: "flex", alignItems: "center", gap: 6,
                        }}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span style={{
                                width: 16, height: 16, borderRadius: "50%",
                                background: "rgba(239,68,68,0.15)", color: "#ef4444",
                                fontSize: "0.65rem", fontWeight: 800,
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Rule Details */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                    {activeSection === "lipinski" && lipinski.rules.map((r, i) => (
                        <RuleRow key={r.rule} {...r} delay={i * 0.08} />
                    ))}
                    {activeSection === "veber" && veber.rules.map((r, i) => (
                        <RuleRow key={r.rule} {...r} delay={i * 0.08} />
                    ))}
                    {activeSection === "pains" && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                padding: "14px 16px", borderRadius: 10,
                                background: pains.passed ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.06)",
                                border: `1px solid ${pains.passed ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.15)"}`,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: pains.alerts.length > 0 ? 10 : 0 }}>
                                {pains.passed ? (
                                    <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                                ) : (
                                    <AlertTriangle size={16} style={{ color: "#ef4444" }} />
                                )}
                                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                    {pains.passed
                                        ? "No PAINS substructures detected"
                                        : `${pains.alert_count} pan-assay interference pattern${pains.alert_count > 1 ? "s" : ""} found`
                                    }
                                </span>
                            </div>
                            {pains.alerts.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 24 }}>
                                    {pains.alerts.map((alert, i) => (
                                        <div key={i} style={{
                                            fontSize: "0.75rem", color: "#ef4444",
                                            fontFamily: "monospace", padding: "3px 8px",
                                            background: "rgba(239,68,68,0.06)", borderRadius: 4,
                                        }}>
                                            ⚠ {alert}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                                PAINS (Pan Assay INterference compoundS) are chemical substructures
                                that frequently produce false positives in high-throughput screens,
                                reducing the reliability of assay results.
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>
        </GlassCard>
    );
}
