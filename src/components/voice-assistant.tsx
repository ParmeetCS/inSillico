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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ─── Types ─── */
type AssistantState = "idle" | "listening" | "processing" | "speaking";

interface VoiceMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
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
        label: "Thinking...",
        bgGlow: "rgba(139,92,246,0.3)",
    },
    speaking: {
        color: "var(--accent-green)",
        gradient: "linear-gradient(135deg, #10b981, #06b6d4)",
        label: "Speaking...",
        bgGlow: "rgba(16,185,129,0.3)",
    },
};

export default function VoiceAssistant() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<AssistantState>("idle");
    const [transcript, setTranscript] = useState("");
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);

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

    // Set default position on mount
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

    /* ─── Speech Recognition Setup ─── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function createRecognition(): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;

        if (!SpeechRecognitionCtor) return null;

        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        return recognition;
    }

    /* ─── Start Listening ─── */
    const startListening = useCallback(() => {
        if (state === "processing" || state === "speaking") return;

        // Stop any ongoing speech
        window.speechSynthesis.cancel();

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
            // Use ref to avoid stale closure
            const finalText = transcriptRef.current;
            if (finalText.trim()) {
                processQuery(finalText.trim());
            } else {
                setState("idle");
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === "no-speech" || event.error === "aborted") {
                // Silent — expected when user taps mic but doesn't speak
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
            setState("idle");
        }
    }, [state, transcript]);

    /* ─── Stop Listening ─── */
    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            // onend will fire after stop() and handle processQuery via transcriptRef
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    }, []);

    /* ─── Process Query via Copilot API ─── */
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

        try {
            const allMessages = [...conversationRef.current, userMsg].map((m) => ({
                role: m.role,
                content: m.content,
            }));

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

            const assistantMsg: VoiceMessage = {
                id: `asst-${Date.now()}`,
                role: "assistant",
                content: data.reply,
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMsg]);

            // Speak the response
            if (!isMuted) {
                speakText(data.reply);
            } else {
                setState("idle");
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Something went wrong";
            toast(errMsg, "error");
            setState("idle");
        }
    };

    /* ─── Text-to-Speech ─── */
    const speakText = (text: string) => {
        // Strip markdown formatting for cleaner speech
        const cleanText = text
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/#{1,3}\s/g, "")
            .replace(/[-*]\s/g, "")
            .replace(/\|/g, "")
            .replace(/\n+/g, ". ")
            .trim();

        setState("speaking");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Pick a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
            (v) =>
                v.name.includes("Google") ||
                v.name.includes("Samantha") ||
                v.name.includes("Microsoft Zira") ||
                v.name.includes("Microsoft Mark") ||
                v.lang.startsWith("en")
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
        setState("idle");
    };

    /* ─── Handle main button click ─── */
    const handleMainAction = () => {
        if (!isOpen) {
            setIsOpen(true);
            haptic("medium");
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

    /* ─── Drag Handlers ─── */
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
            const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
            const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

            setPosition({
                x: Math.max(30, Math.min(window.innerWidth - 30, clientX - dragOffset.current.x)),
                y: Math.max(30, Math.min(window.innerHeight - 30, clientY - dragOffset.current.y)),
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
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch { /* ignore */ }
            }
        };
    }, []);

    // Preload voices
    useEffect(() => {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }, []);

    const stateConfig = STATE_CONFIG[state];

    if (position.x === -1) return null; // Wait for position init

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
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        style={{
                            position: "absolute",
                            bottom: 40,
                            right: -10,
                            width: 340,
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
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                                            fontFamily: "var(--font-outfit), sans-serif",
                                        }}
                                    >
                                        Voice Copilot
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "0.65rem",
                                            color: stateConfig.color,
                                            fontWeight: 600,
                                        }}
                                    >
                                        {stateConfig.label}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                                <GripVertical
                                    size={14}
                                    style={{ color: "var(--text-muted)", opacity: 0.5 }}
                                />
                                <button
                                    onClick={() => setShowTranscript(!showTranscript)}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: showTranscript ? "var(--accent-blue)" : "var(--text-muted)",
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
                                        color: isMuted ? "var(--accent-red)" : "var(--text-muted)",
                                        padding: 4,
                                        borderRadius: 6,
                                    }}
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        stopSpeaking();
                                        if (recognitionRef.current) {
                                            try { recognitionRef.current.stop(); } catch { /* */ }
                                        }
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
                                    animate={{ height: 200 }}
                                    exit={{ height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{
                                        overflow: "hidden",
                                        borderBottom: "1px solid var(--glass-border)",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: 200,
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
                                                molecules, properties, or drug design
                                            </div>
                                        ) : (
                                            messages.map((msg) => (
                                                <div
                                                    key={msg.id}
                                                    style={{
                                                        display: "flex",
                                                        justifyContent:
                                                            msg.role === "user" ? "flex-end" : "flex-start",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            maxWidth: "85%",
                                                            padding: "8px 12px",
                                                            borderRadius:
                                                                msg.role === "user"
                                                                    ? "12px 12px 4px 12px"
                                                                    : "4px 12px 12px 12px",
                                                            background:
                                                                msg.role === "user"
                                                                    ? "rgba(59,130,246,0.15)"
                                                                    : "rgba(255,255,255,0.05)",
                                                            border: `1px solid ${msg.role === "user"
                                                                    ? "rgba(59,130,246,0.25)"
                                                                    : "var(--glass-border)"
                                                                }`,
                                                            fontSize: "0.72rem",
                                                            lineHeight: 1.5,
                                                            color: "var(--text-primary)",
                                                        }}
                                                    >
                                                        {msg.content.length > 200
                                                            ? msg.content.slice(0, 200) + "..."
                                                            : msg.content}
                                                    </div>
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
                                {(state === "listening" || state === "speaking") && (
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
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        style={{
                                            position: "absolute",
                                            inset: -6,
                                            borderRadius: "50%",
                                            border: "2px solid transparent",
                                            borderTopColor: "var(--accent-purple)",
                                            borderRightColor: "var(--accent-blue)",
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
                                            state === "processing" ? "wait" : "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        boxShadow: `0 4px 20px ${stateConfig.bgGlow}`,
                                        position: "relative",
                                        zIndex: 1,
                                        transition: "box-shadow 0.3s ease",
                                    }}
                                >
                                    {state === "idle" && <Mic size={26} color="white" />}
                                    {state === "listening" && <MicOff size={26} color="white" />}
                                    {state === "processing" && (
                                        <Loader2
                                            size={26}
                                            color="white"
                                            style={{ animation: "spin 1s linear infinite" }}
                                        />
                                    )}
                                    {state === "speaking" && <Square size={22} color="white" />}
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
                                {state === "idle" && "Tap to start speaking"}
                                {state === "listening" && "Tap again to stop & send"}
                                {state === "processing" && "Analyzing your query..."}
                                {state === "speaking" && "Tap to stop speaking"}
                            </div>

                            {/* Quick suggestion chips */}
                            {state === "idle" && messages.length === 0 && (
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
                                        "Explain TPSA",
                                        "Drug-likeness rules",
                                    ].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => processQuery(q)}
                                            style={{
                                                padding: "5px 10px",
                                                borderRadius: 20,
                                                fontSize: "0.65rem",
                                                fontWeight: 500,
                                                background: "rgba(255,255,255,0.05)",
                                                border: "1px solid var(--glass-border)",
                                                color: "var(--text-secondary)",
                                                cursor: "pointer",
                                                transition: "all 0.2s",
                                                whiteSpace: "nowrap",
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = "rgba(59,130,246,0.3)";
                                                e.currentTarget.style.color = "var(--accent-blue-light)";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = "var(--glass-border)";
                                                e.currentTarget.style.color = "var(--text-secondary)";
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Floating Orb (always visible) ─── */}
            <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onMouseDown={(e) => {
                    // Allow drag from the orb
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startTime = Date.now();

                    const handleMouseMove = (me: MouseEvent) => {
                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;

                        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                            setIsDragging(true);
                            setPosition({
                                x: Math.max(30, Math.min(window.innerWidth - 30, position.x + dx)),
                                y: Math.max(30, Math.min(window.innerHeight - 30, position.y + dy)),
                            });
                        }
                    };

                    const handleMouseUp = (me: MouseEvent) => {
                        window.removeEventListener("mousemove", handleMouseMove);
                        window.removeEventListener("mouseup", handleMouseUp);

                        const dx = me.clientX - startX;
                        const dy = me.clientY - startY;
                        const elapsed = Date.now() - startTime;

                        // Only toggle if it was a click, not a drag
                        if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && elapsed < 300) {
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
                    boxShadow: `0 4px 24px ${stateConfig.bgGlow}, 0 0 0 ${state === "listening" || state === "speaking" ? "4px" : "0px"} ${stateConfig.bgGlow}`,
                    transition: "width 0.2s, height 0.2s, box-shadow 0.3s",
                    position: "relative",
                }}
            >
                {/* Pulsing ring on orb when active */}
                {(state === "listening" || state === "speaking") && !isOpen && (
                    <motion.div
                        animate={{
                            scale: [1, 1.8],
                            opacity: [0.5, 0],
                        }}
                        transition={{ duration: 1.2, repeat: Infinity }}
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
                        style={{ animation: "spin 1s linear infinite" }}
                    />
                ) : (
                    <Mic size={isOpen ? 20 : 24} color="white" />
                )}
            </motion.div>
        </div>
    );
}
