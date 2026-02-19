/**
 * Cerebras AI Client — High-Performance LLM Inference
 * ====================================================
 * 
 * OpenAI-compatible API client for Cerebras Cloud inference.
 * Supports streaming, function calling, and structured output.
 * 
 * Cerebras API: https://api.cerebras.ai/v1/chat/completions
 * Compatible with OpenAI chat completions format.
 */

/* ─── Types ─── */

export interface CerebrasMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: CerebrasToolCall[];
}

export interface CerebrasToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface CerebrasToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface CerebrasRequestOptions {
    model?: string;
    messages: CerebrasMessage[];
    tools?: CerebrasToolDefinition[];
    tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
    stop?: string[];
}

export interface CerebrasChoice {
    index: number;
    message: CerebrasMessage;
    finish_reason: "stop" | "tool_calls" | "length";
}

export interface CerebrasResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: CerebrasChoice[];
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

export interface CerebrasStreamDelta {
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

export interface CerebrasStreamChunk {
    id: string;
    choices: Array<{
        index: number;
        delta: CerebrasStreamDelta;
        finish_reason: string | null;
    }>;
}

/* ─── Constants ─── */

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_MODEL = "llama3.1-8b";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/* ─── Client ─── */

export class CerebrasClient {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
        this.apiKey = options?.apiKey || process.env.CEREBRAS_API_KEY || "";
        this.model = options?.model || process.env.CEREBRAS_MODEL || DEFAULT_MODEL;
        this.baseUrl = options?.baseUrl || CEREBRAS_API_URL;
    }

    /**
     * Non-streaming chat completion.
     * Returns the full response after inference completes.
     */
    async chatCompletion(options: CerebrasRequestOptions): Promise<CerebrasResponse> {
        const body = this.buildRequestBody({ ...options, stream: false });
        let lastError = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }

            try {
                const response = await fetch(this.baseUrl, {
                    method: "POST",
                    headers: this.buildHeaders(),
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    lastError = err.error?.message || `HTTP ${response.status}`;
                    console.error(`[Cerebras] Error (attempt ${attempt + 1}):`, lastError);

                    if (response.status === 429 || response.status >= 500) continue;
                    throw new CerebrasError(lastError, response.status);
                }

                const data: CerebrasResponse = await response.json();
                return data;
            } catch (e) {
                if (e instanceof CerebrasError) throw e;
                lastError = e instanceof Error ? e.message : "Unknown error";
                if (attempt === MAX_RETRIES) break;
            }
        }

        throw new CerebrasError(lastError || "All retries exhausted", 502);
    }

    /**
     * Streaming chat completion.
     * Returns an async iterator yielding text chunks.
     */
    async *chatCompletionStream(options: CerebrasRequestOptions): AsyncGenerator<CerebrasStreamChunk> {
        const body = this.buildRequestBody({ ...options, stream: true });

        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new CerebrasError(
                err.error?.message || `HTTP ${response.status}`,
                response.status
            );
        }

        if (!response.body) {
            throw new CerebrasError("No response body for streaming", 500);
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
                        const chunk: CerebrasStreamChunk = JSON.parse(data);
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
     * Execute a tool-augmented conversation.
     * Handles the full cycle: LLM → tool calls → tool results → LLM response.
     */
    async chatWithTools(
        options: CerebrasRequestOptions,
        toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>
    ): Promise<{ response: CerebrasResponse; toolResults: Array<{ name: string; result: string }> }> {
        const toolResults: Array<{ name: string; result: string }> = [];
        let messages = [...options.messages];
        let maxIterations = 5; // Prevent infinite tool loops

        while (maxIterations-- > 0) {
            const response = await this.chatCompletion({ ...options, messages });
            const choice = response.choices[0];

            if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
                return { response, toolResults };
            }

            // Execute each tool call
            messages.push(choice.message);

            for (const toolCall of choice.message.tool_calls) {
                const fnName = toolCall.function.name;
                let fnArgs: Record<string, unknown>;

                try {
                    fnArgs = JSON.parse(toolCall.function.arguments);
                } catch {
                    fnArgs = {};
                }

                let result: string;
                try {
                    result = await toolExecutor(fnName, fnArgs);
                    toolResults.push({ name: fnName, result });
                } catch (e) {
                    result = JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
                    toolResults.push({ name: fnName, result });
                }

                messages.push({
                    role: "tool",
                    content: result,
                    tool_call_id: toolCall.id,
                });
            }
        }

        // Fallback: if we hit max iterations, do a final completion without tools
        const finalResponse = await this.chatCompletion({
            ...options,
            messages,
            tools: undefined,
            tool_choice: undefined,
        });

        return { response: finalResponse, toolResults };
    }

    /* ─── Private Helpers ─── */

    private buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
        };
    }

    private buildRequestBody(options: CerebrasRequestOptions): Record<string, unknown> {
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

export class CerebrasError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "CerebrasError";
        this.status = status;
    }
}

/* ─── Singleton ─── */

let _clientInstance: CerebrasClient | null = null;

export function getCerebrasClient(): CerebrasClient {
    if (!_clientInstance) {
        _clientInstance = new CerebrasClient();
    }
    return _clientInstance;
}
