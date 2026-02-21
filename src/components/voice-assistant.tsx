"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    X,
    Loader2,
    Sparkles,
    GripVertical,
    Square,
    MessageSquare,
    Zap,
    Wifi,
    WifiOff,
    FlaskConical,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ═══════════════════════════════════════════════════════════
   PersonaPlex Voice Assistant — Gemini AI + NVIDIA Riva
   ═══════════════════════════════════════════════════════════ */

/* ─── Types ─── */
type AssistantState = "idle" | "listening" | "processing" | "speaking";

interface VoiceMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    toolCalls?: ToolCallResult[];
    latencyMs?: number;
}

interface ToolCallResult {
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
}

interface SessionCapabilities {
    riva_asr: boolean;
    riva_tts: boolean;
    cerebras_ai: boolean; // kept for backward compat with Python backend
    tool_calling: boolean;
    streaming: boolean;
}

interface VoiceSession {
    sessionId: string;
    capabilities: SessionCapabilities;
}

/* ─── Speech Recognition Types ─── */
interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
    error: string;
    message?: string;
}

/* ─── Constants ─── */
const ML_BACKEND = process.env.NEXT_PUBLIC_ML_BACKEND_URL || "http://localhost:5001";

const STATE_CONFIG = {
    idle: {
        color: "var(--accent-blue)",
        gradient: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
        label: "Tap to speak",
        bgGlow: "rgba(59,130,246,0.3)",
    },
    listening: {
        color: "#ef4444",
        gradient: "linear-gradient(135deg, #ef4444, #f97316)",
        label: "Listening...",
        bgGlow: "rgba(239,68,68,0.4)",
    },
    processing: {
        color: "var(--accent-purple)",
        gradient: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
        label: "Gemini AI thinking...",
        bgGlow: "rgba(139,92,246,0.3)",
    },
    speaking: {
        color: "var(--accent-green)",
        gradient: "linear-gradient(135deg, #10b981, #06b6d4)",
        label: "Speaking...",
        bgGlow: "rgba(16,185,129,0.3)",
    },
};

const WAVEFORM_BARS = 24;

