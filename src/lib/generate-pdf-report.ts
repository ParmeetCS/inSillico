import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─── Types ─── */
export interface ReportMolecule {
    name: string;
    formula: string;
    smiles: string;
    mw: number;
    iupac?: string;
    cas?: string;
    drugBank?: string;
}

export interface ReportProperty {
    label: string;
    value: string | number;
    unit?: string;
    status: "optimal" | "moderate" | "poor";
    description?: string;
}

export interface ReportToxicity {
    label: string;
    value: number; // 0-100
    risk: string;  // "Low", "Moderate", "High"
}

export interface ReportConditions {
    temperature: string;
    pressure: string;
    solvent: string;
    computeCost: string;
    runtime: string;
    confidence: string;
}

export interface ReportData {
    simulationId: string;
    date: string;
    molecule: ReportMolecule;
    properties: ReportProperty[];
    toxicity: ReportToxicity[];
    conditions: ReportConditions;
    includeSections: {
        moleculeInfo: boolean;
        properties: boolean;
        toxicity: boolean;
        solubilityCurve: boolean;
        rawMetadata: boolean;
    };
}

/* ─── Color Palette ─── */
const COLORS = {
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
    textSecondary: [148, 163, 184] as [number, number, number],
    textMuted: [100, 116, 139] as [number, number, number],
};

function statusColor(status: string): [number, number, number] {
    if (status === "optimal" || status === "Low") return COLORS.green;
    if (status === "moderate" || status === "Moderate") return COLORS.orange;
    return COLORS.red;
}

