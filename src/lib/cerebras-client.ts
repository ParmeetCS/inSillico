/**
 * Cerebras AI Client — DEPRECATED: Now redirects to Groq Client
 * ================================================================
 * 
 * This file re-exports everything from groq-client.ts for backward compatibility.
 * The AI backend has been migrated to Groq.
 */

export {
    type GroqMessage as CerebrasMessage,
    type GroqToolCall as CerebrasToolCall,
    type GroqToolDefinition as CerebrasToolDefinition,
    type GroqRequestOptions as CerebrasRequestOptions,
    type GroqChoice as CerebrasChoice,
    type GroqResponse as CerebrasResponse,
    type GroqStreamDelta as CerebrasStreamDelta,
    type GroqStreamChunk as CerebrasStreamChunk,
    GroqClient as CerebrasClient,
    GroqError as CerebrasError,
    getGroqClient as getCerebrasClient,
} from "./groq-client";
