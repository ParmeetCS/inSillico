import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─── Types ─── */
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
    composite_score?: number;
    network_support_level?: string;
    applicability_domain?: string;
    supporting_targets_high?: string[];
    supporting_pathways?: string[];
}

interface DiseaseInferenceData {
    diseases: DiseaseResult[];
    disease_count: number;
    suppressed_count: number;
    therapeutic_areas: Record<string, number>;
    network_coherence: { is_coherent: boolean; coherence_score: number; flags: string[] };
    target_summary: { high_confidence: number; medium_confidence: number; low_confidence: number };
    ai_suggestion: { has_suggestion: boolean; message: string; confidence: string };
}

export interface NetworkPharmacologyReportData {
    compoundName: string;
    smiles: string;
    date: string;
    targets: { targets: TargetResult[]; target_count: number; source: string; gene_list: string[] };
    ppi_network: { nodes: PPINode[]; edges: PPIEdge[]; metrics: Record<string, unknown>; source: string };
    pathways: { pathways: PathwayResult[]; pathway_count: number; top_pathways: string[] };
    diseases: { diseases: DiseaseResult[]; disease_count: number; therapeutic_areas: Record<string, number> };
    disease_inference?: DiseaseInferenceData;
    summary: string;
    aiSuggestion?: string | null;
}

/* ─── Color Palette ─── */
const C = {
    navy950: [2, 6, 23] as [number, number, number],
    navy900: [10, 15, 30] as [number, number, number],
    navy800: [15, 23, 42] as [number, number, number],
    navy700: [26, 35, 64] as [number, number, number],
    navy600: [37, 50, 86] as [number, number, number],
    blue: [59, 130, 246] as [number, number, number],
    blueLight: [96, 165, 250] as [number, number, number],
    cyan: [6, 182, 212] as [number, number, number],
    green: [34, 197, 94] as [number, number, number],
    purple: [139, 92, 246] as [number, number, number],
    orange: [245, 158, 11] as [number, number, number],
    red: [239, 68, 68] as [number, number, number],
    white: [241, 245, 249] as [number, number, number],
    textSec: [148, 163, 184] as [number, number, number],
    textMuted: [100, 116, 139] as [number, number, number],
};

/* ─── Helpers ─── */