function drawRoundedRect(
    doc: jsPDF,
    x: number, y: number, w: number, h: number,
    r: number,
    fill: [number, number, number],
    opacity = 1
) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setGState(new (doc as any).GState({ opacity }));
    doc.roundedRect(x, y, w, h, r, r, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

/* ═════════════════════════════════════════════════════════
   Generate PDF Report
   ═════════════════════════════════════════════════════════ */
export function generatePDFReport(data: ReportData): void {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const marginX = 16;
    const contentW = pageW - marginX * 2;
    let y = 0;

    /* ────── Full page dark background ────── */
    doc.setFillColor(...COLORS.navy950);
    doc.rect(0, 0, pageW, pageH, "F");

    /* ────── Header band ────── */
    // Gradient-like header band
    drawRoundedRect(doc, 0, 0, pageW, 52, 0, COLORS.navy900);
    // Accent line
    doc.setFillColor(...COLORS.blue);
    doc.rect(0, 52, pageW, 0.8, "F");

    // Logo circle
    doc.setFillColor(...COLORS.blue);
    doc.circle(marginX + 6, 16, 6, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("In", marginX + 3.6, 17.5);

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.white);
    doc.text("InSilico", marginX + 16, 18);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("AI-Powered Molecular Property Prediction", marginX + 16, 23.5);

    // Report title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.white);
    doc.text("Simulation Report", marginX, 36);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(`${data.molecule.name} — ${data.molecule.formula}`, marginX, 42);

    // Header right — meta info
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(`ID: ${data.simulationId}`, pageW - marginX, 34, { align: "right" });
    doc.text(`Date: ${data.date}`, pageW - marginX, 39, { align: "right" });

    // Status badge
    const badgeText = "ANALYSIS COMPLETE";
    const badgeW = doc.getTextWidth(badgeText) + 8;
    drawRoundedRect(doc, pageW - marginX - badgeW, 42, badgeW, 6, 2, COLORS.green);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, pageW - marginX - badgeW + 4, 46);

    y = 60;

    /* ────── Section: Molecule Information ────── */
    if (data.includeSections.moleculeInfo) {
        // Section card background
        drawRoundedRect(doc, marginX, y, contentW, 50, 4, COLORS.navy800);
        // Card accent bar
        doc.setFillColor(...COLORS.blue);
        doc.rect(marginX, y, 1.2, 50, "F");

        // Section title
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.white);
        doc.text("Molecule Information", marginX + 6, y + 9);

        // Info grid
        const leftCol = marginX + 6;
        const rightCol = marginX + contentW / 2 + 4;
        let iy = y + 18;

        const drawField = (x: number, cy: number, label: string, value: string) => {
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.textMuted);
            doc.text(label, x, cy);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...COLORS.white);
            doc.text(value, x, cy + 5);
        };

        drawField(leftCol, iy, "COMPOUND NAME", data.molecule.name);
        drawField(rightCol, iy, "MOLECULAR FORMULA", data.molecule.formula);
        iy += 14;
        drawField(leftCol, iy, "MOLECULAR WEIGHT", `${data.molecule.mw} g/mol`);
        if (data.molecule.cas) drawField(rightCol, iy, "CAS NUMBER", data.molecule.cas);

        // SMILES string
        iy += 12;
        drawRoundedRect(doc, leftCol, iy - 1, contentW - 12, 8, 2, COLORS.navy950);
        doc.setFontSize(7);
        doc.setFont("courier", "normal");
        doc.setTextColor(...COLORS.cyan);
        const smilesDisplay = data.molecule.smiles.length > 70
            ? data.molecule.smiles.substring(0, 67) + "…"
            : data.molecule.smiles;
        doc.text(smilesDisplay, leftCol + 3, iy + 4);

        y += 56;
    }

    /* ────── Section: Physicochemical Properties ────── */
    if (data.includeSections.properties && data.properties.length > 0) {
        y += 4;
        const tableH = 10 + data.properties.length * 9 + 4;
        drawRoundedRect(doc, marginX, y, contentW, tableH + 8, 4, COLORS.navy800);
        doc.setFillColor(...COLORS.purple);
        doc.rect(marginX, y, 1.2, tableH + 8, "F");

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.white);
        doc.text("Physicochemical Properties", marginX + 6, y + 9);

        // Use autoTable for a polished properties table
        autoTable(doc, {
            startY: y + 14,
            margin: { left: marginX + 4, right: marginX + 4 },
            head: [["Property", "Value", "Unit", "Status", "Description"]],
            body: data.properties.map(p => [
                p.label,
                String(p.value),
                p.unit || "—",
                p.status.toUpperCase(),
                p.description || "—",
            ]),
            styles: {
                fillColor: [15, 23, 42],
                textColor: [241, 245, 249],
                fontSize: 7.5,
                cellPadding: 3,
                lineColor: [37, 50, 86],
                lineWidth: 0.3,
            },
            headStyles: {
                fillColor: [26, 35, 64],
                textColor: [148, 163, 184],
                fontSize: 6.5,
                fontStyle: "bold",
                cellPadding: 3,
            },
            columnStyles: {
                0: { fontStyle: "bold", cellWidth: 32 },
                1: { halign: "center", textColor: [6, 182, 212], cellWidth: 20 },
                2: { halign: "center", cellWidth: 18 },
                3: { halign: "center", cellWidth: 22 },
                4: { cellWidth: "auto", textColor: [148, 163, 184] },
            },
            didParseCell(hookData) {
                if (hookData.section === "body" && hookData.column.index === 3) {
                    const val = hookData.cell.raw as string;
                    if (val === "OPTIMAL") hookData.cell.styles.textColor = [34, 197, 94];
                    else if (val === "MODERATE") hookData.cell.styles.textColor = [245, 158, 11];
                    else if (val === "POOR") hookData.cell.styles.textColor = [239, 68, 68];
                }
            },
            theme: "grid",
        });

        y = (doc as any).lastAutoTable.finalY + 6;
    }

    /* ────── Section: Toxicity Screening ────── */
    if (data.includeSections.toxicity && data.toxicity.length > 0) {
        y += 2;

        // Check if we need a new page
        if (y + 55 > pageH - 20) {
            doc.addPage();
            doc.setFillColor(...COLORS.navy950);
            doc.rect(0, 0, pageW, pageH, "F");
            y = 16;
        }

        const toxH = 14 + data.toxicity.length * 16 + 6;
        drawRoundedRect(doc, marginX, y, contentW, toxH, 4, COLORS.navy800);
        doc.setFillColor(...COLORS.orange);
        doc.rect(marginX, y, 1.2, toxH, "F");

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.white);
        doc.text("Toxicity Screening", marginX + 6, y + 9);

        let ty = y + 18;
        data.toxicity.forEach(tox => {
            const barX = marginX + 8;
            const barW = contentW - 48;
            const riskCol = statusColor(tox.risk);

            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.textSecondary);
            doc.text(tox.label, barX, ty);

            // Background bar
            drawRoundedRect(doc, barX, ty + 2, barW, 4, 1.5, COLORS.navy600);
            // Fill bar
            const fillW = Math.max(2, barW * (tox.value / 100));
            drawRoundedRect(doc, barX, ty + 2, fillW, 4, 1.5, riskCol);

            // Value + Risk label
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...riskCol);
            doc.text(`${tox.value}%  ${tox.risk}`, barX + barW + 4, ty + 5);

            ty += 16;
        });

        y = ty + 2;
    }

    /* ────── Section: Run Details / Conditions ────── */
    if (data.includeSections.rawMetadata) {
        y += 4;

        if (y + 50 > pageH - 20) {
            doc.addPage();
            doc.setFillColor(...COLORS.navy950);
            doc.rect(0, 0, pageW, pageH, "F");
            y = 16;
        }

        drawRoundedRect(doc, marginX, y, contentW, 44, 4, COLORS.navy800);
        doc.setFillColor(...COLORS.purple);
        doc.rect(marginX, y, 1.2, 44, "F");

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.white);
        doc.text("Run Details & Metadata", marginX + 6, y + 9);

        const metaEntries = [
            ["Temperature", data.conditions.temperature],
            ["Pressure", data.conditions.pressure],
            ["Solvent Model", data.conditions.solvent],
            ["Compute Cost", data.conditions.computeCost],
            ["Runtime", data.conditions.runtime],
            ["Confidence Score", data.conditions.confidence],
        ];

        const colW = (contentW - 12) / 3;
        metaEntries.forEach((entry, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const mx = marginX + 6 + col * colW;
            const my = y + 16 + row * 14;

            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...COLORS.textMuted);
            doc.text(entry[0], mx, my);

            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...COLORS.white);
            doc.text(entry[1], mx, my + 5);
        });

        y += 50;
    }

    /* ────── Footer ────── */
    const footerY = pageH - 12;
    doc.setFillColor(...COLORS.navy900);
    doc.rect(0, footerY - 4, pageW, 16, "F");
    doc.setFillColor(...COLORS.blue);
    doc.rect(0, footerY - 4, pageW, 0.5, "F");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textMuted);
    doc.text(
        `Generated by InSilico Formulator · ${data.date} · Confidential — Internal Use Only`,
        pageW / 2, footerY + 1,
        { align: "center" }
    );

    doc.setTextColor(...COLORS.blue);
    doc.text("Page 1 of 1", pageW - marginX, footerY + 1, { align: "right" });

    /* ────── Save ────── */
    const filename = `InSilico_Report_${data.molecule.name.replace(/\s+/g, "_")}_${data.simulationId}.pdf`;
    doc.save(filename);
}

