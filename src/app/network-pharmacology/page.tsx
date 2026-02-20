"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Share2,
    Search,
    Loader2,
    Target,
    GitBranch,
    Map,
    Activity,
    Dna,
    FlaskConical,
    Zap,
    AlertCircle,
    Info,
    ExternalLink,
    BarChart3,
    Atom,
    CheckCircle2,
    Clock,
    Beaker,
    ChevronRight,
    Cpu,
    Play,
    ArrowLeft,
    RefreshCw,
    Database,
    Shield,
    Microscope,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";

/* Dynamic: NetworkGraph uses SVG + ResizeObserver */
const NetworkGraph = dynamic(() => import("@/components/network-graph"), {
    ssr: false,
    loading: () => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "var(--text-muted)" }}>
            <Loader2 size={18} className="spin" style={{ marginRight: 8 }} /> Loading graph…
        </div>
    ),
});

/* ═══════════════ Types ═══════════════ */

interface MoleculeRow {
    id: string;
    name: string;
    smiles: string;
    formula: string | null;
    molecular_weight: number | null;
    created_at: string;
}

interface SimulationRow {
    id: string;
    status: string;
    compute_cost: number;
    confidence_score: number | null;
    created_at: string;
    completed_at: string | null;
    molecule: { id: string; name: string; smiles: string; formula: string | null } | null;
}

interface TargetResult {
    gene_name: string;
    target_name: string;
    uniprot_id: string;
    target_class: string;
    probability: number;
    source: string;
}
interface PPINode {
    id: string;
    label: string;
    degree: number;
    is_drug_target: boolean;
    centrality: number;
}
interface PPIEdge { source: string; target: string; score: number; interaction_type?: string }
interface PathwayResult {
    pathway_id: string;
    pathway_name: string;
    source: string;
    p_value: number;
    fdr: number;
    gene_count: number;
    genes: string[];
    total_in_pathway?: number;
}
interface DiseaseResult {
    disease_id: string;
    disease_name: string;
    score: number;
    therapeutic_area: string;
    associated_genes: string[];
    gene_count: number;
    source: string;
}
interface FullAnalysisResult {
    smiles: string;
    targets: { targets: TargetResult[]; target_count: number; source: string; gene_list: string[] };
    ppi_network: { nodes: PPINode[]; edges: PPIEdge[]; metrics: Record<string, unknown>; source: string };
    pathways: { pathways: PathwayResult[]; pathway_count: number; top_pathways: string[] };
    diseases: { diseases: DiseaseResult[]; disease_count: number; therapeutic_areas: Record<string, number> };
    summary: string;
}

/* ═══════════════ Pipeline Steps Config ═══════════════ */

interface PipelineStepConfig {
    key: string;
    label: string;
    icon: typeof Target;
    color: string;
    bg: string;
    description: string;
    resultLabel: (r: PipelineStepResults) => string;
}

interface PipelineStepResults {
    targets?: FullAnalysisResult["targets"];
    ppi_network?: FullAnalysisResult["ppi_network"];
    pathways?: FullAnalysisResult["pathways"];
    diseases?: FullAnalysisResult["diseases"];
}

type StepStatus = "waiting" | "running" | "complete" | "error";

const PIPELINE_STEPS: PipelineStepConfig[] = [
    {
        key: "targets", label: "Target Prediction", icon: Target,
        color: "var(--accent-blue)", bg: "rgba(59,130,246,0.12)",
        description: "Querying ChEMBL API, running Morgan fingerprint similarity & SMARTS pharmacophore matching…",
        resultLabel: (r) => r.targets ? `${r.targets.target_count} targets identified` : "",
    },
    {
        key: "ppi", label: "PPI Network Construction", icon: GitBranch,
        color: "var(--accent-purple)", bg: "rgba(139,92,246,0.12)",
        description: "Building protein-protein interaction network from STRING DB…",
        resultLabel: (r) => r.ppi_network ? `${r.ppi_network.nodes.length} nodes, ${r.ppi_network.edges.length} edges` : "",
    },
    {
        key: "pathways", label: "Pathway Enrichment", icon: Map,
        color: "var(--accent-green)", bg: "rgba(16,185,129,0.12)",
        description: "Enriching pathways via Reactome & KEGG databases…",
        resultLabel: (r) => r.pathways ? `${r.pathways.pathway_count} enriched pathways` : "",
    },
    {
        key: "diseases", label: "Disease Mapping", icon: Activity,
        color: "var(--accent-red)", bg: "rgba(239,68,68,0.12)",
        description: "Mapping disease associations from Open Targets platform…",
        resultLabel: (r) => r.diseases ? `${r.diseases.disease_count} disease associations` : "",
    },
];

/* ═══════════════ Tab config ═══════════════ */

