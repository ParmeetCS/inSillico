/**
 * Groq AI Client
 * ====================================================
 * 
 * OpenAI-compatible API client for Groq.
 * Supports streaming, function calling, and structured output.
 * 
 * Model: llama-3.3-70b-versatile
 * API: https://api.groq.com/openai/v1/chat/completions
 */

/* ─── Types ─── */

export interface GroqMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: GroqToolCall[];
}

export interface GroqToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface GroqToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface GroqRequestOptions {
    model?: string;
    messages: GroqMessage[];
    tools?: GroqToolDefinition[];
    tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
    stop?: string[];
}

export interface GroqChoice {
    index: number;
    message: GroqMessage;
    finish_reason: "stop" | "tool_calls" | "length";
}

export interface GroqResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: GroqChoice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    time_info?: {
        queue_time: number;
        prompt_time: number;
        completion_time: number;
        total_time: number;
    };
}

export interface GroqStreamDelta {
    role?: string;
    content?: string;
    tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
            name?: string;
            arguments?: string;
        };
    }>;
}

export interface GroqStreamChunk {
    id: string;
    choices: Array<{
        index: number;
        delta: GroqStreamDelta;
        finish_reason: string | null;
    }>;
}

/* ─── Constants ─── */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/* ─── Client ─── */

