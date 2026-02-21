/**
 * Next.js API Route — Proxy to ML Descriptors Endpoint
 * 
 * POST /api/descriptors
 * Body: { smiles: string }
 * 
 * Returns RDKit molecular descriptors used as features for QSPR prediction.
 * 
 * Fallback: Uses client-side mock descriptors if backend is unreachable.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateMockDescriptors } from "@/lib/ml-mock";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "http://localhost:5001";

export async function POST(req: NextRequest) {
    let smiles = "";

    try {
        const body = await req.json();
        smiles = body.smiles;

        if (!smiles) {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Try to fetch from ML server with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for descriptors

        try {
            const response = await fetch(`${ML_SERVER_URL}/descriptors`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error(`ML Server Error: ${response.statusText}`);
                }
                const err = await response.json().catch(() => ({ error: "ML server error" }));
                return NextResponse.json(err, { status: response.status });
            }

            const data = await response.json();
            return NextResponse.json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            // Fallback to mock descriptors
            console.warn("ML Server unreachable or timed out for descriptors. Using mock fallback.", fetchError);
            const mockData = generateMockDescriptors(smiles);
            return NextResponse.json(mockData);
        }

    } catch (error) {
        console.error("Descriptors API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