export default function VoiceAssistant() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<AssistantState>("idle");
    const [transcript, setTranscript] = useState("");
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);

    // PersonaPlex session
    const [session, setSession] = useState<VoiceSession | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Audio visualization
    const [audioLevels, setAudioLevels] = useState<number[]>(
        new Array(WAVEFORM_BARS).fill(0)
    );
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    // Drag state
    const [position, setPosition] = useState({ x: -1, y: -1 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Speech refs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
    const conversationRef = useRef<VoiceMessage[]>([]);
    const transcriptRef = useRef("");
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    /* ─── Set default position on mount ─── */
    useEffect(() => {
        if (position.x === -1) {
            setPosition({
                x: window.innerWidth - 80,
                y: window.innerHeight - 80,
            });
        }
    }, [position.x]);

    // Keep conversation ref in sync
    useEffect(() => {
        conversationRef.current = messages;
    }, [messages]);

    // Auto-scroll transcript
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    /* ═══════════════════════════════════════════════════════════
       PersonaPlex Session Management
       ═══════════════════════════════════════════════════════════ */

    const createSession = useCallback(async () => {
        if (session || isConnecting) return;
        setIsConnecting(true);

        try {
            const res = await fetch(`${ML_BACKEND}/voice/session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user?.id || "anonymous",
                    context: { source: "voice_assistant" },
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to create voice session");
            }

            const data = await res.json();
            setSession({
                sessionId: data.session_id,
                capabilities: data.capabilities,
            });

            if (data.capabilities.cerebras_ai) {
                toast("PersonaPlex connected — Gemini AI ready", "success");
            } else {
                toast("Voice session created (Gemini not configured)", "info");
            }
        } catch (error) {
            console.warn("PersonaPlex session creation failed, using direct API fallback:", error);
            // Fallback: use the Next.js copilot API directly
            setSession({
                sessionId: `local-${Date.now()}`,
                capabilities: {
                    riva_asr: false,
                    riva_tts: false,
                    cerebras_ai: true,
                    tool_calling: true,
                    streaming: false,
                },
            });
        } finally {
            setIsConnecting(false);
        }
    }, [session, isConnecting, user?.id]);

    const endSession = useCallback(async () => {
        if (!session) return;

        if (!session.sessionId.startsWith("local-")) {
            try {
                await fetch(`${ML_BACKEND}/voice/session/${session.sessionId}`, {
                    method: "DELETE",
                });
            } catch {
                // Ignore cleanup errors
            }
        }

        setSession(null);
        stopAudioVisualization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    /* ═══════════════════════════════════════════════════════════
       Audio Visualization
       ═══════════════════════════════════════════════════════════ */

    const startAudioVisualization = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const audioCtx = new (window.AudioContext ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).webkitAudioContext)();
            audioContextRef.current = audioCtx;

            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.7;
            analyserRef.current = analyser;

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevels = () => {
                analyser.getByteFrequencyData(dataArray);

                const levels: number[] = [];
                const step = Math.floor(dataArray.length / WAVEFORM_BARS);
                for (let i = 0; i < WAVEFORM_BARS; i++) {
                    const idx = Math.min(i * step, dataArray.length - 1);
                    levels.push(dataArray[idx] / 255);
                }
                setAudioLevels(levels);

                animFrameRef.current = requestAnimationFrame(updateLevels);
            };

            updateLevels();
        } catch {
            // Microphone permission denied or unavailable
        }
    }, []);

    const stopAudioVisualization = useCallback(() => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevels(new Array(WAVEFORM_BARS).fill(0));
    }, []);

    /* ═══════════════════════════════════════════════════════════
       Speech Recognition (Browser ASR)
       ═══════════════════════════════════════════════════════════ */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function createRecognition(): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const SpeechRecognitionCtor =
            w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) return null;

        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        return recognition;
    }

    /* ─── Start Listening ─── */
    const startListening = useCallback(async () => {
        if (state === "processing" || state === "speaking") return;

        // Stop any ongoing speech
        window.speechSynthesis.cancel();
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current = null;
        }

        // Ensure session exists
        if (!session) {
            await createSession();
        }

        const recognition = createRecognition();
        if (!recognition) {
            toast("Speech recognition not supported in this browser", "error");
            return;
        }

        recognitionRef.current = recognition;
        setTranscript("");
        transcriptRef.current = "";
        setState("listening");
        haptic("medium");

        // Start audio visualization
        startAudioVisualization();

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = "";
            let interimTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            const text = finalTranscript || interimTranscript;
            setTranscript(text);
            transcriptRef.current = text;
        };

        recognition.onend = () => {
            stopAudioVisualization();
            const finalText = transcriptRef.current;
            if (finalText.trim()) {
                processQuery(finalText.trim());
            } else {
                setState("idle");
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            stopAudioVisualization();
            if (event.error === "no-speech" || event.error === "aborted") {
                setState("idle");
                return;
            }
            console.error("Speech recognition error:", event.error);
            toast("Could not hear you. Please try again.", "error");
            setState("idle");
        };

        try {
            recognition.start();
        } catch {
            stopAudioVisualization();
            setState("idle");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, session, createSession, startAudioVisualization, stopAudioVisualization]);

    /* ─── Stop Listening ─── */
    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    }, []);

    /* ═══════════════════════════════════════════════════════════
       Process Query via PersonaPlex / Gemini AI
       ═══════════════════════════════════════════════════════════ */

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const processQuery = async (query: string) => {
        setState("processing");
        haptic("light");

        const userMsg: VoiceMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: query,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);

        const startTime = performance.now();

        try {
            let responseText = "";
            let toolCalls: ToolCallResult[] = [];
            let latencyMs = 0;

            // Try PersonaPlex backend first (Flask /voice/process)
            if (session && !session.sessionId.startsWith("local-")) {
                const result = await processViaPersonaPlex(query);
                responseText = result.text;
                toolCalls = result.toolCalls;
                latencyMs = result.latencyMs;

                // If Riva TTS returned audio, play it
                if (result.audioBase64 && !isMuted) {
                    playRivaAudio(result.audioBase64);
                }
            } else {
                // Fallback to Next.js /api/copilot (Gemini via edge)
                const result = await processViaCopilotAPI(query);
                responseText = result.text;
                toolCalls = result.toolCalls;
                latencyMs = performance.now() - startTime;
            }

            const assistantMsg: VoiceMessage = {
                id: `asst-${Date.now()}`,
                role: "assistant",
                content: responseText,
                timestamp: new Date(),
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                latencyMs: Math.round(latencyMs),
            };

            setMessages((prev) => [...prev, assistantMsg]);

            // Speak response via Edge TTS (speakText handles fallback internally)
            if (!isMuted) {
                speakText(responseText);
            } else {
                setState("idle");
            }
        } catch (error) {
            const errMsg =
                error instanceof Error ? error.message : "Something went wrong";
            toast(errMsg, "error");
            setState("idle");
        }
    };

    /* ─── PersonaPlex Backend (Flask) ─── */
    const processViaPersonaPlex = async (
        query: string
    ): Promise<{
        text: string;
        toolCalls: ToolCallResult[];
        latencyMs: number;
        audioBase64: string | null;
    }> => {
        const res = await fetch(`${ML_BACKEND}/voice/process`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: session?.sessionId,
                text: query,
                user_context: user?.id || "",
            }),
        });

        if (!res.ok) {
            throw new Error("PersonaPlex processing failed");
        }

        const data = await res.json();
        return {
            text: data.text || "I couldn't generate a response.",
            toolCalls: (data.tool_calls || []).map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tc: any) => ({
                    name: tc.name,
                    args: tc.args || {},
                    result: tc.result,
                })
            ),
            latencyMs: data.latency_ms || 0,
            audioBase64: data.audio_base64 || null,
        };
    };

    /* ─── Copilot API Fallback (Next.js) ─── */
    const processViaCopilotAPI = async (
        query: string
    ): Promise<{ text: string; toolCalls: ToolCallResult[] }> => {
        const allMessages = [...conversationRef.current.slice(-10)].map(
            (m) => ({ role: m.role, content: m.content })
        );
        allMessages.push({ role: "user", content: query });

        const res = await fetch("/api/copilot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: allMessages,
                userId: user?.id,
                voiceMode: true,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to get response");
        }

        return {
            text: data.reply,
            toolCalls: (data.tools_used || []).map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tc: any) => ({
                    name: tc.name || tc,
                    args: tc.args || {},
                    result: tc.result,
                })
            ),
        };
    };

    /* ═══════════════════════════════════════════════════════════
       TTS — Edge Neural TTS (server) + Browser Fallback
       ═══════════════════════════════════════════════════════════ */

    const playRivaAudio = (base64Audio: string) => {
        setState("speaking");
        try {
            const audioData = Uint8Array.from(atob(base64Audio), (c) =>
                c.charCodeAt(0)
            );
            const blob = new Blob([audioData], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);

            const audio = new Audio(url);
            audioElementRef.current = audio;

            audio.onended = () => {
                setState("idle");
                URL.revokeObjectURL(url);
                audioElementRef.current = null;
            };
            audio.onerror = () => {
                setState("idle");
                URL.revokeObjectURL(url);
                audioElementRef.current = null;
            };

            audio.play().catch(() => {
                setState("idle");
            });
        } catch {
            setState("idle");
        }
    };

    /** Try server-side Edge TTS first, fall back to browser SpeechSynthesis */
    const speakText = async (text: string) => {
        // Strip markdown for cleaner speech
        const cleanText = text
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/#{1,3}\s/g, "")
            .replace(/[-*]\s/g, "")
            .replace(/\|/g, "")
            .replace(/\n+/g, ". ")
            .trim();

        if (!cleanText) {
            setState("idle");
            return;
        }

        setState("speaking");

        // Attempt Edge TTS via Flask server
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(`${ML_BACKEND}/voice/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: cleanText, voice: "en-US-AriaNeural" }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (res.ok && res.headers.get("content-type")?.includes("audio")) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audioElementRef.current = audio;

                audio.onended = () => {
                    setState("idle");
                    URL.revokeObjectURL(url);
                    audioElementRef.current = null;
                };
                audio.onerror = () => {
                    // Audio playback error — try browser fallback
                    URL.revokeObjectURL(url);
                    audioElementRef.current = null;
                    speakWithBrowser(cleanText);
                };

                await audio.play();
                return; // Edge TTS success
            }
        } catch {
            // Edge TTS failed (server down / timeout) — fall through to browser
        }

        // Browser SpeechSynthesis fallback
        speakWithBrowser(cleanText);
    };

    /** Browser Web Speech API fallback (lower quality) */
    const speakWithBrowser = (cleanText: string) => {
        if (!("speechSynthesis" in window)) {
            setState("idle");
            return;
        }
        setState("speaking");

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const voices = window.speechSynthesis.getVoices();
        // Prefer high-quality neural voices
        const preferred = voices.find(
            (v) =>
                v.name.includes("Microsoft") && v.name.includes("Online") && v.lang.startsWith("en")
        ) || voices.find(
            (v) =>
                v.name.includes("Google US") || v.name.includes("Google UK")
        ) || voices.find(
            (v) =>
                v.name.includes("Samantha") || v.name.includes("Microsoft Zira")
        ) || voices.find(
            (v) => v.lang.startsWith("en")
        );
        if (preferred) utterance.voice = preferred;

        utterance.onend = () => setState("idle");
        utterance.onerror = () => setState("idle");

        synthRef.current = utterance;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    };

    /* ─── Stop Speaking ─── */
    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current = null;
        }
        setState("idle");
    };

    /* ─── Handle main button click ─── */
    const handleMainAction = () => {
        if (!isOpen) {
            setIsOpen(true);
            haptic("medium");
            // Auto-create session when opening
            if (!session) createSession();
            return;
        }

        switch (state) {
            case "idle":
                startListening();
                break;
            case "listening":
                stopListening();
                break;
            case "speaking":
                stopSpeaking();
                break;
            case "processing":
                break;
        }
    };

    /* ═══════════════════════════════════════════════════════════
       Drag Handlers
       ═══════════════════════════════════════════════════════════ */

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        dragOffset.current = {
            x: clientX - position.x,
            y: clientY - position.y,
        };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX =
                "touches" in e ? e.touches[0].clientX : e.clientX;
            const clientY =
                "touches" in e ? e.touches[0].clientY : e.clientY;

            setPosition({
                x: Math.max(
                    30,
                    Math.min(
                        window.innerWidth - 30,
                        clientX - dragOffset.current.x
                    )
                ),
                y: Math.max(
                    30,
                    Math.min(
                        window.innerHeight - 30,
                        clientY - dragOffset.current.y
                    )
                ),
            });
        };

        const handleUp = () => setIsDragging(false);

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        window.addEventListener("touchmove", handleMove);
        window.addEventListener("touchend", handleUp);

        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            window.removeEventListener("touchmove", handleMove);
            window.removeEventListener("touchend", handleUp);
        };
    }, [isDragging]);

    /* ─── Clean up on unmount ─── */
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
            stopAudioVisualization();
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch {
                    /* ignore */
                }
            }
            if (audioElementRef.current) {
                audioElementRef.current.pause();
            }
        };
    }, [stopAudioVisualization]);

    // Preload voices
    useEffect(() => {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }, []);

    const stateConfig = STATE_CONFIG[state];

    if (position.x === -1) return null;

    /* ═══════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════ */

    return (
        <div
            ref={containerRef}
            style={{
                position: "fixed",
                left: position.x,
                top: position.y,
                transform: "translate(-50%, -50%)",
                zIndex: 9999,
                userSelect: "none",
            }}
        >
            {/* ─── Expanded Panel ─── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                        }}
                        style={{
                            position: "absolute",
                            bottom: 40,
                            right: -10,
                            width: 360,
                            background: "rgba(10, 15, 30, 0.95)",
                            backdropFilter: "blur(24px)",
                            WebkitBackdropFilter: "blur(24px)",
                            border: "1px solid var(--glass-border)",
                            borderRadius: 20,
                            overflow: "hidden",
                            boxShadow: `0 12px 48px rgba(0,0,0,0.5), 0 0 30px ${stateConfig.bgGlow}`,
                        }}
                    >
                        {/* Header */}
                        <div
                            style={{
                                padding: "14px 16px",
                                borderBottom: "1px solid var(--glass-border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                cursor: "grab",
                            }}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                }}
                            >
                                <div
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 10,
                                        background: stateConfig.gradient,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Sparkles size={16} color="white" />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontSize: "0.82rem",
                                            fontWeight: 700,
                                            fontFamily:
                                                "var(--font-outfit), sans-serif",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                        }}
                                    >
                                        PersonaPlex
                                        <Zap
                                            size={11}
                                            style={{
                                                color: session?.capabilities
                                                    .cerebras_ai
                                                    ? "#fbbf24"
                                                    : "var(--text-muted)",
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "0.65rem",
                                            color: stateConfig.color,
                                            fontWeight: 600,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                        }}
                                    >
                                        {isConnecting ? (
                                            <>
                                                <Loader2
                                                    size={10}
                                                    style={{
                                                        animation:
                                                            "spin 1s linear infinite",
                                                    }}
                                                />{" "}
                                                Connecting...
                                            </>
                                        ) : (
                                            stateConfig.label
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                                {/* Session status indicator */}
                                <div
                                    title={
                                        session
                                            ? "Session active — Edge Neural TTS"
                                            : "No session"
                                    }
                                    style={{
                                        padding: 4,
                                        display: "flex",
                                        alignItems: "center",
                                    }}
                                >
                                    {session ? (
                                        <Wifi
                                            size={12}
                                            style={{
                                                color: "var(--accent-green)",
                                            }}
                                        />
                                    ) : (
                                        <WifiOff
                                            size={12}
                                            style={{
                                                color: "var(--text-muted)",
                                                opacity: 0.5,
                                            }}
                                        />
                                    )}
                                </div>
                                <GripVertical
                                    size={14}
                                    style={{
                                        color: "var(--text-muted)",
                                        opacity: 0.5,
                                    }}
                                />
                                <button
                                    onClick={() =>
                                        setShowTranscript(!showTranscript)
                                    }
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: showTranscript
                                            ? "var(--accent-blue)"
                                            : "var(--text-muted)",
                                        padding: 4,
                                        borderRadius: 6,
                                    }}
                                    title="Toggle transcript"
                                >
                                    <MessageSquare size={14} />
                                </button>
                                <button
                                    onClick={() => setIsMuted(!isMuted)}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: isMuted
                                            ? "var(--accent-red)"
                                            : "var(--text-muted)",
                                        padding: 4,
                                        borderRadius: 6,
                                    }}
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? (
                                        <VolumeX size={14} />
                                    ) : (
                                        <Volume2 size={14} />
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        stopSpeaking();
                                        if (recognitionRef.current) {
                                            try {
                                                recognitionRef.current.stop();
                                            } catch {
                                                /* */
                                            }
                                        }
                                        stopAudioVisualization();
                                        setState("idle");
                                        haptic("light");
                                    }}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--text-muted)",
                                        padding: 4,
                                        borderRadius: 6,
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Transcript Area */}
                        <AnimatePresence>
                            {showTranscript && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 220 }}
                                    exit={{ height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{
                                        overflow: "hidden",
                                        borderBottom:
                                            "1px solid var(--glass-border)",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: 220,
                                            overflowY: "auto",
                                            padding: "10px 14px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 8,
                                        }}
                                    >
                                        {messages.length === 0 ? (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    height: "100%",
                                                    color: "var(--text-muted)",
                                                    fontSize: "0.75rem",
                                                    textAlign: "center",
                                                    lineHeight: 1.5,
                                                }}
                                            >
                                                Tap the mic and ask about
                                                <br />
                                                molecules, properties, or drug
                                                design
                                            </div>
                                        ) : (
                                            messages.map((msg) => (
                                                <div key={msg.id}>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent:
                                                                msg.role ===
                                                                "user"
                                                                    ? "flex-end"
                                                                    : "flex-start",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                maxWidth: "85%",
                                                                padding:
                                                                    "8px 12px",
                                                                borderRadius:
                                                                    msg.role ===
                                                                    "user"
                                                                        ? "12px 12px 4px 12px"
                                                                        : "4px 12px 12px 12px",
                                                                background:
                                                                    msg.role ===
                                                                    "user"
                                                                        ? "rgba(59,130,246,0.15)"
                                                                        : "rgba(255,255,255,0.05)",
                                                                border: `1px solid ${
                                                                    msg.role ===
                                                                    "user"
                                                                        ? "rgba(59,130,246,0.25)"
                                                                        : "var(--glass-border)"
                                                                }`,
                                                                fontSize:
                                                                    "0.72rem",
                                                                lineHeight: 1.5,
                                                                color: "var(--text-primary)",
                                                            }}
                                                        >
                                                            {msg.content
                                                                .length > 200
                                                                ? msg.content.slice(
                                                                      0,
                                                                      200
                                                                  ) + "..."
                                                                : msg.content}
                                                        </div>
                                                    </div>
                                                    {/* Tool call badges */}
                                                    {msg.toolCalls &&
                                                        msg.toolCalls.length >
                                                            0 && (
                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    gap: 4,
                                                                    marginTop: 4,
                                                                    flexWrap:
                                                                        "wrap",
                                                                }}
                                                            >
                                                                {msg.toolCalls.map(
                                                                    (
                                                                        tc,
                                                                        i
                                                                    ) => (
                                                                        <span
                                                                            key={
                                                                                i
                                                                            }
                                                                            style={{
                                                                                fontSize:
                                                                                    "0.6rem",
                                                                                padding:
                                                                                    "2px 8px",
                                                                                borderRadius: 12,
                                                                                background:
                                                                                    "rgba(139,92,246,0.15)",
                                                                                border: "1px solid rgba(139,92,246,0.25)",
                                                                                color: "#a78bfa",
                                                                                display:
                                                                                    "flex",
                                                                                alignItems:
                                                                                    "center",
                                                                                gap: 3,
                                                                            }}
                                                                        >
                                                                            <FlaskConical
                                                                                size={
                                                                                    9
                                                                                }
                                                                            />
                                                                            {tc.name.replace(
                                                                                "_",
                                                                                " "
                                                                            )}
                                                                        </span>
                                                                    )
                                                                )}
                                                            </div>
                                                        )}
                                                    {/* Latency badge */}
                                                    {msg.latencyMs &&
                                                        msg.role ===
                                                            "assistant" && (
                                                            <div
                                                                style={{
                                                                    fontSize:
                                                                        "0.58rem",
                                                                    color: "var(--text-muted)",
                                                                    marginTop: 2,
                                                                    opacity: 0.6,
                                                                }}
                                                            >
                                                                {msg.latencyMs}ms
                                                                via Gemini
                                                            </div>
                                                        )}
                                                </div>
                                            ))
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Voice Visualizer */}
                        <div
                            style={{
                                padding: "24px 16px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 16,
                            }}
                        >
                            {/* Waveform visualization (while listening) */}
                            {state === "listening" && (
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 2,
                                        height: 32,
                                        width: "100%",
                                    }}
                                >
                                    {audioLevels.map((level, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{
                                                height: Math.max(
                                                    3,
                                                    level * 28 +
                                                        Math.sin(
                                                            Date.now() / 200 + i
                                                        ) *
                                                            3
                                                ),
                                            }}
                                            transition={{
                                                duration: 0.08,
                                                ease: "easeOut",
                                            }}
                                            style={{
                                                width: 3,
                                                borderRadius: 2,
                                                background: `linear-gradient(180deg, #ef4444, #f97316)`,
                                                opacity:
                                                    0.4 +
                                                    level * 0.6,
                                            }}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Live transcript while listening */}
                            {state === "listening" && transcript && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        fontSize: "0.82rem",
                                        color: "var(--text-secondary)",
                                        textAlign: "center",
                                        fontStyle: "italic",
                                        maxWidth: "90%",
                                        lineHeight: 1.5,
                                    }}
                                >
                                    &ldquo;{transcript}&rdquo;
                                </motion.div>
                            )}

                            {/* Central Mic Button with Rings */}
                            <div style={{ position: "relative" }}>
                                {/* Pulsing rings for listening/speaking */}
                                {(state === "listening" ||
                                    state === "speaking") && (
                                    <>
                                        {[0, 1, 2].map((i) => (
                                            <motion.div
                                                key={i}
                                                animate={{
                                                    scale: [1, 2.2],
                                                    opacity: [0.4, 0],
                                                }}
                                                transition={{
                                                    duration: 1.5,
                                                    repeat: Infinity,
                                                    delay: i * 0.4,
                                                    ease: "easeOut",
                                                }}
                                                style={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    borderRadius: "50%",
                                                    border: `2px solid ${stateConfig.color}`,
                                                }}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Processing spinner */}
                                {state === "processing" && (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            ease: "linear",
                                        }}
                                        style={{
                                            position: "absolute",
                                            inset: -6,
                                            borderRadius: "50%",
                                            border: "2px solid transparent",
                                            borderTopColor:
                                                "var(--accent-purple)",
                                            borderRightColor:
                                                "var(--accent-blue)",
                                        }}
                                    />
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={handleMainAction}
                                    style={{
                                        width: 64,
                                        height: 64,
                                        borderRadius: "50%",
                                        background: stateConfig.gradient,
                                        border: "none",
                                        cursor:
                                            state === "processing"
                                                ? "wait"
                                                : "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        boxShadow: `0 4px 20px ${stateConfig.bgGlow}`,
                                        position: "relative",
                                        zIndex: 1,
                                        transition:
                                            "box-shadow 0.3s ease",
                                    }}
                                >
                                    {state === "idle" && (
                                        <Mic size={26} color="white" />
                                    )}
                                    {state === "listening" && (
                                        <MicOff size={26} color="white" />
                                    )}
                                    {state === "processing" && (
                                        <Loader2
                                            size={26}
                                            color="white"
                                            style={{
                                                animation:
                                                    "spin 1s linear infinite",
                                            }}
                                        />
                                    )}
                                    {state === "speaking" && (
                                        <Square size={22} color="white" />
                                    )}
                                </motion.button>
                            </div>

                            {/* Status label */}
                            <div
                                style={{
                                    fontSize: "0.72rem",
                                    color: "var(--text-muted)",
                                    textAlign: "center",
                                    lineHeight: 1.5,
                                }}
                            >
                                {state === "idle" &&
                                    "Tap to start speaking"}
                                {state === "listening" &&
                                    "Tap again to stop & send"}
                                {state === "processing" &&
                                    "Gemini AI analyzing..."}
                                {state === "speaking" &&
                                    "Tap to stop speaking"}
                            </div>

                            {/* Quick suggestion chips */}
                            {state === "idle" &&
                                messages.length === 0 && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 6,
                                            justifyContent: "center",
                                        }}
                                    >
                                        {[
                                            "What is Aspirin's LogP?",
                                            "Predict Caffeine toxicity",
                                            "Drug-likeness of Ibuprofen",
                                        ].map((q) => (
                                            <button
                                                key={q}
                                                onClick={() =>
                                                    processQuery(q)
                                                }
                                                style={{
                                                    padding: "5px 10px",
                                                    borderRadius: 20,
                                                    fontSize: "0.65rem",
                                                    fontWeight: 500,
                                                    background:
                                                        "rgba(255,255,255,0.05)",
                                                    border: "1px solid var(--glass-border)",
                                                    color: "var(--text-secondary)",
                                                    cursor: "pointer",
                                                    transition:
                                                        "all 0.2s",
                                                    whiteSpace:
                                                        "nowrap",
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor =
                                                        "rgba(59,130,246,0.3)";
                                                    e.currentTarget.style.color =
                                                        "var(--accent-blue-light)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor =
                                                        "var(--glass-border)";
                                                    e.currentTarget.style.color =
                                                        "var(--text-secondary)";
                                                }}
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                )}

                            {/* Engine indicator */}
                            <div
                                style={{
                                    fontSize: "0.58rem",
                                    color: "var(--text-muted)",
                                    opacity: 0.5,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <Zap size={8} />
                                Gemini AI
                                {session?.capabilities.riva_tts && (
                                    <> + NVIDIA Riva</>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Floating Orb (always visible) ─── */}
            <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onMouseDown={(e) => {
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startTime = Date.now();

                    const handleMouseMove = (me: MouseEvent) => {
                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;

                        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                            setIsDragging(true);
                            setPosition({
                                x: Math.max(
                                    30,
                                    Math.min(
                                        window.innerWidth - 30,
                                        position.x + dx
                                    )
                                ),
                                y: Math.max(
                                    30,
                                    Math.min(
                                        window.innerHeight - 30,
                                        position.y + dy
                                    )
                                ),
                            });
                        }
                    };

                    const handleMouseUp = (me: MouseEvent) => {
                        window.removeEventListener(
                            "mousemove",
                            handleMouseMove
                        );
                        window.removeEventListener(
                            "mouseup",
                            handleMouseUp
                        );

                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;
                        const elapsed = Date.now() - startTime;

                        if (
                            Math.abs(dx) < 5 &&
                            Math.abs(dy) < 5 &&
                            elapsed < 300
                        ) {
                            handleMainAction();
                        }

                        setIsDragging(false);
                    };

                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                }}
                style={{
                    width: isOpen ? 48 : 56,
                    height: isOpen ? 48 : 56,
                    borderRadius: "50%",
                    background: stateConfig.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isDragging ? "grabbing" : "pointer",
                    boxShadow: `0 4px 24px ${stateConfig.bgGlow}, 0 0 0 ${
                        state === "listening" || state === "speaking"
                            ? "4px"
                            : "0px"
                    } ${stateConfig.bgGlow}`,
                    transition:
                        "width 0.2s, height 0.2s, box-shadow 0.3s",
                    position: "relative",
                }}
            >
                {/* Pulsing ring on orb when active */}
                {(state === "listening" || state === "speaking") &&
                    !isOpen && (
                        <motion.div
                            animate={{
                                scale: [1, 1.8],
                                opacity: [0.5, 0],
                            }}
                            transition={{
                                duration: 1.2,
                                repeat: Infinity,
                            }}
                            style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: "50%",
                                border: `2px solid ${stateConfig.color}`,
                            }}
                        />
                    )}

                {state === "processing" && !isOpen ? (
                    <Loader2
                        size={isOpen ? 20 : 24}
                        color="white"
                        style={{
                            animation: "spin 1s linear infinite",
                        }}
                    />
                ) : (
                    <Mic size={isOpen ? 20 : 24} color="white" />
                )}
            </motion.div>
        </div>
    );
}