function roundedRect(
    doc: jsPDF, x: number, y: number, w: number, h: number, r: number,
    fill: [number, number, number], opacity = 1
) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setGState(new (doc as any).GState({ opacity }));
    doc.roundedRect(x, y, w, h, r, r, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

function addNewPage(doc: jsPDF, pageW: number, pageH: number): number {
    doc.addPage();
    // Paint dark background immediately on fresh page
    doc.setFillColor(...C.navy950);
    doc.rect(0, 0, pageW, pageH, "F");
    return 16; // top margin
}

function ensureSpace(doc: jsPDF, y: number, needed: number, pageW: number, pageH: number): number {
    if (y + needed > pageH - 20) {
        return addNewPage(doc, pageW, pageH);
    }
    return y;
}

function drawSectionHeader(
    doc: jsPDF, mx: number, y: number, text: string,
    accentColor: [number, number, number]
) {
    doc.setFillColor(...accentColor);
    doc.rect(mx, y, 1.5, 12, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text(text, mx + 6, y + 8);
}

/* ═══════════════════════════════════════════════════
   Generate Network Pharmacology PDF Report
   ═══════════════════════════════════════════════════ */
export function generateNetworkPharmacologyPDF(data: NetworkPharmacologyReportData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const mx = 16;
    const cw = pageW - mx * 2;
    let y = 0;

    /* ════════════════════════════════════
       PAGE 1 — Background + Header
       ════════════════════════════════════ */
    doc.setFillColor(...C.navy950);
    doc.rect(0, 0, pageW, pageH, "F");

    // Header band
    roundedRect(doc, 0, 0, pageW, 54, 0, C.navy900);
    doc.setFillColor(...C.blue);
    doc.rect(0, 54, pageW, 0.8, "F");

    // Logo
    doc.setFillColor(...C.blue);
    doc.circle(mx + 6, 15, 6, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("In", mx + 3.6, 16.5);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("InSilico", mx + 16, 17);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textSec);
    doc.text("AI-Powered Network Pharmacology Analysis", mx + 16, 22.5);

    // Report title
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("Network Pharmacology Report", mx, 36);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textSec);
    const nameDisp = data.compoundName.length > 50 ? data.compoundName.slice(0, 47) + "..." : data.compoundName;
    doc.text(nameDisp, mx, 42);

    // Right meta
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textMuted);
    doc.text(`Date: ${data.date}`, pageW - mx, 34, { align: "right" });

    // Badge
    const badge = "ANALYSIS COMPLETE";
    doc.setFontSize(6);
    const bw = doc.getTextWidth(badge) + 8;
    roundedRect(doc, pageW - mx - bw, 38, bw, 6, 2, C.green);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(badge, pageW - mx - bw + 4, 42);

    y = 62;

    /* ════════════════════════════════════
       Compound Info Card
       ════════════════════════════════════ */
    roundedRect(doc, mx, y, cw, 34, 4, C.navy800);
    doc.setFillColor(...C.blue);
    doc.rect(mx, y, 1.5, 34, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("Compound Information", mx + 6, y + 9);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textMuted);
    doc.text("COMPOUND NAME", mx + 6, y + 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text(data.compoundName || "Unknown", mx + 6, y + 21);

    // SMILES row
    roundedRect(doc, mx + 6, y + 24, cw - 12, 7, 2, C.navy950);
    doc.setFontSize(6);
    doc.setFont("courier", "normal");
    doc.setTextColor(...C.cyan);
    const smilesDisp = data.smiles.length > 85 ? data.smiles.slice(0, 82) + "..." : data.smiles;
    doc.text(smilesDisp, mx + 9, y + 29);

    y += 40;

    /* ════════════════════════════════════
       Analysis Overview — 4 stat boxes
       ════════════════════════════════════ */
    roundedRect(doc, mx, y, cw, 38, 4, C.navy800);
    doc.setFillColor(...C.cyan);
    doc.rect(mx, y, 1.5, 38, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("Analysis Overview", mx + 6, y + 9);

    const stats = [
        { label: "Targets", value: String(data.targets.target_count), color: C.blue },
        { label: "PPI Nodes", value: String(data.ppi_network.nodes.length), color: C.purple },
        { label: "Pathways", value: String(data.pathways.pathway_count), color: C.green },
        { label: "Diseases", value: String(data.disease_inference?.disease_count ?? data.diseases.disease_count), color: C.red },
    ];
    const boxW = (cw - 24) / 4;
    stats.forEach((s, i) => {
        const bx = mx + 6 + i * (boxW + 4);
        const by = y + 14;
        roundedRect(doc, bx, by, boxW, 19, 3, C.navy950, 0.7);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...s.color);
        doc.text(s.value, bx + boxW / 2, by + 11, { align: "center" });
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textMuted);
        doc.text(s.label, bx + boxW / 2, by + 16, { align: "center" });
    });

    y += 42;

    /* ════════════════════════════════════
       AI Suggestion Card
       ════════════════════════════════════ */
    if (data.aiSuggestion) {
        const aiLines = doc.splitTextToSize(data.aiSuggestion, cw - 18);
        const aiH = Math.max(22, 14 + aiLines.length * 4.2);
        y = ensureSpace(doc, y, aiH + 4, pageW, pageH);

        roundedRect(doc, mx, y, cw, aiH, 4, C.navy800);
        doc.setFillColor(...C.cyan);
        doc.rect(mx, y, 1.5, aiH, "F");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.cyan);
        doc.text("AI Suggestion", mx + 6, y + 9);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textSec);
        doc.text(aiLines, mx + 6, y + 15);

        y += aiH + 4;
    }

    /* ════════════════════════════════════
       Summary Text
       ════════════════════════════════════ */
    if (data.summary) {
        const sumLines = doc.splitTextToSize(data.summary, cw - 14);
        const sumH = 8 + sumLines.length * 3.8;
        y = ensureSpace(doc, y, sumH + 4, pageW, pageH);

        roundedRect(doc, mx, y, cw, sumH, 3, C.navy800, 0.6);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textSec);
        doc.text(sumLines, mx + 7, y + 6);

        y += sumH + 6;
    }

    /* ════════════════════════════════════
       SECTION 1: Predicted Targets
       ════════════════════════════════════ */
    y = ensureSpace(doc, y, 40, pageW, pageH);
    drawSectionHeader(doc, mx, y, `Predicted Protein Targets (${data.targets.target_count})`, C.blue);
    y += 14;

    if (data.targets.targets.length > 0) {
        const topTargets = data.targets.targets.slice(0, 25);
        const tblStartPage = doc.getCurrentPageInfo().pageNumber;

        autoTable(doc, {
            startY: y,
            margin: { left: mx + 2, right: mx + 2 },
            head: [["#", "Gene", "Target Name", "Class", "Prob.", "Source", "UniProt"]],
            body: topTargets.map((t, i) => [
                String(i + 1),
                t.gene_name,
                t.target_name.length > 28 ? t.target_name.slice(0, 26) + "..." : t.target_name,
                t.target_class,
                `${(t.probability * 100).toFixed(1)}%`,
                t.source,
                t.uniprot_id,
            ]),
            styles: {
                fillColor: [15, 23, 42],
                textColor: [241, 245, 249],
                fontSize: 7,
                cellPadding: 2.5,
                lineColor: [37, 50, 86],
                lineWidth: 0.25,
            },
            headStyles: {
                fillColor: [26, 35, 64],
                textColor: [148, 163, 184],
                fontSize: 6.5,
                fontStyle: "bold",
            },
            columnStyles: {
                0: { cellWidth: 8, halign: "center" },
                1: { cellWidth: 18, fontStyle: "bold", textColor: [96, 165, 250] },
                2: { cellWidth: "auto" },
                3: { cellWidth: 22 },
                4: { cellWidth: 18, halign: "center", textColor: [6, 182, 212] },
                5: { cellWidth: 20 },
                6: { cellWidth: 20, textColor: [6, 182, 212] },
            },
            didDrawPage() {
                // Only paint dark background on NEW pages that autoTable creates
                const pg = doc.getCurrentPageInfo().pageNumber;
                if (pg > tblStartPage) {
                    doc.setFillColor(...C.navy950);
                    doc.rect(0, 0, pageW, pageH, "F");
                }
            },
            theme: "grid",
        });

        y = (doc as any).lastAutoTable.finalY + 6;

        if (data.targets.target_count > 25) {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...C.textMuted);
            doc.text(`Showing top 25 of ${data.targets.target_count} targets`, mx + 4, y);
            y += 6;
        }
    }

    /* ════════════════════════════════════
       SECTION 2: PPI Network Topology
       ════════════════════════════════════ */
    y = ensureSpace(doc, y, 55, pageW, pageH);
    drawSectionHeader(doc, mx, y, "PPI Network Topology", C.purple);
    y += 14;

    // Metrics grid
    const metrics = data.ppi_network.metrics;
    const metricEntries: [string, string][] = [
        ["Nodes", String(metrics.num_nodes ?? data.ppi_network.nodes.length)],
        ["Edges", String(metrics.num_edges ?? data.ppi_network.edges.length)],
        ["Network Density", typeof metrics.density === "number" ? (metrics.density as number).toFixed(4) : String(metrics.density ?? "N/A")],
        ["Connected Components", String(metrics.connected_components ?? "N/A")],
        ["Largest Component", String(metrics.largest_component_size ?? "N/A")],
        ["Source", data.ppi_network.source],
    ];

    roundedRect(doc, mx, y, cw, 30, 3, C.navy800);
    doc.setFillColor(...C.purple);
    doc.rect(mx, y, 1.5, 30, "F");

    const colW = (cw - 12) / 3;
    metricEntries.forEach((entry, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const ex = mx + 6 + col * colW;
        const ey = y + 6 + row * 14;

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textMuted);
        doc.text(entry[0], ex, ey);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.white);
        doc.text(entry[1], ex, ey + 5);
    });
    y += 34;

    // Hub genes
    const hubs = (metrics.hub_genes as string[]) || [];
    if (hubs.length > 0) {
        const rows = Math.ceil(hubs.length / 5);
        const hubH = 12 + rows * 7;
        y = ensureSpace(doc, y, hubH + 4, pageW, pageH);

        roundedRect(doc, mx, y, cw, hubH, 3, C.navy800, 0.7);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.orange);
        doc.text("Hub Genes (Top by Degree)", mx + 6, y + 8);

        hubs.forEach((gene, i) => {
            const col = i % 5;
            const row = Math.floor(i / 5);
            const gx = mx + 6 + col * 34;
            const gy = y + 14 + row * 7;

            doc.setFontSize(7);
            doc.setFont("courier", "bold");
            doc.setTextColor(...C.orange);
            doc.text(gene, gx, gy);

            const node = data.ppi_network.nodes.find(n => n.id === gene);
            if (node) {
                const gw = doc.getTextWidth(gene);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(...C.textMuted);
                doc.setFontSize(5.5);
                doc.text(`(${node.degree})`, gx + gw + 1, gy);
            }
        });

        y += hubH + 4;
    }

    /* ════════════════════════════════════
       SECTION 3: Enriched Pathways
       ════════════════════════════════════ */
    y = ensureSpace(doc, y, 40, pageW, pageH);
    drawSectionHeader(doc, mx, y, `Enriched Pathways (${data.pathways.pathway_count})`, C.green);
    y += 14;

    if (data.pathways.pathways.length > 0) {
        const topPathways = data.pathways.pathways.slice(0, 20);
        const tblStartPage = doc.getCurrentPageInfo().pageNumber;

        autoTable(doc, {
            startY: y,
            margin: { left: mx + 2, right: mx + 2 },
            head: [["#", "Pathway", "Src", "p-value", "FDR", "Genes", "Gene List"]],
            body: topPathways.map((pw, i) => [
                String(i + 1),
                pw.pathway_name.length > 32 ? pw.pathway_name.slice(0, 30) + "..." : pw.pathway_name,
                pw.source,
                pw.p_value < 0.001 ? pw.p_value.toExponential(2) : pw.p_value.toFixed(4),
                pw.fdr < 0.001 ? pw.fdr.toExponential(2) : pw.fdr.toFixed(4),
                `${pw.gene_count}${pw.total_in_pathway ? `/${pw.total_in_pathway}` : ""}`,
                (pw.genes || []).slice(0, 4).join(", ") + ((pw.genes || []).length > 4 ? "..." : ""),
            ]),
            styles: {
                fillColor: [15, 23, 42],
                textColor: [241, 245, 249],
                fontSize: 6.5,
                cellPadding: 2,
                lineColor: [37, 50, 86],
                lineWidth: 0.25,
            },
            headStyles: {
                fillColor: [26, 35, 64],
                textColor: [148, 163, 184],
                fontSize: 6,
                fontStyle: "bold",
            },
            columnStyles: {
                0: { cellWidth: 7, halign: "center" },
                1: { cellWidth: "auto", fontStyle: "bold" },
                2: { cellWidth: 14 },
                3: { cellWidth: 17, halign: "center", textColor: [34, 197, 94] },
                4: { cellWidth: 17, halign: "center" },
                5: { cellWidth: 13, halign: "center" },
                6: { cellWidth: 38, textColor: [34, 197, 94], fontSize: 5.5 },
            },
            didDrawPage() {
                const pg = doc.getCurrentPageInfo().pageNumber;
                if (pg > tblStartPage) {
                    doc.setFillColor(...C.navy950);
                    doc.rect(0, 0, pageW, pageH, "F");
                }
            },
            theme: "grid",
        });

        y = (doc as any).lastAutoTable.finalY + 6;

        if (data.pathways.pathway_count > 20) {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...C.textMuted);
            doc.text(`Showing top 20 of ${data.pathways.pathway_count} pathways`, mx + 4, y);
            y += 6;
        }
    }

    /* ════════════════════════════════════
       SECTION 4: Disease Associations
       ════════════════════════════════════ */
    const hasInference = !!data.disease_inference;
    const inferenceLabel = hasInference
        ? `Disease Inference v2.0 (${data.disease_inference!.disease_count} validated, ${data.disease_inference!.suppressed_count} suppressed)`
        : `Disease Associations (${data.diseases.disease_count})`;

    y = ensureSpace(doc, y, 40, pageW, pageH);
    drawSectionHeader(doc, mx, y, inferenceLabel, C.red);
    y += 14;

    /* ── Inference summary box (v2.0 only) ── */
    if (hasInference) {
        const inf = data.disease_inference!;
        const summaryH = 30 + (inf.ai_suggestion ? 10 : 0) + ((inf.network_coherence?.flags?.length ?? 0) > 0 ? 8 : 0);
        y = ensureSpace(doc, y, summaryH + 4, pageW, pageH);

        roundedRect(doc, mx, y, cw, summaryH, 3, C.navy800, 0.7);
        doc.setFillColor(...C.cyan);
        doc.rect(mx, y, 1.5, summaryH, "F");

        let sy = y + 7;
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.white);
        doc.text("Inference Summary", mx + 6, sy);
        sy += 6;

        // Stats row
        const infStats = [
            `High-Conf Targets: ${inf.target_summary?.high_confidence ?? "?"}`,
            `Network Coherence: ${inf.network_coherence?.coherence_score != null ? (inf.network_coherence.coherence_score * 100).toFixed(0) + "%" : "N/A"}`,
            `Validated Diseases: ${inf.disease_count}`,
            `Suppressed: ${inf.suppressed_count}`,
        ];
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textSec);
        doc.text(infStats.join("   |   "), mx + 6, sy);
        sy += 6;

        // Drug validation
        if (inf.drug_validation) {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...C.green);
            doc.text(`Drug Match: ${inf.drug_validation.matched_drug || "None"}`, mx + 6, sy);
            sy += 6;
        }

        // Network flags
        if (inf.network_coherence?.flags && inf.network_coherence.flags.length > 0) {
            doc.setFontSize(6);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(239, 68, 68);
            doc.text("Flags: " + inf.network_coherence.flags.join(", "), mx + 6, sy);
            sy += 6;
        }

        // AI suggestion
        if (inf.ai_suggestion) {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...C.cyan);
            const aiMsg = inf.ai_suggestion.length > 120 ? inf.ai_suggestion.slice(0, 117) + "..." : inf.ai_suggestion;
            doc.text(`AI: ${aiMsg}`, mx + 6, sy);
            sy += 6;
        }

        y = sy + 4;
    }

    // Therapeutic area tags
    const areaEntries = Object.entries(data.diseases.therapeutic_areas || {});
    if (areaEntries.length > 0) {
        let px = mx + 4;
        let py = y;

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.textMuted);
        doc.text("Therapeutic Areas:", px, py + 4);
        px += 28;

        areaEntries.forEach(([area, count]) => {
            doc.setFontSize(5.5);
            doc.setFont("helvetica", "bold");
            const txt = `${area}: ${count}`;
            const tw = doc.getTextWidth(txt) + 6;
            if (px + tw > pageW - mx) {
                px = mx + 4;
                py += 7;
            }
            roundedRect(doc, px, py, tw, 6, 2, C.navy700, 0.7);
            doc.setTextColor(...C.red);
            doc.text(txt, px + 3, py + 4);
            px += tw + 3;
        });

        y = py + 10;
    }

    /* ── Disease table ── */
    const diseasesForTable = hasInference
        ? (data.disease_inference!.diseases ?? data.diseases.diseases)
        : data.diseases.diseases;

    if (diseasesForTable.length > 0) {
        const topDiseases = diseasesForTable.slice(0, 20);
        const tblStartPage = doc.getCurrentPageInfo().pageNumber;

        const useInferenceCols = hasInference && topDiseases.some((d: any) => d.composite_score != null);

        const head = useInferenceCols
            ? [["#", "Disease", "Area", "Composite", "Network", "Domain", "Key Targets"]]
            : [["#", "Disease", "Therapeutic Area", "Score", "Associated Genes"]];

        const body = topDiseases.map((d: any, i: number) => {
            if (useInferenceCols) {
                return [
                    String(i + 1),
                    d.disease_name.length > 24 ? d.disease_name.slice(0, 22) + "..." : d.disease_name,
                    d.therapeutic_area || "",
                    (d.composite_score ?? d.score ?? 0).toFixed(3),
                    d.network_support_level || "—",
                    d.applicability_domain || "—",
                    (d.supporting_targets_high || d.associated_genes || []).slice(0, 3).join(", ") +
                        ((d.supporting_targets_high || d.associated_genes || []).length > 3 ? "..." : ""),
                ];
            }
            return [
                String(i + 1),
                d.disease_name.length > 28 ? d.disease_name.slice(0, 26) + "..." : d.disease_name,
                d.therapeutic_area,
                (d.score ?? 0).toFixed(3),
                (d.associated_genes || []).slice(0, 4).join(", ") + ((d.associated_genes || []).length > 4 ? "..." : ""),
            ];
        });

        const colStyles: Record<number, any> = useInferenceCols
            ? {
                0: { cellWidth: 7, halign: "center" },
                1: { cellWidth: "auto", fontStyle: "bold" },
                2: { cellWidth: 22, fontSize: 5.5 },
                3: { cellWidth: 16, halign: "center", textColor: [239, 68, 68] },
                4: { cellWidth: 18, halign: "center", textColor: [96, 165, 250], fontSize: 5.5 },
                5: { cellWidth: 18, halign: "center", fontSize: 5.5 },
                6: { cellWidth: 32, textColor: [96, 165, 250], fontSize: 5.5 },
            }
            : {
                0: { cellWidth: 7, halign: "center" },
                1: { cellWidth: "auto", fontStyle: "bold" },
                2: { cellWidth: 30 },
                3: { cellWidth: 16, halign: "center", textColor: [239, 68, 68] },
                4: { cellWidth: 40, textColor: [96, 165, 250], fontSize: 5.5 },
            };

        autoTable(doc, {
            startY: y,
            margin: { left: mx + 2, right: mx + 2 },
            head,
            body,
            styles: {
                fillColor: [15, 23, 42],
                textColor: [241, 245, 249],
                fontSize: 6.5,
                cellPadding: 2,
                lineColor: [37, 50, 86],
                lineWidth: 0.25,
            },
            headStyles: {
                fillColor: [26, 35, 64],
                textColor: [148, 163, 184],
                fontSize: 6,
                fontStyle: "bold",
            },
            columnStyles: colStyles,
            didDrawPage() {
                const pg = doc.getCurrentPageInfo().pageNumber;
                if (pg > tblStartPage) {
                    doc.setFillColor(...C.navy950);
                    doc.rect(0, 0, pageW, pageH, "F");
                }
            },
            theme: "grid",
        });

        y = (doc as any).lastAutoTable.finalY + 6;

        /* ── Suppressed diseases note ── */
        if (hasInference && (data.disease_inference!.suppressed_count ?? 0) > 0) {
            y = ensureSpace(doc, y, 12, pageW, pageH);
            roundedRect(doc, mx, y, cw, 10, 2, [30, 20, 20] as any, 0.5);
            doc.setFontSize(6);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(239, 68, 68);
            doc.text(
                `${data.disease_inference!.suppressed_count} disease(s) suppressed by inference filters (insufficient pathway/network support or single-target propagation).`,
                mx + 4, y + 6
            );
            y += 14;
        }
    }

    /* ════════════════════════════════════
       Top Pathways Summary (compact)
       ════════════════════════════════════ */
    if (data.pathways.top_pathways && data.pathways.top_pathways.length > 0) {
        const topP = data.pathways.top_pathways.slice(0, 5);
        const tpH = 10 + topP.length * 5;
        y = ensureSpace(doc, y, tpH + 4, pageW, pageH);

        roundedRect(doc, mx, y, cw, tpH, 3, C.navy800, 0.6);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.green);
        doc.text("Top Enriched Pathways", mx + 6, y + 7);

        topP.forEach((pw, i) => {
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...C.textSec);
            doc.text(`${i + 1}. ${pw}`, mx + 8, y + 13 + i * 5);
        });

        y += tpH + 4;
    }

    /* ════════════════════════════════════
       FOOTER — applied to every page
       ════════════════════════════════════ */
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        // Footer band at bottom
        const fy = pageH - 12;
        doc.setFillColor(...C.navy900);
        doc.rect(0, fy - 4, pageW, 16, "F");
        doc.setFillColor(...C.blue);
        doc.rect(0, fy - 4, pageW, 0.5, "F");

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textMuted);
        doc.text(
            `Generated by InSilico Formulator  |  Network Pharmacology Report  |  ${data.date}  |  Confidential`,
            pageW / 2, fy + 1, { align: "center" }
        );
        doc.setTextColor(...C.blue);
        doc.text(`Page ${p} of ${totalPages}`, pageW - mx, fy + 1, { align: "right" });
    }

    /* ════ Save ════ */
    const safeName = data.compoundName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    doc.save(`InSilico_NetworkPharmacology_${safeName}_${new Date().toISOString().split("T")[0]}.pdf`);
}
