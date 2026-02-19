/**
 * RAG Context Retrieval — Supabase Data for AI Context Injection
 * ================================================================
 * 
 * Retrieves user-scoped data from Supabase and structures it
 * for injection into the Cerebras system prompt.
 * 
 * Security: All queries are scoped by authenticated user_id.
 * No raw SQL — only structured JSON context blocks.
 */

import { createClient } from "@supabase/supabase-js";

/* ─── Types ─── */

export interface ProjectContext {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
}

export interface MoleculeContext {
    id: string;
    name: string;
    smiles: string;
    formula: string | null;
    molecular_weight: number | null;
    created_at: string;
}

export interface SimulationContext {
    id: string;
    status: string;
    molecule_name: string;
    molecule_smiles: string;
    properties: Record<string, unknown> | null;
    compute_cost: number | null;
    created_at: string;
}

export interface PredictionContext {
    smiles: string;
    molecule_name: string | null;
    properties: Record<string, unknown> | null;
    toxicity_screening: Record<string, unknown> | null;
    confidence: number | null;
    model_type: string | null;
    created_at: string;
}

export interface UserResearchContext {
    projects: ProjectContext[];
    molecules: MoleculeContext[];
    simulations: SimulationContext[];
    predictions: PredictionContext[];
    summary: {
        total_molecules: number;
        total_simulations: number;
        total_predictions: number;
        active_projects: number;
    };
}

/* ─── Supabase Client (server-side, service role) ─── */

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) return null;
    return createClient(url, key);
}

/* ─── Context Retrieval Functions ─── */

async function fetchProjects(userId: string): Promise<ProjectContext[]> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from("projects")
            .select("id, name, description, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);

        return (data || []).map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            created_at: p.created_at,
        }));
    } catch {
        return [];
    }
}

async function fetchMolecules(userId: string): Promise<MoleculeContext[]> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from("molecules")
            .select("id, name, smiles, formula, molecular_weight, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(30);

        return (data || []).map(m => ({
            id: m.id,
            name: m.name,
            smiles: m.smiles,
            formula: m.formula,
            molecular_weight: m.molecular_weight,
            created_at: m.created_at,
        }));
    } catch {
        return [];
    }
}

async function fetchSimulations(userId: string): Promise<SimulationContext[]> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from("simulations")
            .select(`
                id, status, config_json, result_json, compute_cost, created_at,
                molecule:molecules(name, smiles)
            `)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

        return (data || []).map(s => {
            const mol = s.molecule as unknown as { name: string; smiles: string } | null;
            return {
                id: s.id,
                status: s.status,
                molecule_name: mol?.name || "Unknown",
                molecule_smiles: mol?.smiles || "",
                properties: s.result_json as Record<string, unknown> | null,
                compute_cost: s.compute_cost,
                created_at: s.created_at,
            };
        });
    } catch {
        return [];
    }
}

async function fetchPredictions(userId: string): Promise<PredictionContext[]> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from("prediction_results")
            .select("smiles, molecule_name, properties, toxicity_screening, confidence, model_type, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

        return (data || []).map(p => ({
            smiles: p.smiles,
            molecule_name: p.molecule_name,
            properties: p.properties,
            toxicity_screening: p.toxicity_screening,
            confidence: p.confidence,
            model_type: p.model_type,
            created_at: p.created_at,
        }));
    } catch {
        return [];
    }
}

/* ─── Main Context Builder ─── */

/**
 * Retrieves all user-scoped research context from Supabase.
 * Returns structured JSON — never raw SQL.
 */
export async function retrieveUserContext(userId: string): Promise<UserResearchContext> {
    const [projects, molecules, simulations, predictions] = await Promise.all([
        fetchProjects(userId),
        fetchMolecules(userId),
        fetchSimulations(userId),
        fetchPredictions(userId),
    ]);

    return {
        projects,
        molecules,
        simulations,
        predictions,
        summary: {
            total_molecules: molecules.length,
            total_simulations: simulations.length,
            total_predictions: predictions.length,
            active_projects: projects.length,
        },
    };
}

/**
 * Formats the user context into a structured prompt block
 * for injection into the Cerebras system prompt.
 */
export function formatContextForPrompt(ctx: UserResearchContext): string {
    if (
        ctx.summary.total_molecules === 0 &&
        ctx.summary.total_simulations === 0 &&
        ctx.summary.total_predictions === 0 &&
        ctx.summary.active_projects === 0
    ) {
        return "The user has no research data yet. They may be starting fresh.";
    }

    const sections: string[] = [];

    // Research summary
    sections.push([
        "## User Research Profile",
        `Active Projects: ${ctx.summary.active_projects}`,
        `Compound Library: ${ctx.summary.total_molecules} molecules`,
        `Simulations Completed: ${ctx.summary.total_simulations}`,
        `ML Predictions Run: ${ctx.summary.total_predictions}`,
    ].join("\n"));

    // Projects
    if (ctx.projects.length > 0) {
        const projLines = ctx.projects.map(p =>
            `  - "${p.name}": ${p.description || "No description"}`
        );
        sections.push("### Projects:\n" + projLines.join("\n"));
    }

    // Molecules — compact format
    if (ctx.molecules.length > 0) {
        const molLines = ctx.molecules.slice(0, 15).map(m =>
            `  - ${m.name} | SMILES: ${m.smiles} | MW: ${m.molecular_weight ?? "?"} | Formula: ${m.formula ?? "?"}`
        );
        const suffix = ctx.molecules.length > 15 ? `\n  ... and ${ctx.molecules.length - 15} more` : "";
        sections.push("### Compound Library:\n" + molLines.join("\n") + suffix);
    }

    // Simulations with results
    if (ctx.simulations.length > 0) {
        const simLines = ctx.simulations.slice(0, 10).map(s => {
            let line = `  - ${s.molecule_name} (${s.molecule_smiles}) — Status: ${s.status}`;
            if (s.properties) {
                const props = s.properties as Record<string, unknown>;
                const keyVals = ["logP", "solubility", "toxicity", "bioavailability", "pKa", "tpsa"]
                    .filter(k => k in props)
                    .map(k => `${k}: ${props[k]}`)
                    .join(", ");
                if (keyVals) line += ` — ${keyVals}`;
            }
            return line;
        });
        sections.push("### Recent Simulations:\n" + simLines.join("\n"));
    }

    // ML Predictions
    if (ctx.predictions.length > 0) {
        const predLines = ctx.predictions.slice(0, 10).map(p => {
            let line = `  - ${p.molecule_name || p.smiles}`;
            if (p.properties) {
                const props = p.properties as Record<string, unknown>;
                const vals = Object.entries(props)
                    .slice(0, 4)
                    .map(([k, v]) => {
                        if (typeof v === "object" && v !== null && "value" in (v as Record<string, unknown>)) {
                            return `${k}: ${(v as Record<string, unknown>).value}`;
                        }
                        return `${k}: ${v}`;
                    })
                    .join(", ");
                line += ` — ${vals}`;
            }
            if (p.confidence) line += ` (confidence: ${p.confidence}%)`;
            return line;
        });
        sections.push("### ML Prediction Results:\n" + predLines.join("\n"));
    }

    return sections.join("\n\n");
}
