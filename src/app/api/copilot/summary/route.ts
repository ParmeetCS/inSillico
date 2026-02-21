/**
 * AI Summary — Gemini AI Compound Analysis
 * =============================================
 * 
 * POST /api/copilot/summary
 * Body: { name, smiles, properties, toxicity }
 * Returns: { summary: string }
 * 
 * Generates a concise 1-2 sentence AI suggestion for a compound card.
 * Engine: Google Gemma 3n (google/gemma-3n-e4b-it:free) via OpenRouter
 */

import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini-client";

const SYSTEM_PROMPT = `You are InSilico Lab's AI analyst. Given a molecule's predicted properties, produce a SHORT 1-2 sentence AI suggestion covering the single most important insight and one actionable recommendation.

Rules:
- Maximum 2 sentences, be extremely concise
- Use pharmaceutical terminology naturally
- Mention specific property values when relevant
- Focus on drug-likeness and developability
- If toxicity risks are high (>50%), flag them prominently
- Do NOT use markdown formatting — plain text only
- Do NOT repeat the molecule name at the start
- Frame as a suggestion/recommendation, not just analysis`;

export async function POST(req: NextRequest) {
    try {
        const gemini = getGeminiClient();

        if (!gemini.isConfigured()) {
            return NextResponse.json(
                { error: "Gemini API key not configured" },
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

Give a 1-2 sentence AI suggestion.`;

        const response = await gemini.chatCompletion({
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