export class GroqClient {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
        this.apiKey = options?.apiKey || process.env.GROQ_API_KEY || "";
        this.model = options?.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
        this.baseUrl = options?.baseUrl || GROQ_API_URL;
    }

    /**
     * Non-streaming chat completion.
     * Returns the full response after inference completes.
     */
    async chatCompletion(options: GroqRequestOptions): Promise<GroqResponse> {
        const body = this.buildRequestBody({ ...options, stream: false });
        let lastError = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }

            if (attempt === 0) {
                console.log(`[Groq] Request — model: ${body.model}, messages: ${(body.messages as unknown[]).length}, tools in body: ${"tools" in body}, stream: ${body.stream}`);
            }

            try {
                const response = await fetch(this.baseUrl, {
                    method: "POST",
                    headers: this.buildHeaders(),
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "");
                    let err: Record<string, unknown> = {};
                    try { err = JSON.parse(errText); } catch { /* not JSON */ }
                    lastError = (err.error as { message?: string })?.message || `HTTP ${response.status}: ${errText.slice(0, 300)}`;
                    console.error(`[Groq] Error (attempt ${attempt + 1}):`, lastError);
                    console.error(`[Groq] Full error response:`, errText.slice(0, 500));

                    if (response.status === 429 || response.status >= 500) continue;
                    throw new GroqError(lastError, response.status);
                }

                const data: GroqResponse = await response.json();
                return data;
            } catch (e) {
                if (e instanceof GroqError) throw e;
                lastError = e instanceof Error ? e.message : "Unknown error";
                if (attempt === MAX_RETRIES) break;
            }
        }

        throw new GroqError(lastError || "All retries exhausted", 502);
    }

    /**
     * Streaming chat completion.
     * Returns an async iterator yielding text chunks.
     */
    async *chatCompletionStream(options: GroqRequestOptions): AsyncGenerator<GroqStreamChunk> {
        const body = this.buildRequestBody({ ...options, stream: true });

        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new GroqError(
                err.error?.message || `HTTP ${response.status}`,
                response.status
            );
        }

        if (!response.body) {
            throw new GroqError("No response body for streaming", 500);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;

                    const data = trimmed.slice(6);
                    if (data === "[DONE]") return;

                    try {
                        const chunk: GroqStreamChunk = JSON.parse(data);
                        yield chunk;
                    } catch {
                        // Skip malformed chunks
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Build a text description of tools for injection into the system prompt.
     * Fallback for models that don't support the formal OpenAI tools API.
     */
    private buildToolPrompt(tools: GroqToolDefinition[]): string {
        const toolDescriptions = tools.map((t) => {
            const fn = t.function;
            const params = fn.parameters as { properties?: Record<string, { type: string; description?: string }>; required?: string[] };
            const paramLines = params.properties
                ? Object.entries(params.properties).map(([key, val]) => {
                    const req = params.required?.includes(key) ? " (required)" : " (optional)";
                    return `    - ${key} (${val.type}${req}): ${val.description || ""}`;
                }).join("\n")
                : "    (no parameters)";
            return `### ${fn.name}\n${fn.description}\nParameters:\n${paramLines}`;
        }).join("\n\n");

        return `
## Available Tools
You have access to the following tools. To call a tool, respond with ONLY a JSON object (no other text, no markdown fences, no code blocks) in this exact format:
{"name": "tool_name", "parameters": {"param1": "value1", "param2": "value2"}}

CRITICAL RULES FOR TOOL CALLS:
- Your ENTIRE response must be ONLY the raw JSON object — nothing else
- Do NOT wrap in \`\`\`json code blocks
- Do NOT add any text before or after the JSON
- Do NOT explain what tool you are calling

${toolDescriptions}
`;
    }

    /**
     * Execute a tool-augmented conversation.
     * Handles the full cycle: LLM → tool calls → tool results → LLM response.
     *
     * Uses prompt-based tool calling (tool descriptions injected into system prompt)
     * as a robust fallback that works across all models.
     */
    async chatWithTools(
        options: GroqRequestOptions,
        toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>
    ): Promise<{ response: GroqResponse; toolResults: Array<{ name: string; result: string }> }> {
        const toolResults: Array<{ name: string; result: string }> = [];
        let messages = [...options.messages];

        // Strip tools/tool_choice from options — we use prompt-based calling instead
        const cleanOptions: GroqRequestOptions = {
            ...options,
            tools: undefined,
            tool_choice: undefined,
        };

        // Inject tool descriptions into the system prompt (first message)
        if (options.tools && options.tools.length > 0 && messages.length > 0 && messages[0].role === "system") {
            const toolPrompt = this.buildToolPrompt(options.tools);
            messages[0] = {
                ...messages[0],
                content: messages[0].content + "\n" + toolPrompt,
            };
        }

        let maxIterations = 5; // Prevent infinite tool loops

        while (maxIterations-- > 0) {
            console.log(`[Groq] chatWithTools iteration ${5 - maxIterations}, messages: ${messages.length}, roles: ${messages.map(m => m.role).join(" → ")}`);
            const response = await this.chatCompletion({ ...cleanOptions, messages });
            const choice = response.choices[0];
            const content = choice.message?.content || "";

            // ── Detect tool calls embedded as text in the content ──
            const parsedToolCall = this.extractToolCallFromText(content);

            if (parsedToolCall) {
                // The model output a tool call as text — execute it and loop back
                const { name: fnName, args: fnArgs } = parsedToolCall;
                console.log(`[Groq] Tool call detected: ${fnName}`, fnArgs);

                let result: string;
                try {
                    result = await toolExecutor(fnName, fnArgs);
                    toolResults.push({ name: fnName, result });
                } catch (e) {
                    result = JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
                    toolResults.push({ name: fnName, result });
                }

                // Feed the tool call and result back as regular messages
                messages.push({
                    role: "assistant",
                    content: content,
                });

                messages.push({
                    role: "user",
                    content: `[Tool Result for ${fnName}]\n${result}\n\nNow provide a natural language response to the user based on this tool result. Do NOT call another tool unless absolutely necessary.`,
                });

                // Continue looping to get the natural language response
                continue;
            }

            // No tool calls detected — return the response
            return { response, toolResults };
        }

        // Fallback: if we hit max iterations, do a final completion without tools
        const finalResponse = await this.chatCompletion({
            ...cleanOptions,
            messages,
        });

        return { response: finalResponse, toolResults };
    }

    /* ─── Private Helpers ─── */

    /**
     * Detect when the model outputs a tool call as plain text JSON
     * instead of using the structured tool_calls format.
     */
    private extractToolCallFromText(content: string): { name: string; args: Record<string, unknown> } | null {
        let trimmed = content.trim();
        
        // Strip markdown code fences: ```json ... ``` or ``` ... ```
        const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
        if (fenceMatch) {
            trimmed = fenceMatch[1].trim();
        }

        // Must look like JSON
        if (!trimmed.startsWith("{")) return null;

        try {
            const parsed = JSON.parse(trimmed);

            // Pattern 1: { "type": "function", "name": "...", "parameters": { ... } }
            if (parsed.type === "function" && typeof parsed.name === "string" && parsed.parameters) {
                return { name: parsed.name, args: parsed.parameters };
            }

            // Pattern 2: { "name": "...", "parameters": { ... } }
            if (typeof parsed.name === "string" && parsed.parameters && typeof parsed.parameters === "object") {
                return { name: parsed.name, args: parsed.parameters };
            }

            // Pattern 3: { "name": "...", "arguments": { ... } }
            if (typeof parsed.name === "string" && parsed.arguments && typeof parsed.arguments === "object") {
                return { name: parsed.name, args: parsed.arguments };
            }

            // Pattern 4: { "function": { "name": "...", "arguments": "..." } }
            if (parsed.function && typeof parsed.function.name === "string") {
                let args: Record<string, unknown> = {};
                if (typeof parsed.function.arguments === "string") {
                    try { args = JSON.parse(parsed.function.arguments); } catch { args = {}; }
                } else if (typeof parsed.function.arguments === "object") {
                    args = parsed.function.arguments;
                }
                return { name: parsed.function.name, args };
            }

            return null;
        } catch {
            // Try to extract JSON from mixed text + JSON content
            const jsonMatch = content.match(/\{[\s\S]*"name"\s*:\s*"(\w+)"[\s\S]*"(?:parameters|arguments)"\s*:\s*\{[\s\S]*\}[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const name = parsed.name;
                    const args = parsed.parameters || parsed.arguments || {};
                    if (typeof name === "string" && typeof args === "object") {
                        return { name, args };
                    }
                } catch {
                    return null;
                }
            }
            return null;
        }
    }

    private buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
        };
    }

    private buildRequestBody(options: GroqRequestOptions): Record<string, unknown> {
        // Groq supports system messages natively — no conversion needed
        const body: Record<string, unknown> = {
            model: options.model || this.model,
            messages: options.messages,
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            max_tokens: options.max_tokens ?? 2048,
            stream: options.stream ?? false,
        };

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools;
            body.tool_choice = options.tool_choice ?? "auto";
        }

        if (options.stop) {
            body.stop = options.stop;
        }

        return body;
    }

    /** Validate API key is present */
    isConfigured(): boolean {
        return this.apiKey.length > 0;
    }
}

