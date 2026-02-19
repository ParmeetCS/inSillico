/**
 * AI Summary — Cerebras AI Compound Analysis
 * =============================================
 * 
 * POST /api/copilot/summary
 * Body: { name, smiles, properties, toxicity }
 * Returns: { summary: string }
 * 
 * Generates a concise 2-3 sentence AI analysis for a compound card.
 * Engine: Cerebras AI
 */

import { NextRequest, NextResponse } from "next/server";
import { getCerebrasClient } from "@/lib/cerebras-client";

const SYSTEM_PROMPT = `You are InSilico Lab's AI analyst. Given a molecule's predicted properties, produce a SHORT 2-3 sentence analysis covering:
1. Key strengths of this compound
2. Primary concern or risk (if any)
3. One actionable recommendation

Rules:
- Maximum 3 sentences, be extremely concise
- Use pharmaceutical terminology naturally
- Mention specific property values when relevant
- Focus on drug-likeness and developability
- If toxicity risks are high (>50%), flag them prominently
- Do NOT use markdown formatting — plain text only
- Do NOT repeat the molecule name at the start`;

export async function POST(req: NextRequest) {
    try {
        const cerebras = getCerebrasClient();

        if (!cerebras.isConfigured()) {
            return NextResponse.json(
                { error: "Cerebras API key not configured" },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { name, smiles, properties, toxicity } = body;

        if (!name && !smiles) {
            return NextResponse.json(
                { error: "Missing compound data" },
                { status: 400 }
            );
        }

        const prompt = `Analyze this compound briefly:
Molecule: ${name || "Unknown"} (SMILES: ${smiles || "N/A"})
Properties: ${JSON.stringify(properties || {})}
Toxicity Screening: hERG=${toxicity?.herg || 0}%, Ames=${toxicity?.ames || 0}%, Hepatotoxicity=${toxicity?.hepato || 0}%

Give a 2-3 sentence analysis.`;

        const response = await cerebras.chatCompletion({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.5,
            top_p: 0.85,
            max_tokens: 200,
        });

        const summary = response.choices[0]?.message?.content;

        if (!summary) {
            return NextResponse.json(
                { error: "Empty response from AI" },
                { status: 502 }
            );
        }

        return NextResponse.json({ summary });

    } catch (error) {
        console.error("[Summary] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
