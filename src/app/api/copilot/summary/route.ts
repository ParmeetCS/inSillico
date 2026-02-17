/**
 * AI Summary endpoint — generates concise AI analysis for a single compound
 *
 * POST /api/copilot/summary
 * Body: { name, smiles, properties, toxicity }
 *
 * Returns { summary: string } — a short AI-generated insight for the compound card.
 * Uses OpenRouter API (google/gemma-3-27b-it:free).
 */

import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_MODEL = process.env.GEMINI_MODEL || "google/gemma-3-27b-it:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are InSilico Copilot — a concise pharmaceutical AI analyst. 
Given a molecule's predicted properties, produce a SHORT 2-3 sentence analysis covering:
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
        if (!OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: "OpenRouter API key not configured" },
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

        const requestBody = JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
                { role: "user", content: `[System Instructions]\n${SYSTEM_PROMPT}\n[End System Instructions]\n\n${prompt}` },
            ],
            temperature: 0.5,
            top_p: 0.85,
            max_tokens: 200,
        });

        const requestHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://insilico-formulator.vercel.app",
            "X-Title": "InSilico Formulator",
        };

        // Retry up to 2 times for transient free-tier provider errors
        let lastError = "";
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, 1500 * attempt));
            }

            const response = await fetch(OPENROUTER_URL, {
                method: "POST",
                headers: requestHeaders,
                body: requestBody,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                lastError = err.error?.message || "Provider error";
                console.error(`OpenRouter summary error (attempt ${attempt + 1}):`, err);
                if (response.status === 429 || response.status >= 500) continue;
                return NextResponse.json(
                    { error: "Failed to generate summary" },
                    { status: response.status }
                );
            }

            const data = await response.json();

            if (data.error) {
                lastError = data.error.message || "Provider error";
                continue;
            }

            const summary = data.choices?.[0]?.message?.content;
            if (summary) {
                return NextResponse.json({ summary });
            }

            lastError = "Empty response";
            continue;
        }

        return NextResponse.json(
            { error: lastError || "Failed to generate summary after retries" },
            { status: 502 }
        );
    } catch (error) {
        console.error("Summary error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
