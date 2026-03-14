/**
 * Next.js API Route — Compare RandomForest vs XGBoost (QSPR Ensemble)
 * 
 * POST /api/predict/compare
 * Body: { smiles: string }
 * 
 * Returns side-by-side predictions from both ensemble models.
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

        const response = await fetch(`${ML_SERVER_URL}/compare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ smiles }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: "ML server error" }));
            return NextResponse.json(err, { status: response.status });
        }

        const comparison = await response.json();
        return NextResponse.json(comparison);

    } catch (error) {
        console.error("ML Compare error:", error);
        return NextResponse.json(
            { error: "Failed to connect to ML prediction server." },
            { status: 503 }
        );
    }
}
