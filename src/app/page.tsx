"use client";

import HeroAnimation from "@/components/HeroAnimation";
import BallpitBackground from "@/components/ballpit-background";

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
    <>
      <BallpitBackground />
      <div className="page-container" style={{ position: "relative", zIndex: 1 }}>
      {/* ================= HERO SECTION ================= */}
      <section style={{ paddingTop: 60, paddingBottom: 80 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          {/* LEFT SIDE */}
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
              <Link
                href="/simulations/new"
                className="btn-primary"
                style={{ fontSize: "1rem", padding: "14px 32px" }}
              >
                Start Simulation
                <ArrowRight size={18} />
              </Link>

              <Link
                href="/dashboard"
                className="btn-secondary"
                style={{ fontSize: "1rem", padding: "14px 32px" }}
              >
                View Dashboard
              </Link>
            </div>
          </motion.div>

          {/* RIGHT SIDE — LOTTIE CARD */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2}>
            <GlassCard glow="blue" style={{ position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: "100%",
                  height: 280,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  position: "relative",
                }}
              >
                {/* LOTTIE ANIMATION */}
                <HeroAnimation />

                {/* Live Badge */}
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

              {/* Bottom Info */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Compound MK-482
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      fontFamily: "monospace",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    CC(=O)Oc1ccccc1C(=O)O
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Confidence
                  </div>
                  <div
                    className="text-gradient"
                    style={{ fontSize: "1.5rem", fontWeight: 700 }}
                  >
                    94%
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>
      </div>
    </>
  );
}