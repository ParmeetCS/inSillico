/**
 * Gemini AI Client — via OpenRouter
 * ====================================================
 * 
 * OpenAI-compatible API client for Google Gemma 3n via OpenRouter.
 * Supports streaming, function calling, and structured output.
 * 
 * Model: google/gemma-3n-e4b-it:free
 * API: https://openrouter.ai/api/v1/chat/completions
 */

/* ─── Types ─── */

export interface GeminiMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: GeminiToolCall[];
}

export interface GeminiToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface GeminiToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface GeminiRequestOptions {
    model?: string;
    messages: GeminiMessage[];
    tools?: GeminiToolDefinition[];
    tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
    stop?: string[];
}

export interface GeminiChoice {
    index: number;
    message: GeminiMessage;
    finish_reason: "stop" | "tool_calls" | "length";
}

export interface GeminiResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: GeminiChoice[];
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

export interface GeminiStreamDelta {
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

export interface GeminiStreamChunk {
    id: string;
    choices: Array<{
        index: number;
        delta: GeminiStreamDelta;
        finish_reason: string | null;
    }>;
}

/* ─── Constants ─── */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-3n-e4b-it:free";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/* ─── Client ─── */

export class GeminiClient {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
        this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || "";
        this.model = options?.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
        this.baseUrl = options?.baseUrl || OPENROUTER_API_URL;
    }

    /**
     * Non-streaming chat completion.
     * Returns the full response after inference completes.
     */
    async chatCompletion(options: GeminiRequestOptions): Promise<GeminiResponse> {
        const body = this.buildRequestBody({ ...options, stream: false });
        let lastError = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }

            if (attempt === 0) {
                console.log(`[Gemini] Request — model: ${body.model}, messages: ${(body.messages as unknown[]).length}, tools in body: ${"tools" in body}, stream: ${body.stream}`);
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
                    console.error(`[Gemini] Error (attempt ${attempt + 1}):`, lastError);
                    console.error(`[Gemini] Full error response:`, errText.slice(0, 500));

                    if (response.status === 429 || response.status >= 500) continue;
                    throw new GeminiError(lastError, response.status);
                }

                const data: GeminiResponse = await response.json();
                return data;
            } catch (e) {
                if (e instanceof GeminiError) throw e;
                lastError = e instanceof Error ? e.message : "Unknown error";
                if (attempt === MAX_RETRIES) break;
            }
        }

        throw new GeminiError(lastError || "All retries exhausted", 502);
    }

    /**
     * Streaming chat completion.
     * Returns an async iterator yielding text chunks.
     */
    async *chatCompletionStream(options: GeminiRequestOptions): AsyncGenerator<GeminiStreamChunk> {
        const body = this.buildRequestBody({ ...options, stream: true });

        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new GeminiError(
                err.error?.message || `HTTP ${response.status}`,
                response.status
            );
        }

        if (!response.body) {
            throw new GeminiError("No response body for streaming", 500);
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
                        const chunk: GeminiStreamChunk = JSON.parse(data);
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
     * This is used for models that don't support the formal OpenAI tools API.
     */
    private buildToolPrompt(tools: GeminiToolDefinition[]): string {
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
     * because the free Gemma model on OpenRouter does not support formal tool_calls API.
     */
    async chatWithTools(
        options: GeminiRequestOptions,
        toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>
    ): Promise<{ response: GeminiResponse; toolResults: Array<{ name: string; result: string }> }> {
        const toolResults: Array<{ name: string; result: string }> = [];
        let messages = [...options.messages];

        // Strip tools/tool_choice from options — we use prompt-based calling instead
        const cleanOptions: GeminiRequestOptions = {
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
            console.log(`[Gemini] chatWithTools iteration ${5 - maxIterations}, messages: ${messages.length}, roles: ${messages.map(m => m.role).join(" → ")}`);
            const response = await this.chatCompletion({ ...cleanOptions, messages });
            const choice = response.choices[0];
            const content = choice.message?.content || "";

            // ── Detect tool calls embedded as text in the content ──
            const parsedToolCall = this.extractToolCallFromText(content);

            if (parsedToolCall) {
                // The model output a tool call as text — execute it and loop back
                const { name: fnName, args: fnArgs } = parsedToolCall;
                console.log(`[Gemini] Tool call detected: ${fnName}`, fnArgs);

                let result: string;
                try {
                    result = await toolExecutor(fnName, fnArgs);
                    toolResults.push({ name: fnName, result });
                } catch (e) {
                    result = JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
                    toolResults.push({ name: fnName, result });
                }

                // Feed the tool call and result back as regular messages
                // (no "tool" role since the model doesn't support it)
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
            "HTTP-Referer": "https://insillico.app",
            "X-Title": "InSilico Lab",
        };
    }

    private buildRequestBody(options: GeminiRequestOptions): Record<string, unknown> {
        // Gemma 3n does not support "system" role (Developer instruction).
        // Convert system messages: merge into the first user message as a preamble.
        let messages = [...options.messages];
        const systemMsgs = messages.filter(m => m.role === "system");
        if (systemMsgs.length > 0) {
            const systemContent = systemMsgs.map(m => m.content).join("\n\n");
            messages = messages.filter(m => m.role !== "system");

            // Find first user message and prepend the system content
            const firstUserIdx = messages.findIndex(m => m.role === "user");
            if (firstUserIdx >= 0) {
                messages[firstUserIdx] = {
                    ...messages[firstUserIdx],
                    content: `[Instructions]\n${systemContent}\n[End Instructions]\n\n${messages[firstUserIdx].content}`,
                };
            } else {
                // No user message yet — add a synthetic user message with the system content
                messages.unshift({
                    role: "user",
                    content: `[Instructions]\n${systemContent}\n[End Instructions]\n\nPlease acknowledge you understand these instructions.`,
                });
            }
        }

        const body: Record<string, unknown> = {
            model: options.model || this.model,
            messages,
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

export class GeminiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "GeminiError";
        this.status = status;
    }
}

/* ─── Singleton ─── */

let _clientInstance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
    if (!_clientInstance) {
        _clientInstance = new GeminiClient();
    }
    return _clientInstance;
}

// Re-export with Cerebras-compatible aliases for backward compatibility
export type CerebrasMessage = GeminiMessage;
export type CerebrasToolCall = GeminiToolCall;
export type CerebrasToolDefinition = GeminiToolDefinition;
export type CerebrasRequestOptions = GeminiRequestOptions;
export type CerebrasChoice = GeminiChoice;
export type CerebrasResponse = GeminiResponse;
export type CerebrasStreamDelta = GeminiStreamDelta;
export type CerebrasStreamChunk = GeminiStreamChunk;
export const getCerebrasClient = getGeminiClient;
export { GeminiClient as CerebrasClient };
