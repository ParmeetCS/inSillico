"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FlaskConical,
  Atom,
  Activity,
  Zap,
  ChevronRight,
  ArrowRight,
  Cpu,
  Database,
  TrendingUp,
  Shield,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusBadge } from "@/components/ui/status-badge";

const stats = [
  { value: "14.5k+", label: "Molecules Analyzed", icon: Atom, change: "+12% this week" },
  { value: "99.8%", label: "Prediction Accuracy", icon: TrendingUp, change: "Industry leading" },
  { value: "230+", label: "Active Simulations", icon: Activity, change: "+8 today" },
  { value: "2.1k", label: "Reports Generated", icon: Database, change: "+34 this week" },
];

const recentSimulations = [
  { name: "Aspirin Analog MK-482", molecule: "CC(=O)Oc1ccccc1C(=O)O", score: 0.94, status: "completed" as const, time: "2 min ago" },
  { name: "Ibuprofen Derivative R-71", molecule: "CC(C)Cc1ccc(cc1)C(C)C(=O)O", score: 0.87, status: "processing" as const, time: "5 min ago" },
  { name: "Caffeine Variant C-19", molecule: "Cn1cnc2c1c(=O)n(c(=O)n2C)C", score: null, status: "queued" as const, time: "12 min ago" },
  { name: "Novel Compound X-55", molecule: "c1ccc2c(c1)cc1ccccc12", score: 0.91, status: "completed" as const, time: "1 hr ago" },
];

