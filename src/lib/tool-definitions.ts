/**
 * Tool Definitions — Function Calling Schema for Cerebras AI
 * =============================================================
 * 
 * Defines the tools the AI assistant can invoke:
 *   - run_prediction: Predict molecular properties from SMILES
 *   - get_descriptors: Compute RDKit molecular descriptors
 *   - get_drug_likeness: Assess drug-likeness (Lipinski, Veber, PAINS, QED)
 *   - compare_molecules: Side-by-side comparison of two molecules
 *   - generate_report: Generate PDF report for a simulation
 * 
 * Each tool has a JSON Schema definition and an execution handler
 * that calls the Flask ML backend.
 */

import type { CerebrasToolDefinition } from "./cerebras-client";

/* ─── ML Backend URL ─── */
const ML_BACKEND = process.env.ML_BACKEND_URL || "http://localhost:5001";

/* ─── Tool Definitions (JSON Schema for Cerebras function calling) ─── */

export const TOOL_DEFINITIONS: CerebrasToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "run_prediction",
            description:
                "Predict molecular properties (LogP, pKa, solubility, TPSA, bioavailability, toxicity) for a given SMILES string. Returns quantitative predictions with confidence scores and drug-likeness assessment. Use this when the user asks to analyze a molecule, predict properties, or evaluate a compound.",
            parameters: {
                type: "object",
                properties: {
                    smiles: {
                        type: "string",
                        description: "SMILES notation of the molecule to predict. Example: 'CC(=O)OC1=CC=CC=C1C(=O)O' for Aspirin.",
                    },
                },
                required: ["smiles"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_descriptors",
            description:
                "Compute molecular descriptors and physicochemical properties for a SMILES string. Returns RDKit properties including molecular weight, LogP, TPSA, HBD, HBA, rotatable bonds, aromatic rings, and Morgan fingerprint metadata. Use when the user asks about specific molecular features or descriptors.",
            parameters: {
                type: "object",
                properties: {
                    smiles: {
                        type: "string",
                        description: "SMILES notation of the molecule.",
                    },
                },
                required: ["smiles"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_drug_likeness",
            description:
                "Assess drug-likeness of a molecule using Lipinski Rule of Five, Veber rules, PAINS structural alerts, and QED score. Returns overall grade (A+ to F), individual rule assessments, and PAINS alerts. Use when the user asks about drug-likeness, oral bioavailability potential, or lead-likeness.",
            parameters: {
                type: "object",
                properties: {
                    smiles: {
                        type: "string",
                        description: "SMILES notation of the molecule.",
                    },
                },
                required: ["smiles"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "compare_molecules",
            description:
                "Compare two molecules by predicting properties for both and presenting a side-by-side comparison. Useful for SAR analysis, lead optimization, or evaluating structural modifications.",
            parameters: {
                type: "object",
                properties: {
                    smiles_a: {
                        type: "string",
                        description: "SMILES of the first molecule.",
                    },
                    smiles_b: {
                        type: "string",
                        description: "SMILES of the second molecule.",
                    },
                    name_a: {
                        type: "string",
                        description: "Optional name for the first molecule.",
                    },
                    name_b: {
                        type: "string",
                        description: "Optional name for the second molecule.",
                    },
                },
                required: ["smiles_a", "smiles_b"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "query_qspr_dataset",
            description:
                "Look up a molecule in the QSPR training datasets to retrieve experimentally measured properties (solubility, lipophilicity logD, BBB penetration, clinical toxicity). Use when the user asks for exact, measured, experimental, or real values for a specific molecule, or wants to compare predictions vs. measured data.",
            parameters: {
                type: "object",
                properties: {
                    smiles: {
                        type: "string",
                        description: "SMILES notation of the molecule to look up.",
                    },
                    name: {
                        type: "string",
                        description: "Common name of the molecule (e.g. 'Aspirin', 'Caffeine'). Used for name-based search in the dataset.",
                    },
                },
                required: [],
            },
        },
    },
];

/* ─── Tool Execution Handlers ─── */

async function callMLBackend(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${ML_BACKEND}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `ML backend error: HTTP ${response.status}`);
    }

    return response.json();
}

async function executePrediction(args: Record<string, unknown>): Promise<string> {
    const smiles = args.smiles as string;
    if (!smiles) throw new Error("Missing SMILES string");

    const result = await callMLBackend("/predict", { smiles });

    // Structure key results for the LLM to interpret
    const props = result.properties as Record<string, Record<string, unknown>>;
    const mol = result.molecule as Record<string, unknown>;
    const drugLikeness = result.drug_likeness as Record<string, unknown>;
    const lipinski = result.lipinski as Record<string, unknown>;
    const toxScreen = result.toxicity_screening as Record<string, unknown>;

    return JSON.stringify({
        molecule: {
            formula: mol?.formula,
            molecular_weight: mol?.molecular_weight,
            qed: mol?.qed,
        },
        properties: Object.fromEntries(
            Object.entries(props || {}).map(([key, val]) => [
                key,
                { value: val.value, unit: val.unit, status: val.status, confidence: val.confidence },
            ])
        ),
        toxicity_screening: toxScreen,
        lipinski_violations: lipinski?.violations,
        drug_likeness_grade: drugLikeness?.grade,
        drug_likeness_score: drugLikeness?.score,
        overall_confidence: result.confidence,
        model_version: (result.model_info as Record<string, unknown>)?.version,
    });
}

async function executeGetDescriptors(args: Record<string, unknown>): Promise<string> {
    const smiles = args.smiles as string;
    if (!smiles) throw new Error("Missing SMILES string");

    const result = await callMLBackend("/descriptors", { smiles });
    return JSON.stringify(result);
}

async function executeGetDrugLikeness(args: Record<string, unknown>): Promise<string> {
    const smiles = args.smiles as string;
    if (!smiles) throw new Error("Missing SMILES string");

    const result = await callMLBackend("/drug-likeness", { smiles });
    return JSON.stringify(result);
}

async function executeCompareMolecules(args: Record<string, unknown>): Promise<string> {
    const smilesA = args.smiles_a as string;
    const smilesB = args.smiles_b as string;
    const nameA = (args.name_a as string) || "Molecule A";
    const nameB = (args.name_b as string) || "Molecule B";

    if (!smilesA || !smilesB) throw new Error("Both SMILES strings are required");

    // Run predictions for both in parallel
    const [resultA, resultB] = await Promise.all([
        callMLBackend("/predict", { smiles: smilesA }),
        callMLBackend("/predict", { smiles: smilesB }),
    ]);

    const extractProps = (r: Record<string, unknown>) => {
        const props = r.properties as Record<string, Record<string, unknown>>;
        const mol = r.molecule as Record<string, unknown>;
        return {
            formula: mol?.formula,
            molecular_weight: mol?.molecular_weight,
            qed: mol?.qed,
            properties: Object.fromEntries(
                Object.entries(props || {}).map(([k, v]) => [k, { value: v.value, unit: v.unit, status: v.status }])
            ),
            drug_likeness_grade: (r.drug_likeness as Record<string, unknown>)?.grade,
            lipinski_violations: (r.lipinski as Record<string, unknown>)?.violations,
            toxicity_screening: r.toxicity_screening,
        };
    };

    return JSON.stringify({
        comparison: {
            [nameA]: { smiles: smilesA, ...extractProps(resultA) },
            [nameB]: { smiles: smilesB, ...extractProps(resultB) },
        },
    });
}

async function executeQueryQSPRDataset(args: Record<string, unknown>): Promise<string> {
    const body: Record<string, unknown> = {};
    if (args.smiles) body.smiles = args.smiles as string;
    if (args.name) body.name = args.name as string;

    if (!body.smiles && !body.name) {
        throw new Error("Provide either a SMILES string or molecule name to search the dataset");
    }

    const result = await callMLBackend("/qspr/lookup", body);
    return JSON.stringify(result);
}

/* ─── Tool Router ─── */

/**
 * Execute a tool by name with given arguments.
 * Returns a JSON string result for injection into the conversation.
 */
export async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>
): Promise<string> {
    switch (toolName) {
        case "run_prediction":
            return executePrediction(args);

        case "get_descriptors":
            return executeGetDescriptors(args);

        case "get_drug_likeness":
            return executeGetDrugLikeness(args);

        case "compare_molecules":
            return executeCompareMolecules(args);

        case "query_qspr_dataset":
            return executeQueryQSPRDataset(args);

        default:
            return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
}