type Tab = "targets" | "network" | "pathways" | "diseases" | "topology";
const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: "targets", label: "Targets", icon: Target },
    { id: "network", label: "PPI Network", icon: GitBranch },
    { id: "pathways", label: "Pathways", icon: Map },
    { id: "diseases", label: "Diseases", icon: Activity },
    { id: "topology", label: "Topology", icon: BarChart3 },
];

/* ═══════════════ Helpers ═══════════════ */

function ProbBar({ value }: { value: number }) {
    const pct = Math.min(value * 100, 100);
    const color = pct >= 80 ? "var(--accent-green)" : pct >= 50 ? "var(--accent-blue)" : pct >= 30 ? "var(--accent-orange)" : "var(--text-muted)";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <div style={{ flex: 1, height: 6, background: "var(--navy-700)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 46, textAlign: "right" }}>{(value * 100).toFixed(1)}%</span>
        </div>
    );
}

function ScoreBar({ value }: { value: number }) {
    const pct = Math.min(value * 100, 100);
    const color = pct >= 80 ? "var(--accent-red)" : pct >= 60 ? "var(--accent-orange)" : pct >= 40 ? "#f59e0b" : "var(--text-muted)";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <div style={{ flex: 1, height: 6, background: "var(--navy-700)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", width: 46, textAlign: "right" }}>{value.toFixed(3)}</span>
        </div>
    );
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

/* ═══════════════ Inner component (uses useSearchParams) ═══════════════ */

function NetworkPharmacologyInner() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    // Data
    const [molecules, setMolecules] = useState<MoleculeRow[]>([]);
    const [simulations, setSimulations] = useState<SimulationRow[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Analysis
    const [selectedSmiles, setSelectedSmiles] = useState("");
    const [selectedName, setSelectedName] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<FullAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("targets");
    const [highlightGenes, setHighlightGenes] = useState<string[]>([]);

    // Custom SMILES
    const [customSmiles, setCustomSmiles] = useState("");
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Pipeline stepper state
    const [pipelineStep, setPipelineStep] = useState(-1); // -1 = not started, 0-3 = current step
    const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(["waiting", "waiting", "waiting", "waiting"]);
    const [stepResults, setStepResults] = useState<PipelineStepResults>({});
    const [stepTimings, setStepTimings] = useState<(number | null)[]>([null, null, null, null]);
    const [totalElapsed, setTotalElapsed] = useState(0);
    const analysisStartRef = useRef<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /* ── Fetch user data ── */
    const fetchUserData = useCallback(async () => {
        if (!user) return;
        setDataLoading(true);
        try {
            const [molRes, simRes] = await Promise.all([
                supabase.from("molecules").select("id, name, smiles, formula, molecular_weight, created_at")
                    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
                supabase.from("simulations")
                    .select("id, status, compute_cost, confidence_score, created_at, completed_at, molecule:molecules(id, name, smiles, formula)")
                    .eq("user_id", user.id).eq("status", "completed").order("created_at", { ascending: false }).limit(30),
            ]);
            if (molRes.data) setMolecules(molRes.data as MoleculeRow[]);
            if (simRes.data) {
                const rows = (simRes.data as unknown as Array<Record<string, unknown>>).map((row) => {
                    const mol = Array.isArray(row.molecule) ? row.molecule[0] ?? null : row.molecule ?? null;
                    return { ...row, molecule: mol } as SimulationRow;
                });
                setSimulations(rows);
            }
        } catch (err) { console.error("Failed to fetch user data:", err); }
        finally { setDataLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => { if (user) fetchUserData(); }, [user, fetchUserData]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    /* ── URL redirect handling ── */
    useEffect(() => {
        const smi = searchParams.get("smiles");
        const name = searchParams.get("name");
        if (smi) { setSelectedSmiles(smi); setSelectedName(name || ""); runAnalysis(smi); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    /* ── Run analysis (step-by-step pipeline) ── */
    const resetPipeline = useCallback(() => {
        setPipelineStep(-1);
        setStepStatuses(["waiting", "waiting", "waiting", "waiting"]);
        setStepResults({});
        setStepTimings([null, null, null, null]);
        setTotalElapsed(0);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const runAnalysis = useCallback(async (smilesInput?: string) => {
        const smi = smilesInput || selectedSmiles;
        if (!smi.trim()) return;

        // Reset everything
        setAnalyzing(true); setError(null); setResult(null); setSelectedSmiles(smi);
        resetPipeline();

        // Start elapsed timer
        analysisStartRef.current = Date.now();
        timerRef.current = setInterval(() => {
            setTotalElapsed(Math.floor((Date.now() - analysisStartRef.current) / 1000));
        }, 500);

        const postAPI = async (body: Record<string, unknown>) => {
            const resp = await fetch("/api/network-pharmacology", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({ error: "Request failed" }));
                throw new Error(errData.error || `HTTP ${resp.status}`);
            }
            return resp.json();
        };

        const updateStatus = (idx: number, status: StepStatus) =>
            setStepStatuses(prev => { const copy = [...prev]; copy[idx] = status; return copy; });
        const updateTiming = (idx: number, ms: number) =>
            setStepTimings(prev => { const copy = [...prev]; copy[idx] = ms; return copy; });

        try {
            // ── Step 0: Target Prediction ──
            setPipelineStep(0);
            updateStatus(0, "running");
            const t0 = Date.now();
            const targetsData = await postAPI({ smiles: smi, action: "targets" });
            updateTiming(0, Date.now() - t0);
            updateStatus(0, "complete");
            setStepResults(prev => ({ ...prev, targets: targetsData }));

            const genes = targetsData.gene_list || targetsData.targets?.map((t: TargetResult) => t.gene_name) || [];

            // ── Step 1: PPI Network ──
            setPipelineStep(1);
            updateStatus(1, "running");
            const t1 = Date.now();
            const ppiData = await postAPI({ genes, action: "ppi" });
            updateTiming(1, Date.now() - t1);
            updateStatus(1, "complete");
            setStepResults(prev => ({ ...prev, ppi_network: ppiData }));

            // ── Step 2: Pathway Enrichment ──
            setPipelineStep(2);
            updateStatus(2, "running");
            const t2 = Date.now();
            const pathwayData = await postAPI({ genes, action: "pathways" });
            updateTiming(2, Date.now() - t2);
            updateStatus(2, "complete");
            setStepResults(prev => ({ ...prev, pathways: pathwayData }));

            // ── Step 3: Disease Mapping ──
            setPipelineStep(3);
            updateStatus(3, "running");
            const t3 = Date.now();
            const diseaseData = await postAPI({ genes, action: "diseases" });
            updateTiming(3, Date.now() - t3);
            updateStatus(3, "complete");
            setStepResults(prev => ({ ...prev, diseases: diseaseData }));

            // Assemble full result
            const fullResult: FullAnalysisResult = {
                smiles: smi,
                targets: targetsData,
                ppi_network: ppiData,
                pathways: pathwayData,
                diseases: diseaseData,
                summary: `Identified ${targetsData.target_count} targets, ${ppiData.nodes?.length || 0} PPI nodes, ${pathwayData.pathway_count} pathways, and ${diseaseData.disease_count} disease associations.`,
            };

            // Brief delay to show completed state before transitioning
            await new Promise(resolve => setTimeout(resolve, 800));

            setResult(fullResult); setActiveTab("targets"); haptic("success");
        } catch (e: unknown) {
            // Mark current step as error
            setStepStatuses(prev => {
                const copy = [...prev];
                const runningIdx = copy.findIndex(s => s === "running");
                if (runningIdx >= 0) copy[runningIdx] = "error";
                return copy;
            });
            setError(e instanceof Error ? e.message : "Analysis failed");
        } finally {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setAnalyzing(false);
        }
    }, [selectedSmiles, resetPipeline]);

    const handleMoleculeSelect = useCallback((smiles: string, name: string) => {
        setSelectedSmiles(smiles); setSelectedName(name); setResult(null); setError(null);
        runAnalysis(smiles);
    }, [runAnalysis]);

    /* ── Filtering ── */
    const q = searchQuery.toLowerCase();
    const filteredMolecules = molecules.filter((m) => m.name.toLowerCase().includes(q) || m.smiles.toLowerCase().includes(q));
    const filteredSimulations = simulations.filter((s) => (s.molecule?.name || "").toLowerCase().includes(q) || (s.molecule?.smiles || "").toLowerCase().includes(q));
    const uniqueSims: Record<string, SimulationRow> = {};
    for (const s of filteredSimulations) { const key = s.molecule?.smiles || s.id; if (!(key in uniqueSims)) uniqueSims[key] = s; }
    const dedupedSims: SimulationRow[] = Object.values(uniqueSims);

    /* ── Auth guard ── */
    if (!authLoading && !user) { router.push("/auth/login"); return null; }
    if (authLoading || dataLoading) {
        return (
            <div className="page-container">
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh", gap: 12 }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Loader2 size={24} style={{ color: "var(--accent-blue)" }} />
                    </motion.div>
                    <span style={{ color: "var(--text-secondary)" }}>Loading network pharmacology…</span>
                </div>
            </div>
        );
    }

    /* ═══════════════════════════════════
       RENDER
       ═══════════════════════════════════ */
    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
                <Link href="/dashboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link>
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Network Pharmacology</span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                        <Share2 size={24} style={{ color: "var(--accent-blue)" }} />
                        Network Pharmacology
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: 600 }}>
                        Explore multi-target mechanisms of action. Select a compound to predict targets,
                        build PPI networks, discover pathways, and map diseases.
                    </p>
                </div>
            </div>

            {/* ═══════════════════════════════════
               SECTION: Molecule selection (no result active)
               ═══════════════════════════════════ */}
            {!result && !analyzing && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    {/* Search + New SMILES toggle */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                        <div style={{ flex: 1, position: "relative" }}>
                            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                            <input
                                className="input"
                                type="text"
                                placeholder="Search your molecules by name or SMILES…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ paddingLeft: 36 }}
                            />
                        </div>
                        <button
                            className={showCustomInput ? "btn-primary" : "btn-secondary"}
                            onClick={() => setShowCustomInput(!showCustomInput)}
                            style={{ padding: "10px 18px", fontSize: "0.85rem", borderRadius: 10 }}
                        >
                            <FlaskConical size={15} /> New SMILES
                        </button>
                    </div>

                    {/* Custom SMILES input */}
                    <AnimatePresence>
                        {showCustomInput && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ marginBottom: 24, overflow: "hidden" }}
                            >
                                <div className="glass glow-blue" style={{ padding: 20 }}>
                                    <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
                                        Enter SMILES Notation
                                    </label>
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <input
                                            className="input"
                                            type="text"
                                            placeholder="e.g., CC(=O)Oc1ccccc1C(=O)O for Aspirin"
                                            value={customSmiles}
                                            onChange={(e) => setCustomSmiles(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter" && customSmiles.trim()) handleMoleculeSelect(customSmiles.trim(), "Custom Compound"); }}
                                            style={{ fontFamily: "monospace", flex: 1 }}
                                        />
                                        <button
                                            className="btn-primary"
                                            disabled={!customSmiles.trim()}
                                            onClick={() => { if (customSmiles.trim()) handleMoleculeSelect(customSmiles.trim(), "Custom Compound"); }}
                                            style={{ padding: "10px 22px", borderRadius: 10 }}
                                        >
                                            <Zap size={15} /> Analyze
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Completed Simulations ── */}
                    {dedupedSims.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                                <CheckCircle2 size={18} style={{ color: "var(--accent-green)" }} />
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Completed Simulations</h2>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 4 }}>
                                    ({dedupedSims.length} molecule{dedupedSims.length !== 1 ? "s" : ""} with results)
                                </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                                {dedupedSims.map((sim) => (
                                    <div
                                        key={sim.id}
                                        className="glass"
                                        onClick={() => { haptic("light"); handleMoleculeSelect(sim.molecule?.smiles || "", sim.molecule?.name || "Unknown"); }}
                                        style={{
                                            padding: 18, cursor: "pointer",
                                            borderColor: selectedSmiles === sim.molecule?.smiles ? "var(--accent-blue)" : undefined,
                                            boxShadow: selectedSmiles === sim.molecule?.smiles ? "0 0 20px var(--accent-blue-glow)" : undefined,
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                                                    <CheckCircle2 size={15} style={{ color: "var(--accent-green)" }} />
                                                </div>
                                                <div>
                                                    <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem", lineHeight: 1.2 }}>
                                                        {sim.molecule?.name || "Unknown"}
                                                    </p>
                                                    <p style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{sim.molecule?.formula || "—"}</p>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                <Clock size={11} /> {timeAgo(sim.created_at)}
                                            </div>
                                        </div>
                                        <p style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 10 }}>
                                            {sim.molecule?.smiles || "—"}
                                        </p>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                {sim.confidence_score != null && (
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Activity size={11} /> {(sim.confidence_score * 100).toFixed(0)}% conf
                                                    </span>
                                                )}
                                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <Cpu size={11} /> {sim.compute_cost} credits
                                                </span>
                                            </div>
                                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.78rem", fontWeight: 600, color: "var(--accent-blue)" }}>
                                                <Play size={12} /> Analyze
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Your Molecules ── */}
                    {filteredMolecules.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                                <Atom size={18} style={{ color: "var(--accent-cyan)" }} />
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Your Molecules</h2>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 4 }}>
                                    ({filteredMolecules.length} in library)
                                </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
                                {filteredMolecules.map((mol) => (
                                    <div
                                        key={mol.id}
                                        className="glass"
                                        onClick={() => { haptic("light"); handleMoleculeSelect(mol.smiles, mol.name); }}
                                        style={{
                                            padding: 14, cursor: "pointer",
                                            borderColor: selectedSmiles === mol.smiles ? "var(--accent-cyan)" : undefined,
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                            <div style={{ width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6, 182, 212, 0.12)", border: "1px solid rgba(6, 182, 212, 0.2)" }}>
                                                <Beaker size={13} style={{ color: "var(--accent-cyan)" }} />
                                            </div>
                                            <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mol.name}</p>
                                        </div>
                                        <p style={{ fontFamily: "monospace", fontSize: "0.68rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>{mol.smiles}</p>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                            <span>{mol.formula || "—"} · {mol.molecular_weight ? `${mol.molecular_weight.toFixed(1)} Da` : ""}</span>
                                            <ChevronRight size={12} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {molecules.length === 0 && simulations.length === 0 && (
                        <div className="glass" style={{ textAlign: "center", padding: "60px 24px" }}>
                            <Atom size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px", opacity: 0.5 }} />
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>No molecules yet</h3>
                            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto 20px" }}>
                                Add molecules and run simulations first, or enter a SMILES string directly to explore network pharmacology.
                            </p>
                            <button className="btn-primary" onClick={() => setShowCustomInput(true)} style={{ borderRadius: 10 }}>
                                <FlaskConical size={15} /> Enter SMILES Manually
                            </button>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ═══════════════════════════════════
               ANIMATED PIPELINE STEPPER
               ═══════════════════════════════════ */}
            <AnimatePresence>
                {analyzing && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4 }}
                        style={{ paddingTop: 32, paddingBottom: 40 }}
                    >
                        {/* Header */}
                        <div style={{ textAlign: "center", marginBottom: 32 }}>
                            <motion.div
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))", border: "1px solid rgba(59,130,246,0.2)", marginBottom: 16, position: "relative" }}
                            >
                                <Microscope size={28} style={{ color: "var(--accent-blue)" }} />
                                <motion.div
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    style={{ position: "absolute", inset: -3, borderRadius: 18, border: "2px solid rgba(59,130,246,0.3)" }}
                                />
                            </motion.div>
                            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                                Network Pharmacology Pipeline
                            </h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 4 }}>
                                Analyzing <span style={{ fontWeight: 600, color: "var(--accent-blue)" }}>{selectedName || "compound"}</span>
                            </p>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(15,23,42,0.5)", borderRadius: 20, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                <Clock size={11} />
                                <span style={{ fontFamily: "monospace" }}>{totalElapsed}s elapsed</span>
                            </div>
                        </div>

                        {/* Overall progress bar */}
                        <div style={{ maxWidth: 520, margin: "0 auto 28px", padding: "0 16px" }}>
                            <div style={{ height: 4, background: "var(--navy-700)", borderRadius: 2, overflow: "hidden" }}>
                                <motion.div
                                    animate={{ width: `${((stepStatuses.filter(s => s === "complete").length) / 4) * 100}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    style={{ height: "100%", background: "linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-green))", borderRadius: 2 }}
                                />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                <span>Step {Math.min(pipelineStep + 1, 4)} of 4</span>
                                <span>{stepStatuses.filter(s => s === "complete").length}/4 complete</span>
                            </div>
                        </div>

                        {/* Step cards */}
                        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
                            {PIPELINE_STEPS.map((step, idx) => {
                                const status = stepStatuses[idx];
                                const StepIcon = step.icon;
                                const isActive = status === "running";
                                const isComplete = status === "complete";
                                const isError = status === "error";
                                const timing = stepTimings[idx];
                                const resultText = step.resultLabel(stepResults);

                                return (
                                    <motion.div
                                        key={step.key}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.08, duration: 0.3 }}
                                    >
                                        <div
                                            className="glass-subtle"
                                            style={{
                                                padding: isActive ? "16px 18px" : "12px 18px",
                                                borderColor: isActive ? step.color : isComplete ? "rgba(16,185,129,0.25)" : isError ? "rgba(239,68,68,0.3)" : "transparent",
                                                transition: "all 0.3s ease",
                                                position: "relative",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {/* Active glow */}
                                            {isActive && (
                                                <motion.div
                                                    animate={{ opacity: [0.05, 0.12, 0.05] }}
                                                    transition={{ duration: 2, repeat: Infinity }}
                                                    style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${step.bg}, transparent)`, pointerEvents: "none" }}
                                                />
                                            )}

                                            <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                                                {/* Status icon */}
                                                <div style={{
                                                    width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                                                    background: isActive ? step.bg : isComplete ? "rgba(16,185,129,0.12)" : isError ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.06)",
                                                    border: `1px solid ${isActive ? step.color : isComplete ? "rgba(16,185,129,0.25)" : isError ? "rgba(239,68,68,0.25)" : "rgba(148,163,184,0.1)"}`,
                                                    transition: "all 0.3s ease",
                                                    flexShrink: 0,
                                                }}>
                                                    {isActive ? (
                                                        <Loader2 size={18} style={{ color: step.color }} className="spin" />
                                                    ) : isComplete ? (
                                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
                                                            <CheckCircle2 size={18} style={{ color: "var(--accent-green)" }} />
                                                        </motion.div>
                                                    ) : isError ? (
                                                        <AlertCircle size={18} style={{ color: "var(--accent-red)" }} />
                                                    ) : (
                                                        <StepIcon size={16} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                        <p style={{
                                                            fontSize: "0.88rem", fontWeight: 600,
                                                            color: isActive ? "var(--text-primary)" : isComplete ? "var(--text-primary)" : isError ? "var(--accent-red)" : "var(--text-muted)",
                                                            transition: "color 0.3s ease",
                                                        }}>
                                                            {step.label}
                                                        </p>
                                                        {timing != null && (
                                                            <motion.span
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace", flexShrink: 0 }}
                                                            >
                                                                {(timing / 1000).toFixed(1)}s
                                                            </motion.span>
                                                        )}
                                                    </div>

                                                    {/* Active: show description */}
                                                    <AnimatePresence mode="wait">
                                                        {isActive && (
                                                            <motion.p
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}
                                                            >
                                                                {step.description}
                                                            </motion.p>
                                                        )}
                                                    </AnimatePresence>

                                                    {/* Complete: show result summary */}
                                                    <AnimatePresence mode="wait">
                                                        {isComplete && resultText && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: -4 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}
                                                            >
                                                                <Database size={10} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
                                                                <span style={{ fontSize: "0.75rem", color: "var(--accent-green)", fontWeight: 500 }}>
                                                                    {resultText}
                                                                </span>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    {/* Error state */}
                                                    {isError && (
                                                        <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: 2, opacity: 0.8 }}>
                                                            Step failed — see error below
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Active step: animated progress bar */}
                                            {isActive && (
                                                <motion.div
                                                    style={{ marginTop: 12, height: 3, background: "var(--navy-700)", borderRadius: 2, overflow: "hidden" }}
                                                >
                                                    <motion.div
                                                        animate={{ x: ["-100%", "100%"] }}
                                                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                                        style={{ height: "100%", width: "40%", background: `linear-gradient(90deg, transparent, ${step.color}, transparent)`, borderRadius: 2 }}
                                                    />
                                                </motion.div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Tier breakdown after targets complete */}
                        <AnimatePresence>
                            {stepResults.targets && stepResults.targets.targets && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, duration: 0.4 }}
                                    style={{ maxWidth: 520, margin: "16px auto 0", padding: "0 16px" }}
                                >
                                    <div className="glass-subtle" style={{ padding: "12px 16px" }}>
                                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                            <Shield size={12} style={{ color: "var(--accent-blue)" }} /> Prediction Tier Breakdown
                                        </p>
                                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                            {(() => {
                                                const tiers: Record<string, number> = {};
                                                stepResults.targets.targets.forEach((t: TargetResult) => {
                                                    const tierName = t.source || "unknown";
                                                    tiers[tierName] = (tiers[tierName] || 0) + 1;
                                                });
                                                const tierColors: Record<string, string> = {
                                                    chembl: "var(--accent-blue)", chembl_api: "var(--accent-blue)",
                                                    similarity: "var(--accent-purple)", pharmacophore: "var(--accent-orange)",
                                                    mock: "var(--text-muted)",
                                                };
                                                return Object.entries(tiers).map(([tier, count]) => (
                                                    <motion.div
                                                        key={tier}
                                                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                                                        transition={{ type: "spring", stiffness: 250, damping: 15 }}
                                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(15,23,42,0.5)", borderRadius: 8 }}
                                                    >
                                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: tierColors[tier] || "var(--text-muted)" }} />
                                                        <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>{tier.replace(/_/g, " ")}</span>
                                                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{count}</span>
                                                    </motion.div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════════════════════════
               Error banner
               ═══════════════════════════════════ */}
            <AnimatePresence>
                {error && !analyzing && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginBottom: 24 }}>
                        <div className="glass" style={{ padding: "14px 20px", borderColor: "rgba(239,68,68,0.35)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--accent-red)" }}>
                                <AlertCircle size={18} />
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Analysis Failed</p>
                                    <p style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: 2 }}>{error}</p>
                                </div>
                                <button className="btn-secondary" onClick={() => { setError(null); setResult(null); }}
                                    style={{ padding: "6px 14px", fontSize: "0.78rem", borderRadius: 8 }}>
                                    Back
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════════════════════════
               RESULTS
               ═══════════════════════════════════ */}
            <AnimatePresence mode="wait">
                {result && !analyzing && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                        {/* Back bar */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => { setResult(null); setSelectedSmiles(""); setSelectedName(""); setError(null); }}
                                    style={{ padding: "8px 14px", fontSize: "0.82rem", borderRadius: 10 }}
                                >
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <div>
                                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{selectedName || "Compound"}</h2>
                                    <p style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-muted)", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.smiles}</p>
                                </div>
                            </div>
                            <button className="btn-secondary" onClick={() => runAnalysis(result.smiles)} style={{ padding: "8px 14px", fontSize: "0.82rem", borderRadius: 10 }}>
                                <RefreshCw size={14} /> Re-run
                            </button>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
                            {([
                                { icon: Target, color: "var(--accent-blue)", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.2)", count: result.targets.target_count, label: "Targets" },
                                { icon: GitBranch, color: "var(--accent-purple)", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.2)", count: result.ppi_network.nodes.length, label: "PPI Nodes" },
                                { icon: Map, color: "var(--accent-green)", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.2)", count: result.pathways.pathway_count, label: "Pathways" },
                                { icon: Activity, color: "var(--accent-red)", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.2)", count: result.diseases.disease_count, label: "Diseases" },
                            ] as const).map((c) => {
                                const Icon = c.icon;
                                return (
                                    <div key={c.label} className="glass" style={{ padding: 18 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, border: `1px solid ${c.border}` }}>
                                                <Icon size={20} style={{ color: c.color }} />
                                            </div>
                                            <div>
                                                <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{c.count}</p>
                                                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.label}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Summary text */}
                        <div className="glass" style={{ padding: "14px 20px", marginBottom: 20 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                <Info size={17} style={{ color: "var(--accent-cyan)", flexShrink: 0, marginTop: 2 }} />
                                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{result.summary}</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const active = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10,
                                            fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                                            background: active ? "rgba(59,130,246,0.15)" : "rgba(15,23,42,0.4)",
                                            color: active ? "var(--accent-blue-light)" : "var(--text-muted)",
                                            border: active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        <Icon size={15} /> {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="glass" style={{ padding: 24 }}>
                            <AnimatePresence mode="wait">
                                {/* ── Targets ── */}
                                {activeTab === "targets" && (
                                    <motion.div key="targets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Predicted Protein Targets</h3>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
                                            Source: {result.targets.source} · {result.targets.target_count} targets
                                        </p>
                                        <div style={{ overflowX: "auto" }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Gene</th>
                                                        <th>Target Name</th>
                                                        <th>Class</th>
                                                        <th style={{ width: 180 }}>Probability</th>
                                                        <th>UniProt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {result.targets.targets.map((t, i) => (
                                                        <tr key={i} style={{ cursor: "pointer" }}
                                                            onClick={() => setHighlightGenes((prev) =>
                                                                prev.includes(t.gene_name) ? prev.filter((g) => g !== t.gene_name) : [...prev, t.gene_name]
                                                            )}
                                                        >
                                                            <td><span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent-blue-light)" }}>{t.gene_name}</span></td>
                                                            <td>{t.target_name}</td>
                                                            <td>
                                                                <span className="badge" style={{ background: "rgba(148,163,184,0.1)", color: "var(--text-secondary)" }}>
                                                                    {t.target_class}
                                                                </span>
                                                            </td>
                                                            <td><ProbBar value={t.probability} /></td>
                                                            <td>
                                                                <a
                                                                    href={`https://www.uniprot.org/uniprot/${t.uniprot_id}`}
                                                                    target="_blank" rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ color: "var(--accent-cyan)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                                                                >
                                                                    {t.uniprot_id} <ExternalLink size={11} />
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── Network ── */}
                                {activeTab === "network" && (
                                    <motion.div key="network" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Protein–Protein Interaction Network</h3>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
                                            Source: {result.ppi_network.source} · Click nodes to highlight
                                        </p>
                                        <div style={{ height: 500 }}>
                                            <NetworkGraph
                                                nodes={result.ppi_network.nodes}
                                                edges={result.ppi_network.edges}
                                                highlightGenes={highlightGenes}
                                                onNodeClick={(node) =>
                                                    setHighlightGenes((prev) =>
                                                        prev.includes(node.id) ? prev.filter((g) => g !== node.id) : [...prev, node.id]
                                                    )
                                                }
                                            />
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── Pathways ── */}
                                {activeTab === "pathways" && (
                                    <motion.div key="pathways" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Enriched Pathways</h3>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
                                            {result.pathways.pathway_count} pathways with p &lt; 0.05
                                        </p>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {result.pathways.pathways.map((pw, i) => (
                                                <div key={i} className="glass-subtle" style={{ padding: 14 }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                                        <div>
                                                            <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.88rem" }}>{pw.pathway_name}</p>
                                                            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>{pw.pathway_id} · {pw.source}</p>
                                                        </div>
                                                        <div style={{ textAlign: "right" }}>
                                                            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                                p = {pw.p_value < 0.001 ? pw.p_value.toExponential(2) : pw.p_value.toFixed(4)}
                                                            </p>
                                                            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                                FDR = {pw.fdr < 0.001 ? pw.fdr.toExponential(2) : pw.fdr.toFixed(4)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <Dna size={12} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                                                            {pw.genes?.map((gene) => (
                                                                <span key={gene} style={{
                                                                    padding: "2px 8px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)",
                                                                    borderRadius: 4, fontSize: "0.72rem", color: "var(--accent-green-light)", fontFamily: "monospace",
                                                                }}>{gene}</span>
                                                            ))}
                                                        </div>
                                                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0 }}>
                                                            {pw.gene_count}{pw.total_in_pathway ? `/${pw.total_in_pathway}` : ""} genes
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                            {result.pathways.pathway_count === 0 && (
                                                <p style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: "0.88rem" }}>No significantly enriched pathways found.</p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── Diseases ── */}
                                {activeTab === "diseases" && (
                                    <motion.div key="diseases" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Disease Associations</h3>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
                                            {result.diseases.disease_count} diseases across {Object.keys(result.diseases.therapeutic_areas).length} therapeutic areas
                                        </p>
                                        {/* Pills */}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                                            {Object.entries(result.diseases.therapeutic_areas).map(([area, count]) => (
                                                <span key={area} className="badge" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "rgba(248,113,113,0.9)" }}>
                                                    {area}: {count as number}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ overflowX: "auto" }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Disease</th>
                                                        <th>Therapeutic Area</th>
                                                        <th style={{ width: 160 }}>Score</th>
                                                        <th>Associated Genes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {result.diseases.diseases.map((d, i) => (
                                                        <tr key={i}>
                                                            <td style={{ fontWeight: 600 }}>{d.disease_name}</td>
                                                            <td>
                                                                <span className="badge" style={{ background: "rgba(148,163,184,0.1)", color: "var(--text-secondary)" }}>
                                                                    {d.therapeutic_area}
                                                                </span>
                                                            </td>
                                                            <td><ScoreBar value={d.score} /></td>
                                                            <td>
                                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                                                    {d.associated_genes.map((g) => (
                                                                        <span key={g} style={{
                                                                            padding: "2px 6px", background: "rgba(59,130,246,0.08)",
                                                                            borderRadius: 4, fontSize: "0.72rem", color: "var(--accent-blue-light)", fontFamily: "monospace",
                                                                        }}>{g}</span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── Topology ── */}
                                {activeTab === "topology" && (
                                    <motion.div key="topology" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Network Topology Metrics</h3>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                            {/* Graph Stats */}
                                            <div className="glass-subtle" style={{ padding: 16 }}>
                                                <h4 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Graph Statistics</h4>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {([
                                                        ["Nodes", result.ppi_network.metrics.num_nodes],
                                                        ["Edges", result.ppi_network.metrics.num_edges],
                                                        ["Density", typeof result.ppi_network.metrics.density === "number" ? (result.ppi_network.metrics.density as number).toFixed(4) : result.ppi_network.metrics.density],
                                                        ["Components", result.ppi_network.metrics.connected_components],
                                                        ["Largest Component", result.ppi_network.metrics.largest_component_size],
                                                    ] as [string, unknown][]).map(([label, val]) => (
                                                        <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                                                            <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                                            <span style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{val != null ? String(val) : "—"}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Hub Genes */}
                                            <div className="glass-subtle" style={{ padding: 16 }}>
                                                <h4 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Hub Genes (Top by Degree)</h4>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {((result.ppi_network.metrics.hub_genes as string[]) || []).map((gene, i) => {
                                                        const node = result.ppi_network.nodes.find((n) => n.id === gene);
                                                        return (
                                                            <div key={gene} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", width: 16 }}>{i + 1}.</span>
                                                                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent-orange)" }}>{gene}</span>
                                                                </div>
                                                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>degree: {node?.degree ?? "?"}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Degree Centrality */}
                                            <div className="glass-subtle" style={{ padding: 16, gridColumn: "1 / -1" }}>
                                                <h4 style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Degree Centrality Distribution</h4>
                                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
                                                    {Object.entries((result.ppi_network.metrics.degree_centrality as Record<string, number>) || {}).map(([gene, cent]) => (
                                                        <div key={gene} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(15,23,42,0.4)", borderRadius: 6 }}>
                                                            <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--accent-blue-light)", width: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gene}</span>
                                                            <div style={{ flex: 1, height: 5, background: "var(--navy-700)", borderRadius: 3, overflow: "hidden" }}>
                                                                <div style={{ height: "100%", width: `${Math.min(cent * 100, 100)}%`, background: "var(--accent-blue)", borderRadius: 3 }} />
                                                            </div>
                                                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", width: 30, textAlign: "right" }}>{cent.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ═══════════════ Outer wrapper with Suspense ═══════════════ */
export default function NetworkPharmacologyPage() {
    return (
        <Suspense fallback={<div className="page-container"><p style={{ color: "var(--text-secondary)" }}>Loading…</p></div>}>
            <NetworkPharmacologyInner />
        </Suspense>
    );
}