/* ═════════════════════════════════════════════════════════
   Generate CSV Export
   ═════════════════════════════════════════════════════════ */
export function generateCSVExport(data: ReportData): void {
    const lines: string[] = [];
    lines.push("InSilico Formulator - Simulation Report");
    lines.push(`Simulation ID,${data.simulationId}`);
    lines.push(`Date,${data.date}`);
    lines.push("");

    lines.push("Molecule Information");
    lines.push(`Name,${data.molecule.name}`);
    lines.push(`Formula,${data.molecule.formula}`);
    lines.push(`SMILES,${data.molecule.smiles}`);
    lines.push(`Molecular Weight,${data.molecule.mw}`);
    if (data.molecule.cas) lines.push(`CAS,${data.molecule.cas}`);
    lines.push("");

    if (data.includeSections.properties) {
        lines.push("Physicochemical Properties");
        lines.push("Property,Value,Unit,Status,Description");
        data.properties.forEach(p => {
            lines.push(`${p.label},${p.value},${p.unit || ""},${p.status},${p.description || ""}`);
        });
        lines.push("");
    }

    if (data.includeSections.toxicity) {
        lines.push("Toxicity Screening");
        lines.push("Assay,Probability (%),Risk Level");
        data.toxicity.forEach(t => {
            lines.push(`${t.label},${t.value},${t.risk}`);
        });
        lines.push("");
    }

    lines.push("Run Details");
    lines.push(`Temperature,${data.conditions.temperature}`);
    lines.push(`Pressure,${data.conditions.pressure}`);
    lines.push(`Solvent,${data.conditions.solvent}`);
    lines.push(`Compute Cost,${data.conditions.computeCost}`);
    lines.push(`Runtime,${data.conditions.runtime}`);
    lines.push(`Confidence,${data.conditions.confidence}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `InSilico_${data.molecule.name.replace(/\s+/g, "_")}_${data.simulationId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