/* ─── Error Class ─── */

export class GroqError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "GroqError";
        this.status = status;
    }
}

/* ─── Singleton ─── */

let _clientInstance: GroqClient | null = null;

export function getGroqClient(): GroqClient {
    if (!_clientInstance) {
        _clientInstance = new GroqClient();
    }
    return _clientInstance;
}

/* ─── Backward-compatible aliases ─── */

// Gemini aliases (for incremental migration)
export type GeminiMessage = GroqMessage;
export type GeminiToolCall = GroqToolCall;
export type GeminiToolDefinition = GroqToolDefinition;
export type GeminiRequestOptions = GroqRequestOptions;
export type GeminiChoice = GroqChoice;
export type GeminiResponse = GroqResponse;
export type GeminiStreamDelta = GroqStreamDelta;
export type GeminiStreamChunk = GroqStreamChunk;
export const getGeminiClient = getGroqClient;
export { GroqClient as GeminiClient };
export { GroqError as GeminiError };

// Cerebras aliases
export type CerebrasMessage = GroqMessage;
export type CerebrasToolCall = GroqToolCall;
export type CerebrasToolDefinition = GroqToolDefinition;
export type CerebrasRequestOptions = GroqRequestOptions;
export type CerebrasChoice = GroqChoice;
export type CerebrasResponse = GroqResponse;
export type CerebrasStreamDelta = GroqStreamDelta;
export type CerebrasStreamChunk = GroqStreamChunk;
export const getCerebrasClient = getGroqClient;
export { GroqClient as CerebrasClient };
