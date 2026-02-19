/**
 * Next.js API Route — Proxy to ML Descriptors Endpoint
 * 
 * POST /api/descriptors
 * Body: { smiles: string }
 * 
 * Returns RDKit molecular descriptors used as features for QSPR prediction.
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "http://localhost:5001";

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

        const response = await fetch(`${ML_SERVER_URL}/descriptors`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ smiles }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: "ML server error" }));
            return NextResponse.json(err, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("Descriptors error:", error);
        return NextResponse.json(
            { error: "Failed to connect to ML server." },
            { status: 503 }
        );
    }
}
