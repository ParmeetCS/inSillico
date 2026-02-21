/**
 * Next.js API Route — Proxy to Network Pharmacology ML Backend
 * 
 * POST /api/network-pharmacology
 * Body: { smiles: string, action?: "full" | "targets" | "ppi" | "pathways" | "diseases", ... }
 * 
 * Forwards requests to the Python Flask ML backend network pharmacology endpoints.
 * Fallback: Returns mock data if backend is unreachable (for demo/development).
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "http://localhost:5001";

// Mock fallback data for when ML server is unreachable
function generateMockNetworkData(smiles: string) {
    return {
        smiles,
        targets: {
            smiles,
            targets: [
                { gene_name: "EGFR", target_name: "Epidermal Growth Factor Receptor", uniprot_id: "P00533", target_class: "Kinase", probability: 0.85, source: "mock" },
                { gene_name: "BRAF", target_name: "B-Raf Proto-Oncogene", uniprot_id: "P15056", target_class: "Kinase", probability: 0.72, source: "mock" },
                { gene_name: "PTGS2", target_name: "Prostaglandin-Endoperoxide Synthase 2 (COX-2)", uniprot_id: "P35354", target_class: "Cyclooxygenase", probability: 0.68, source: "mock" },
                { gene_name: "DRD2", target_name: "Dopamine Receptor D2", uniprot_id: "P14416", target_class: "GPCR", probability: 0.55, source: "mock" },
                { gene_name: "CYP3A4", target_name: "Cytochrome P450 3A4", uniprot_id: "P08684", target_class: "Enzyme (general)", probability: 0.42, source: "mock" },
            ],
            target_count: 5,
            source: "mock",
            gene_list: ["EGFR", "BRAF", "PTGS2", "DRD2", "CYP3A4"],
        },
        ppi_network: {
            nodes: [
                { id: "EGFR", label: "EGFR", degree: 3, is_drug_target: true, centrality: 0.8 },
                { id: "BRAF", label: "BRAF", degree: 2, is_drug_target: true, centrality: 0.6 },
                { id: "MAPK1", label: "MAPK1", degree: 3, is_drug_target: false, centrality: 0.7 },
                { id: "SRC", label: "SRC", degree: 2, is_drug_target: false, centrality: 0.5 },
                { id: "PTGS2", label: "PTGS2", degree: 1, is_drug_target: true, centrality: 0.3 },
                { id: "DRD2", label: "DRD2", degree: 1, is_drug_target: true, centrality: 0.2 },
                { id: "CYP3A4", label: "CYP3A4", degree: 1, is_drug_target: true, centrality: 0.2 },
            ],
            edges: [
                { source: "EGFR", target: "BRAF", score: 0.9 },
                { source: "EGFR", target: "SRC", score: 0.95 },
                { source: "BRAF", target: "MAPK1", score: 0.97 },
                { source: "SRC", target: "MAPK1", score: 0.85 },
                { source: "MAPK1", target: "PTGS2", score: 0.75 },
                { source: "DRD2", target: "CYP3A4", score: 0.4 },
            ],
            metrics: {
                hub_genes: ["MAPK1", "EGFR", "BRAF"],
                density: 0.286,
                num_nodes: 7,
                num_edges: 6,
            },
            source: "mock",
        },
        pathways: {
            query_genes: ["EGFR", "BRAF", "PTGS2", "DRD2", "CYP3A4"],
            pathways: [
                { pathway_id: "hsa04010", pathway_name: "MAPK Signaling Pathway", source: "KEGG", p_value: 0.0001, fdr: 0.001, gene_count: 3, genes: ["EGFR", "BRAF", "MAPK1"] },
                { pathway_id: "hsa05200", pathway_name: "Pathways in Cancer", source: "KEGG", p_value: 0.0005, fdr: 0.003, gene_count: 3, genes: ["EGFR", "BRAF", "PTGS2"] },
                { pathway_id: "hsa00590", pathway_name: "Arachidonic Acid Metabolism", source: "KEGG", p_value: 0.005, fdr: 0.02, gene_count: 1, genes: ["PTGS2"] },
            ],
            pathway_count: 3,
            sources_used: ["mock"],
            top_pathways: ["MAPK Signaling Pathway", "Pathways in Cancer", "Arachidonic Acid Metabolism"],
        },
        diseases: {
            query_genes: ["EGFR", "BRAF", "PTGS2", "DRD2", "CYP3A4"],
            diseases: [
                { disease_id: "EFO_0000311", disease_name: "Cancer", score: 0.92, therapeutic_area: "Oncology", associated_genes: ["EGFR", "BRAF", "PTGS2"], gene_count: 3, source: "mock" },
                { disease_id: "EFO_0000289", disease_name: "Schizophrenia", score: 0.78, therapeutic_area: "Psychiatry", associated_genes: ["DRD2"], gene_count: 1, source: "mock" },
                { disease_id: "EFO_0003767", disease_name: "Rheumatoid Arthritis", score: 0.65, therapeutic_area: "Immune System", associated_genes: ["PTGS2"], gene_count: 1, source: "mock" },
            ],
            disease_count: 3,
            therapeutic_areas: { "Oncology": 1, "Psychiatry": 1, "Immune System": 1 },
            source: "mock",
        },
        summary: "Mock data: Identified 5 potential protein targets, 7 nodes in PPI network, 3 enriched pathways, and 3 associated diseases. Top therapeutic areas: Oncology, Psychiatry, Immune System.",
    };
}

export async function POST(req: NextRequest) {
    let smiles = "";

    try {
        const body = await req.json();
        smiles = body.smiles;
        const action = body.action || "full";

        if (!smiles && action !== "ppi" && action !== "pathways" && action !== "diseases") {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Map action to ML server endpoint
        const endpointMap: Record<string, string> = {
            full: "/network/full-analysis",
            targets: "/network/targets",
            ppi: "/network/ppi",
            pathways: "/network/pathways",
            diseases: "/network/diseases",
            "disease-inference": "/network/disease-inference",
        };

        const endpoint = endpointMap[action] || "/network/full-analysis";

        // Try to fetch from ML server with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout (full pipeline queries multiple external APIs)

        try {
            const response = await fetch(`${ML_SERVER_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error(`ML Server Error: ${response.statusText}`);
                }
                const err = await response.json().catch(() => ({ error: "ML server error" }));
                return NextResponse.json(err, { status: response.status });
            }

            const result = await response.json();
            return NextResponse.json(result);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            console.warn("ML Server unreachable for network pharmacology. Using mock fallback.", fetchError);
            const mockData = generateMockNetworkData(smiles || "CCO");
            return NextResponse.json(mockData);
        }

    } catch (error) {
        console.error("Network Pharmacology API Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
