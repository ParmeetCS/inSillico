/**
 * AI — Groq AI + RAG + Function Calling
 * ==================================================================
 * 
 * POST /api/copilot
 * Body: {
 *   messages: { role: "user" | "assistant", content: string }[],
 *   userId?: string,
 *   voiceMode?: boolean,
 *   stream?: boolean,
 *   projectId?: string
 * }
 * 
 * Architecture:
 *   1. Retrieve user context from Supabase (RAG)
 *   2. Build system prompt with persona + context
 *   3. Send to Groq AI with tool definitions
 *   4. Handle tool calls (predictions, descriptors, drug-likeness)
 *   5. Return final response (streaming or non-streaming)
 * 
 * Engine: llama-3.3-70b-versatile via Groq
 */

import { NextRequest, NextResponse } from "next/server";
import { getGroqClient, type GroqMessage, type GroqStreamChunk } from "@/lib/groq-client";
import { retrieveUserContext, formatContextForPrompt } from "@/lib/rag-context";
import { TOOL_DEFINITIONS, executeToolCall } from "@/lib/tool-definitions";

/* ─── System Prompt ─── */

const SYSTEM_PROMPT = `You are the AI Research Assistant for the InSilico Lab — an advanced in-silico drug discovery platform. You have access to molecular descriptors, QSPR prediction models, and the user's full project context.

## Core Competencies
- Medicinal chemistry, SAR (Structure–Activity Relationships), and lead optimization
- ADMET properties (Absorption, Distribution, Metabolism, Excretion, Toxicity)
- Physicochemical property analysis: LogP, pKa, TPSA, solubility, molecular weight, bioavailability
- Lipinski Rule of Five, Veber rules, Ghose filter, drug-likeness assessment
- Toxicity screening: hERG inhibition, Ames mutagenicity, hepatotoxicity, ClinTox
- SMILES notation interpretation and molecular structure analysis
- Formulation science and drug delivery considerations

## Reasoning Protocol
1. UNDERSTAND the user's true intent — a question about LogP may really be about absorption concerns
2. ANALYZE data quantitatively — cite specific descriptor values, confidence scores, thresholds
3. IDENTIFY risks proactively — flag ADMET liabilities, Lipinski violations, PAINS alerts
4. RECOMMEND actionable next steps — suggest structural modifications with mechanistic rationale
5. CONNECT findings to the user's broader research program when their project data is available

## Tool Usage
You have access to computational tools. Use them when the user:
- Asks you to predict properties for a molecule (use run_prediction)
- Asks about molecular descriptors or features (use get_descriptors)
- Asks about drug-likeness assessment (use get_drug_likeness)
- Wants to compare two molecules (use compare_molecules)
- Asks for exact, measured, or experimental values from training data (use query_qspr_dataset)
- Wants to know if a molecule is in the QSPR dataset (use query_qspr_dataset)

When reporting tool results:
- Present key findings first, then supporting detail
- Highlight any concerning values (red flags)
- Compare against known drug benchmarks
- Suggest structural improvements where relevant

## Scientific Standards
- Be accurate — cite mechanistic reasoning, not just rules
- When suggesting modifications: explain WHY ("Adding -OH at C-4 improves aqueous solubility via +1 HBD, but monitor for glucuronidation liability")
- Use SMILES notation for structures when helpful
- NEVER fabricate safety or toxicity data
- If uncertain, state your confidence level explicitly

## QSPR Training Data
You have access to the experimentally measured QSPR training datasets via the query_qspr_dataset tool:
  - Solubility: ESOL dataset — measured log solubility (logS mol/L), ~1128 compounds
  - Lipophilicity: MoleculeNet — experimental logD at pH 7.4, ~4200 compounds
  - BBB Penetration: BBBP dataset — binary blood-brain barrier permeability, ~2039 compounds
  - Clinical Toxicity: ClinTox — binary clinical trial toxicity, ~1478 compounds
When reporting measured values, clearly distinguish them from ML predictions.

## Tone
- Professional and scientifically precise
- Concise but thorough — pharmaceutical scientists are busy
- Not casual, not over-confident
- Reference descriptor values numerically when data is available`;

