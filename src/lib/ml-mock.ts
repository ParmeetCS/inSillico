/**
 * ml-mock.ts — Mock ML Service for Client-Side Fallback
 * =======================================================
 * Simulates the Python ML backend when it's unavailable.
 * Generates deterministic pseudo-random predictions based on SMILES string hash.
 * This ensures consistent "predictions" for the same molecule across reloads.
 */

// ─── Deterministic Random Number Generator ───
function cyrb128(str: string) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number) {
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

// ─── Simple Molecular Weight Estimation ───
function estimateMW(smiles: string): number {
    const weights: Record<string, number> = { C: 12.01, N: 14.01, O: 16.00, F: 19.00, P: 30.97, S: 32.06, Cl: 35.45, Br: 79.90, I: 126.90, H: 1.01 };
    let mw = 0;
    // Count explicit atoms
    for (let i = 0; i < smiles.length; i++) {
        const char = smiles[i].toUpperCase();
        if (weights[char]) mw += weights[char];
        // Handle two-char elements like Cl, Br
        if (char === 'C' && smiles[i + 1] === 'l') { mw += (35.45 - 12.01); i++; }
        if (char === 'B' && smiles[i + 1] === 'r') { mw += (79.90 - 0); i++; } // B is boron but we treat single letters first
    }
    // Rough heuristic for hydrogens (saturation assumption: C ~ 1-2 H)
    const cCount = (smiles.match(/c/gi) || []).length;
    mw += cCount * 1.5 * 1.01;
    return Math.round(mw * 100) / 100;
}

// ─── Mock Data Generator ───
export function generateMockPrediction(smiles: string) {
    const seed = cyrb128(smiles);
    const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);

    // Generate property values
    const logp = -1 + rand() * 5; // -1 to 4
    const pka = rand() > 0.3 ? 3 + rand() * 10 : null; // 30% non-ionizable
    const solubility = Math.pow(10, -6 + rand() * 4) * 300; // logS converted
    const tpsa = 10 + rand() * 140;
    const bioavail = 20 + rand() * 80;
    const toxProb = rand();

    const mw = estimateMW(smiles);

    // Status helpers
    const getStatus = (val: number, type: string) => {
        if (type === 'logp') return val > 5 || val < -1 ? 'poor' : val > 3.5 ? 'moderate' : 'optimal';
        if (type === 'solubility') return val < 0.01 ? 'poor' : val < 0.1 ? 'moderate' : 'optimal';
        if (type === 'tpsa') return val > 140 || val < 20 ? 'moderate' : 'optimal';
        if (type === 'bioavail') return val < 30 ? 'poor' : val < 60 ? 'moderate' : 'optimal';
        return 'moderate';
    };

    return {
        smiles,
        molecule: {
            name: "Simulated Molecule",
            formula: `C${Math.floor(mw / 12)}H${Math.floor(mw / 12 * 1.5)}X`,
            molecular_weight: mw,
        },
        properties: {
            logp: {
                value: Number(logp.toFixed(2)),
                status: getStatus(logp, 'logp'),
                confidence: 0.85 + rand() * 0.1
            },
            pka: {
                value: pka ? Number(pka.toFixed(1)) : null,
                status: pka ? 'moderate' : 'optimal',
                confidence: 0.7 + rand() * 0.2,
                ionizable: !!pka
            },
            solubility: {
                value: Number(solubility.toFixed(3)),
                status: getStatus(solubility, 'solubility'),
                confidence: 0.8 + rand() * 0.15
            },
            tpsa: {
                value: Number(tpsa.toFixed(1)),
                status: getStatus(tpsa, 'tpsa'),
                confidence: 0.95
            },
            bioavailability: {
                value: Number(bioavail.toFixed(1)),
                status: getStatus(bioavail, 'bioavail'),
                confidence: 0.75 + rand() * 0.15
            },
            toxicity: {
                value: toxProb > 0.8 ? "High" : toxProb > 0.5 ? "Moderate" : "Low",
                status: toxProb > 0.8 ? "poor" : toxProb > 0.5 ? "moderate" : "optimal",
                confidence: 0.6 + rand() * 0.3
            }
        },
        toxicity_screening: {
            herg_inhibition: parseFloat((rand() * 0.5).toFixed(2)),
            ames_mutagenicity: parseFloat((rand() * 0.3).toFixed(2)),
            hepatotoxicity: parseFloat((rand() * 0.4).toFixed(2))
        },
        drug_likeness: {
            score: 0.4 + rand() * 0.5,
            classification: "Drug-like",
            qed: 0.3 + rand() * 0.6
        },
        confidence: Number((85 + rand() * 14).toFixed(1)),
        mock: true // Flag to indicate this is mock data
    };
}

export function generateMockDescriptors(smiles: string) {
    const seed = cyrb128(smiles);
    const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
    const mw = estimateMW(smiles);

    return {
        smiles,
        rdkit_properties: {
            molecular_weight: mw,
            formula: `C${Math.floor(mw / 14)}H${Math.floor(mw / 10)}X`, // rough guess
            exact_mass: mw - 0.05 + rand() * 0.1,
            logp_crippen: -1 + rand() * 5,
            tpsa: 10 + rand() * 120,
            hbd: Math.floor(rand() * 4),
            hba: Math.floor(rand() * 8),
            rotatable_bonds: Math.floor(rand() * 6),
            aromatic_rings: Math.floor(rand() * 3),
            rings: Math.floor(rand() * 4),
            heavy_atoms: Math.floor(mw / 13),
            fraction_csp3: rand(),
            molar_refractivity: 40 + rand() * 60,
            qed: rand()
        },
        descriptor_info: {
            type: "Morgan Fingerprint (Simulated)",
            length: 2048
        }
    };
}
