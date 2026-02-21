/**
 * AI Summary — Groq AI Compound Analysis
 * =============================================
 * 
 * POST /api/copilot/summary
 * Body: { name, smiles, properties, toxicity }
 * Returns: { summary: string }
 * 
 * Generates a concise 1-2 sentence AI suggestion for a compound card.
 * Engine: llama-3.3-70b-versatile via Groq
 */

import { NextRequest, NextResponse } from "next/server";
import { getGroqClient } from "@/lib/groq-client";

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
        const groq = getGroqClient();

        if (!groq.isConfigured()) {
            return NextResponse.json(
                { error: "Groq API key not configured" },
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

        const summaryOpts = {
            messages: [
                { role: "system" as const, content: SYSTEM_PROMPT },
                { role: "user" as const, content: prompt },
            ],
            temperature: 0.5,
            top_p: 0.85,
            max_tokens: 2048,
        };

        let summary: string | undefined;

        // Reasoning models sometimes return empty content — retry up to 2 times
        for (let attempt = 0; attempt < 3; attempt++) {
            const response = await groq.chatCompletion(
                { ...summaryOpts, max_tokens: 2048 + attempt * 2048 }
            );
            summary = response.choices[0]?.message?.content;

            if (summary) break;
            console.warn(`[Summary] Empty content (attempt ${attempt + 1}), retrying...`);
        }

        if (!summary) {
            return NextResponse.json(
                { error: "Empty response from AI. Please try again." },
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