const VOICE_MODE_ADDENDUM = `

## Voice Response Mode
You are responding via voice synthesis. Adjust output for speech:
- Use natural, conversational language — like explaining to a colleague at a whiteboard
- Keep responses concise: 3-6 sentences for simple queries, up to 10 for complex analysis
- NEVER use markdown formatting (tables, bullets, headers, code blocks) — they break in speech
- Spell out abbreviations first time: "topological polar surface area, or TPSA"
- Use verbal transitions: "The key insight here is...", "What stands out about this compound..."
- For SMILES, describe the structure verbally instead of reading SMILES characters
- Structure: most important finding first, then supporting details
- End with a clear, actionable suggestion`;

const TEXT_MODE_ADDENDUM = `

## Formatting Guidelines
- Use markdown: headers, bold, code blocks for SMILES, bullet lists
- Use tables when comparing multiple compounds
- Keep formatting clean and scannable`;

/* ─── Streaming Response Helpers ─── */

function createSSEStream(cerebrasStream: AsyncGenerator<GroqStreamChunk>): ReadableStream {
    return new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            try {
                for await (const chunk of cerebrasStream) {
                    const content = chunk.choices?.[0]?.delta?.content;
                    if (content) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }

                    if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ tool_call: true })}\n\n`)
                        );
                    }
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Stream error";
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
            } finally {
                controller.close();
            }
        },
    });
}

/* ─── Main Handler ─── */

export async function POST(req: NextRequest) {
    try {
        const groq = getGroqClient();

        if (!groq.isConfigured()) {
            return NextResponse.json(
                { error: "Groq API key not configured. Add GROQ_API_KEY to .env.local" },
                { status: 500 }
            );
        }

        const body = await req.json();
        const {
            messages,
            userId,
            voiceMode = false,
            stream = false,
        } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: "Missing 'messages' in request body" },
                { status: 400 }
            );
        }

        // ── Step 1: Retrieve user context (RAG) ──
        let contextBlock = "";
        if (userId) {
            try {
                const userContext = await retrieveUserContext(userId);
                contextBlock = formatContextForPrompt(userContext);
            } catch (e) {
                console.error("[Copilot] RAG context error:", e);
                contextBlock = "User context could not be retrieved.";
            }
        }

        // ── Step 2: Build system prompt ──
        const modeAddendum = voiceMode ? VOICE_MODE_ADDENDUM : TEXT_MODE_ADDENDUM;
        const systemPrompt = [
            SYSTEM_PROMPT,
            modeAddendum,
            contextBlock ? `\n---\n\n${contextBlock}` : "",
        ].join("");

        // ── Step 3: Build message array ──
        const groqMessages: GroqMessage[] = [
            { role: "system", content: systemPrompt },
            ...messages.map((m: { role: string; content: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            })),
        ];

        // ── Step 4: Streaming mode ──
        if (stream) {
            const streamGen = groq.chatCompletionStream({
                messages: groqMessages,
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 8192,
            });

            return new Response(createSSEStream(streamGen), {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            });
        }

        // ── Step 5: Non-streaming with tool calling ──
        const chatWithToolsOpts = {
            messages: groqMessages,
            tools: TOOL_DEFINITIONS,
            tool_choice: "auto" as const,
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 8192,
        };

        let reply: string | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let response: any;
        let toolResults: Array<{ name: string; result: string }> = [];

        // Reasoning models sometimes return empty content — retry up to 2 times
        for (let attempt = 0; attempt < 3; attempt++) {
            const result = await groq.chatWithTools(
                { ...chatWithToolsOpts, max_tokens: 8192 + attempt * 4096 },
                executeToolCall
            );
            response = result.response;
            toolResults = result.toolResults;
            reply = response.choices[0]?.message?.content;

            if (reply) break;
            console.warn(`[Copilot] Empty content (attempt ${attempt + 1}, finish_reason=${response.choices[0]?.finish_reason}), retrying...`);
        }

        if (!reply) {
            return NextResponse.json(
                { error: "Empty response from AI. Please try again." },
                { status: 502 }
            );
        }

        return NextResponse.json({
            reply,
            model: response.model,
            usage: response.usage,
            time_info: response.time_info,
            tools_used: toolResults.length > 0
                ? toolResults.map(t => t.name)
                : undefined,
        });

    } catch (error) {
        console.error("[Copilot] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        const status = (error as { status?: number })?.status || 500;
        return NextResponse.json({ error: message }, { status });
    }
}
