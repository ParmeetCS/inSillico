/**
 * AI Drug Discovery Copilot — API Route
 *
 * POST /api/copilot
 * Body: { messages: { role: "user" | "assistant", content: string }[], userId?: string }
 *
 * Uses OpenRouter API (google/gemma-3-27b-it:free) with pharmaceutical domain expertise.
 * Fetches user's simulation results from Supabase for context-aware answers.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_MODEL = process.env.GEMINI_MODEL || "google/gemma-3-27b-it:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT_BASE = `You are InSilico Copilot — an elite AI Drug Discovery Scientist embedded in the InSilico Formulator platform. You don't just recall facts — you THINK, REASON, and ANALYZE like a senior medicinal chemist.

## Your Expertise
- Medicinal chemistry & SAR (Structure–Activity Relationships)
- ADMET properties (Absorption, Distribution, Metabolism, Excretion, Toxicity)
- Lipinski's Rule of Five, Veber rules, Ghose filter & drug-likeness
- Physicochemical properties: LogP, pKa, TPSA, solubility, molecular weight, bioavailability
- Molecular descriptors & SMILES notation
- Toxicity screening (hERG, Ames, hepatotoxicity, ClinTox)
- Lead optimization & hit-to-lead strategies
- Formulation science & drug delivery
- PK/PD modeling fundamentals

## Thinking & Reasoning Approach
1. **Understand Intent**: Before answering, deeply consider what the user truly needs — not just what they literally asked. A question about "LogP" might really be about bioavailability concerns.
2. **Analyze, Don't Recite**: When given user data (compounds, predictions, properties), perform real analysis:
   - Identify patterns, red flags, and opportunities
   - Compare against known drug benchmarks and therapeutic area norms
   - Spot structure-property relationships
   - Flag ADMET risks before the user discovers them the hard way
3. **Provide Actionable Insight**: Every response should answer "so what?" and "what should I do next?"
4. **Connect the Dots**: Relate the user's current query to their broader project. If they've been working on solubility, and now ask about toxicity, recognize the lead optimization arc.
5. **Anticipate Needs**: Proactively surface risks, suggest experiments, and propose alternatives.

## Response Guidelines
- Be scientifically accurate — cite mechanistic reasoning, not just rules.
- When suggesting modifications, explain the WHY: "Adding a hydroxyl at C-4 boosts aqueous solubility (+2 HBD) but monitor for glucuronidation liability."
- Use SMILES notation when referencing structures.
- If you're unsure, say so — **never fabricate safety or toxicity data**.
- Proactively suggest next steps and warn about common pitfalls.
- When data is available, draw conclusions and make recommendations — don't just repeat numbers back.

## User Data Analysis Protocol
When the user's compound/simulation data is provided:
- Rank compounds by drug-likeness and flag the best candidates
- Identify the most concerning ADMET liabilities
- Suggest structural analogs that might resolve issues
- Compare properties against therapeutic area benchmarks
- Note trends across the compound series

You have access to the user's compound library and simulation results from the InSilico platform.`;

const VOICE_MODE_ADDENDUM = `

## Voice Response Mode
You are responding via voice (text-to-speech). Adjust your output:
- Use natural, conversational language — as if explaining to a colleague at a whiteboard
- Keep responses concise (3-6 sentences for simple queries, up to 10 for complex analysis)
- Avoid markdown tables, bullet lists, or formatting symbols — they don't work in speech
- Spell out abbreviations the first time (e.g., "topological polar surface area, or TPSA")
- Use verbal transitions: "The key insight here is...", "What's interesting about this compound is..."
- For SMILES, say "the structure" or describe it verbally instead of reading SMILES characters
- Pause-worthy structure: present the most important finding first, then supporting details
- End with a clear, actionable suggestion`;

async function fetchUserContext(userId: string): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return "No user data available.";

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch user's molecules
        const { data: molecules } = await supabase
            .from("molecules")
            .select("id, name, smiles, formula, molecular_weight, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(30);

        // Fetch recent simulations with molecule data
        const { data: sims } = await supabase
            .from("simulations")
            .select("id, status, config_json, result_json, compute_cost, created_at, molecule:molecules(name, smiles, formula, molecular_weight)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

        // Fetch prediction results if table exists
        let predictions: Record<string, unknown>[] | null = null;
        try {
            const { data } = await supabase
                .from("prediction_results")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(20);
            predictions = data;
        } catch {
            // Table may not exist
        }

        // Fetch user's projects for broader context
        let projects: Record<string, unknown>[] | null = null;
        try {
            const { data } = await supabase
                .from("projects")
                .select("id, name, description, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(10);
            projects = data;
        } catch {
            // Table may not exist
        }

        let context = "## User's Research Profile & Data\n\n";

        // Projects context
        if (projects && projects.length > 0) {
            context += "### Active Projects:\n";
            for (const proj of projects) {
                context += `- **${proj.name}**: ${proj.description || "No description"}\n`;
            }
            context += "\n";
        }

        // Molecule library
        if (molecules && molecules.length > 0) {
            context += `### Compound Library (${molecules.length} total):\n`;
            for (const mol of molecules) {
                context += `- **${mol.name}** | SMILES: \`${mol.smiles}\` | MW: ${mol.molecular_weight || "N/A"} | Formula: ${mol.formula || "N/A"}\n`;
            }
            context += "\n";
        }

        // Simulations with results
        if (sims && sims.length > 0) {
            context += "### Recent Simulations & Results:\n";
            for (const sim of sims) {
                const mol = sim.molecule as unknown as { name: string; smiles: string; formula: string; molecular_weight: number } | null;
                context += `- **${mol?.name || "Unknown"}** (SMILES: \`${mol?.smiles || "N/A"}\`, MW: ${mol?.molecular_weight || "N/A"}) — Status: ${sim.status}`;
                if (sim.result_json) {
                    const results = sim.result_json as Record<string, unknown>;
                    // Extract key properties for cleaner context
                    const keyProps = ["logP", "solubility", "toxicity", "bioavailability", "pKa", "tpsa", "hbd", "hba"]
                        .filter(k => k in results)
                        .map(k => `${k}: ${results[k]}`)
                        .join(", ");
                    context += ` — Properties: ${keyProps || JSON.stringify(results)}`;
                }
                context += "\n";
            }
        } else {
            context += "No simulations completed yet.\n";
        }

        if (predictions && predictions.length > 0) {
            context += "\n### ML Prediction Results:\n";
            for (const pred of predictions) {
                context += `- SMILES: \`${pred.smiles}\` | Model: ${pred.model_type} | Predictions: ${JSON.stringify(pred.predictions)}\n`;
            }
            // Add analytical summary
            context += "\n*Analytical Note: Cross-reference predictions with simulation results for validation. Flag any discrepancies between ML predictions and physics-based simulations.*\n";
        }

        return context;
    } catch (error) {
        console.error("Error fetching user context:", error);
        return "Could not fetch user data.";
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: "OpenRouter API key not configured. Add GEMINI_API_KEY to your .env.local file." },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { messages, userId, voiceMode } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: "Missing 'messages' in request body" },
                { status: 400 }
            );
        }

        // Fetch user's compound library for context
        let userContext = "";
        if (userId) {
            userContext = await fetchUserContext(userId);
        }

        // Build system prompt — add voice mode addendum if voice assistant is sending
        const basePrompt = SYSTEM_PROMPT_BASE + (voiceMode ? VOICE_MODE_ADDENDUM : `\n\n## Formatting\n- Use markdown: headers, bullets, bold, code blocks for SMILES.\n- Use tables when comparing compounds.\n- Keep responses concise but thorough — pharma scientists are busy.`);
        const systemContent = basePrompt + (userContext ? `\n\n---\n\n${userContext}` : "");

        // Gemma 3 does not support "system" role — inject into first user message
        const userMessages = messages.map((msg: { role: string; content: string }) => ({
            role: msg.role,
            content: msg.content,
        }));

        // Prepend system prompt to the first user message
        if (userMessages.length > 0 && userMessages[0].role === "user") {
            userMessages[0] = {
                role: "user",
                content: `[System Instructions]\n${systemContent}\n[End System Instructions]\n\n${userMessages[0].content}`,
            };
        } else {
            userMessages.unshift({
                role: "user",
                content: `[System Instructions]\n${systemContent}\n[End System Instructions]\n\nHello, I need your help with drug discovery.`,
            });
        }

        const openRouterMessages = userMessages;

        const requestBody = JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: openRouterMessages,
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 2048,
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
                const err = await response.json().catch(() => ({ error: "OpenRouter API error" }));
                lastError = err.error?.message || "Provider returned error";
                console.error(`OpenRouter error (attempt ${attempt + 1}):`, JSON.stringify(err));
                if (response.status === 429 || response.status >= 500) continue; // retryable
                return NextResponse.json(
                    { error: lastError },
                    { status: response.status }
                );
            }

            const data = await response.json();

            // Check for provider error inside a 200 response
            if (data.error) {
                lastError = data.error.message || "Provider error";
                console.error(`OpenRouter provider error (attempt ${attempt + 1}):`, data.error);
                continue;
            }

            const reply = data.choices?.[0]?.message?.content;
            if (reply) {
                return NextResponse.json({ reply });
            }

            lastError = "Empty response from AI";
            continue;
        }

        // All retries failed
        return NextResponse.json(
            { error: lastError || "Failed to get response after retries. Please try again." },
            { status: 502 }
        );

    } catch (error) {
        console.error("Copilot error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