const features = [
  { icon: FlaskConical, title: "Physicochemical Prediction", desc: "LogP, pKa, TPSA, solubility and more with AI-powered predictions." },
  { icon: Shield, title: "Toxicity Screening", desc: "hERG, Ames, hepatotoxicity risk assessment in seconds." },
  { icon: Cpu, title: "GPU-Accelerated", desc: "High-performance compute cluster for real-time simulations." },
  { icon: Zap, title: "Instant Results", desc: "From SMILES input to full characterization in under 10 seconds." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
};

export default function HomePage() {
  return (
    <div className="page-container">
      {/* Hero Section */}
      <section style={{ paddingTop: 60, paddingBottom: 80 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          {/* Left */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            <div className="badge badge-processing" style={{ marginBottom: 20 }}>
              <Zap size={12} />
              AI-Powered Drug Formulation
            </div>
            <h1
              style={{
                fontSize: "3.5rem",
                fontWeight: 800,
                lineHeight: 1.1,
                fontFamily: "var(--font-outfit), sans-serif",
                marginBottom: 20,
              }}
            >
              Predict Drug Properties{" "}
              <span className="text-gradient">In Silico</span>
            </h1>
            <p
              style={{
                fontSize: "1.15rem",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                marginBottom: 36,
                maxWidth: 520,
              }}
            >
              Accelerate your drug discovery pipeline with AI-driven physicochemical
              predictions. Analyze molecular properties, predict bioavailability,
              and screen for toxicity — all from a single SMILES string.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/simulations/new" className="btn-primary" style={{ fontSize: "1rem", padding: "14px 32px" }}>
                Start Simulation
                <ArrowRight size={18} />
              </Link>
              <Link href="/dashboard" className="btn-secondary" style={{ fontSize: "1rem", padding: "14px 32px" }}>
                View Dashboard
              </Link>
            </div>
          </motion.div>

          {/* Right — Molecule Preview Card */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2}>
            <GlassCard glow="blue" style={{ position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: "100%",
                  height: 280,
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  position: "relative",
                }}
              >
                {/* Stylized molecule visualization */}
                <svg width="200" height="200" viewBox="0 0 200 200" style={{ opacity: 0.9 }}>
                  <circle cx="100" cy="60" r="14" fill="#3b82f6" opacity="0.8" />
                  <circle cx="60" cy="120" r="12" fill="#8b5cf6" opacity="0.7" />
                  <circle cx="140" cy="120" r="12" fill="#06b6d4" opacity="0.7" />
                  <circle cx="80" cy="160" r="10" fill="#10b981" opacity="0.6" />
                  <circle cx="120" cy="160" r="10" fill="#f97316" opacity="0.6" />
                  <line x1="100" y1="74" x2="60" y2="108" stroke="#94a3b8" strokeWidth="2" opacity="0.4" />
                  <line x1="100" y1="74" x2="140" y2="108" stroke="#94a3b8" strokeWidth="2" opacity="0.4" />
                  <line x1="60" y1="132" x2="80" y2="150" stroke="#94a3b8" strokeWidth="2" opacity="0.4" />
                  <line x1="140" y1="132" x2="120" y2="150" stroke="#94a3b8" strokeWidth="2" opacity="0.4" />
                  <line x1="60" y1="120" x2="140" y2="120" stroke="#94a3b8" strokeWidth="1.5" opacity="0.3" strokeDasharray="4 4" />
                  <text x="100" y="64" textAnchor="middle" fill="white" fontSize="10" fontWeight="600">C</text>
                  <text x="60" y="124" textAnchor="middle" fill="white" fontSize="10" fontWeight="600">N</text>
                  <text x="140" y="124" textAnchor="middle" fill="white" fontSize="10" fontWeight="600">O</text>
                  <text x="80" y="164" textAnchor="middle" fill="white" fontSize="9" fontWeight="600">H</text>
                  <text x="120" y="164" textAnchor="middle" fill="white" fontSize="9" fontWeight="600">S</text>
                </svg>
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                  }}
                >
                  <StatusBadge status="processing" label="Live Simulation" />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>Compound MK-482</div>
                  <div style={{ fontSize: "0.85rem", fontFamily: "monospace", color: "var(--accent-cyan)" }}>
                    CC(=O)Oc1ccccc1C(=O)O
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>Confidence</div>
                  <div className="text-gradient" style={{ fontSize: "1.5rem", fontWeight: 700 }}>94%</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Stats Row */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        custom={3}
        style={{ marginBottom: 80 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <GlassCard key={i} className="stat-card" glow={i === 0 ? "blue" : "none"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Icon size={18} style={{ color: "var(--accent-blue)" }} />
                  <span className="stat-label">{stat.label}</span>
                </div>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-change">{stat.change}</span>
              </GlassCard>
            );
          })}
        </div>
      </motion.section>

      {/* Features Grid */}
      <section style={{ marginBottom: 80 }}>
        <h2 className="section-title" style={{ textAlign: "center", marginBottom: 8 }}>
          Enterprise-Grade <span className="text-gradient">Predictions</span>
        </h2>
        <p className="section-subtitle" style={{ textAlign: "center", maxWidth: 500, margin: "0 auto 40px" }}>
          Powered by state-of-the-art machine learning models trained on millions of molecular data points.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div key={i} initial="hidden" animate="visible" variants={fadeUp} custom={i + 4}>
                <GlassCard style={{ textAlign: "center", height: "100%" }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "rgba(59, 130, 246, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <Icon size={22} style={{ color: "var(--accent-blue)" }} />
                  </div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 8 }}>{feature.title}</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{feature.desc}</p>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Recent Simulations */}
      <section style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 className="section-title">Recent Simulations</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Track your latest predictions in real-time</p>
          </div>
          <Link href="/dashboard" className="btn-secondary" style={{ fontSize: "0.85rem" }}>
            View All <ChevronRight size={14} />
          </Link>
        </div>
        <GlassCard padding="0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Compound</th>
                <th>SMILES</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentSimulations.map((sim, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{sim.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--accent-cyan)" }}>{sim.molecule}</td>
                  <td><StatusBadge status={sim.status} /></td>
                  <td>
                    {sim.score ? (
                      <span className="text-gradient" style={{ fontWeight: 700 }}>{(sim.score * 100).toFixed(0)}%</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{sim.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--glass-border)",
          padding: "32px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <span>© 2026 InSilico Formulator. All rights reserved.</span>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Documentation</a>
          <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>API Reference</a>
          <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Support</a>
        </div>
      </footer>
    </div>
  );
}
