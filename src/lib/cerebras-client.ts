/**
 * Cerebras AI Client — DEPRECATED: Now redirects to Gemini Client
 * ================================================================
 * 
 * This file re-exports everything from gemini-client.ts for backward compatibility.
 * The AI backend has been migrated to Google Gemma 3n via OpenRouter.
 */

export {
    type GeminiMessage as CerebrasMessage,
    type GeminiToolCall as CerebrasToolCall,
    type GeminiToolDefinition as CerebrasToolDefinition,
    type GeminiRequestOptions as CerebrasRequestOptions,
    type GeminiChoice as CerebrasChoice,
    type GeminiResponse as CerebrasResponse,
    type GeminiStreamDelta as CerebrasStreamDelta,
    type GeminiStreamChunk as CerebrasStreamChunk,
    GeminiClient as CerebrasClient,
    GeminiError as CerebrasError,
    getGeminiClient as getCerebrasClient,
} from "./gemini-client";
