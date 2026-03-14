/**
 * Next.js API Route — Proxy to ML Descriptors Endpoint
 * 
 * POST /api/descriptors
 * Body: { smiles: string }
 * 
 * Returns RDKit molecular descriptors used as features for QSPR prediction.
 * 
 * No mock fallback — all descriptors come from the real ML backend.
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "https://insillico.onrender.com";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { smiles } = body;

        if (!smiles) {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Render free tier can cold-start in ~30–60s — use generous timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

        try {
            const response = await fetch(`${ML_SERVER_URL}/descriptors`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: `ML server error (${response.status})` }));
                return NextResponse.json(err, { status: response.status });
            }

            const data = await response.json();
            return NextResponse.json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            const isAbort = fetchError instanceof DOMException && fetchError.name === "AbortError";
            console.error("ML Server error (descriptors):", fetchError);
            return NextResponse.json(
                {
                    error: isAbort
                        ? "ML server timed out. The server may be waking up from sleep — please try again in 30 seconds."
                        : "ML server is unreachable. Please ensure the backend is running.",
                },
                { status: 503 }
            );
        }

    } catch (error) {
        console.error("Descriptors API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
