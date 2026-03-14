/**
 * Next.js API Route — Proxy to Network Pharmacology ML Backend
 * 
 * POST /api/network-pharmacology
 * Body: { smiles: string, action?: "full" | "targets" | "ppi" | "pathways" | "diseases", ... }
 * 
 * Forwards requests to the Python Flask ML backend network pharmacology endpoints.
 * No mock fallback — all data comes from the real ML backend.
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "https://insillico.onrender.com";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { smiles, action = "full" } = body;

        if (!smiles && action !== "ppi" && action !== "pathways" && action !== "diseases") {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Map action to ML server endpoint
        const endpointMap: Record<string, string> = {
            full: "/network/full-analysis",
            targets: "/network/targets",
            ppi: "/network/ppi",
            pathways: "/network/pathways",
            diseases: "/network/diseases",
            "disease-inference": "/network/disease-inference",
        };

        const endpoint = endpointMap[action] || "/network/full-analysis";

        // Network pharmacology queries multiple external APIs — generous timeout
        // Also accounts for Render cold-start time
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

        try {
            const response = await fetch(`${ML_SERVER_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: `ML server error (${response.status})` }));
                return NextResponse.json(err, { status: response.status });
            }

            const result = await response.json();
            return NextResponse.json(result);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            const isAbort = fetchError instanceof DOMException && fetchError.name === "AbortError";
            console.error("ML Server error (network pharmacology):", fetchError);
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
        console.error("Network Pharmacology API Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
