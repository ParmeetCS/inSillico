# 🧬 InSilico Formulator — Hackathon Pitch

---

## 🎯 The Problem

> **Drug discovery is broken.**

- It takes **10–15 years** and costs **$2.6 billion+** to bring a single drug to market.
- **90% of drug candidates fail** in clinical trials — often due to poor physicochemical properties (bad solubility, toxicity, blood-brain barrier issues) that could have been predicted earlier.
- Early-stage researchers and pharma students **lack access** to fast, intelligent tools — the existing commercial software costs **$10K–$100K/year** in licenses and requires weeks of setup.
- There is **no single platform** that combines molecular property prediction, 3D visualization, reaction simulation, and AI-assisted drug reasoning in one place.

**The result?** Promising drug candidates are abandoned late in the pipeline, wasting billions and costing lives.

---

## 💡 Our Solution — InSilico Formulator

**InSilico Formulator** is a full-stack, AI-powered drug formulation platform that puts an entire in-silico pharma lab in the browser — **free, instant, and intelligent**.

A researcher can:
1. **Draw or paste** a molecule (SMILES, 2D sketch, or Ketcher editor)
2. **Get instant ML predictions** for 6+ physicochemical properties
3. **Visualize the molecule in 3D** with interactive rotation, conformer animation, and thermal simulation
4. **Simulate chemical reactions** with animated bond formation/breaking in Three.js
5. **Talk to AI Assistance** that reasons like a senior medicinal chemist — via text or voice
6. **Export professional PDF reports** for publication or sharing

All from a single SMILES string. In under 30 seconds.

---

## 🔬 Core Features & Functionality

### 1. 🧪 ML-Powered Property Prediction (QSPR v2.0 Engine)

**What it does:** Predicts critical drug properties from a molecule's SMILES string.

| Predicted Property | What It Means | Training Data |
|---|---|---|
| **Aqueous Solubility (logS)** | Can the drug dissolve in water/blood? | ESOL — 1,128 compounds |
| **Lipophilicity (logD)** | Does it cross cell membranes? Too greasy? | Lipophilicity — 4,200 compounds |
| **Blood-Brain Barrier (BBB)** | Can it reach the brain? | BBBP — 2,050 compounds |
| **Clinical Toxicity** | Will it harm the patient? | ClinTox — 1,484 compounds |
| **TPSA** | Topological polar surface — oral absorption indicator | Computed via RDKit |
| **QED (Drug-Likeness)** | Overall "drug-likeness" score (0–1) | Computed via RDKit |

**How it works (under the hood):**
- Molecule → **RDKit** parses the SMILES → generates **Morgan Fingerprint (ECFP4)** with 2,048 bits
- Adds **8 physicochemical descriptors** (MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3)
- Resulting **2,056-dimensional feature vector** → fed into **Ensemble model**
- **Ensemble = RandomForest + XGBoost** with weights tuned by **Optuna Bayesian optimization**
- Trained on **MoleculeNet benchmarks** (scaffold split for real-world generalization)
- Returns predictions with **calibrated confidence scores** + optimal/moderate/poor classification

**Drug-Likeness Assessment:**
- **Lipinski Rule-of-Five** — oral bioavailability check (MW < 500, LogP < 5, HBD ≤ 5, HBA ≤ 10)
- **Veber Rules** — rotatable bonds and TPSA thresholds
- **Ghose Filter** — additional physicochemical constraints
- **PAINS/Brenk Alerts** — screens for problematic substructures (pan-assay interference)

**Key Innovation — LogP Hybrid Blending:**
```
LogP_final = w × LogP_QSPR + (1 − w) × LogP_Crippen
where w = 0.2 + 0.5 × confidence_QSPR
```
At high ML confidence, the ensemble dominates. At low confidence, RDKit's validated Crippen method takes over. This prevents catastrophic misprediction.

---

### 2. ⚗️ Reaction Lab — Three.js 3D Molecular Engine

**What it does:** A fully custom Three.js-based 3D visualization engine for molecules and chemical reactions.

**Capabilities:**
| Feature | Description |
|---|---|
| **3 Visualization Modes** | Ball-and-Stick, Space-Filling, Wireframe |
| **Reaction Animations** | Watch bonds break and form in real-time with smooth morphing |
| **Conformer Playback** | Animate through multiple 3D conformations of a molecule |
| **Thermal Vibration** | Temperature slider (0–5000 K) — atoms vibrate realistically |
| **Video Recording** | Record WebM videos of animations and download them |
| **Preset Reactions** | One-click load: Dehydration, Fischer Esterification, etc. |
| **Custom Input** | Enter any SMILES for reactant and product |

**Technical Architecture (10 custom modules):**
- `AtomMesh.ts` — Sphere geometry rendering with element-specific colors (CPK)
- `BondMesh.ts` — Cylinder geometry with single/double/triple bond support
- `ConformerAnimator.ts` — Frame interpolation for multi-conformer datasets
- `ReactionAnimator.ts` — Atom morphing between reactant → product states
- `VibrationEngine.ts` — Temperature-dependent random displacement
- `VideoRecorder.ts` — MediaRecorder API → WebM export
- `MolecularScene.tsx` — Main React component orchestrating all systems

**3D Geometry Pipeline:**
```
SMILES → Flask /generate-3d → RDKit AddHs → EmbedMultipleConfs
→ MMFF94 Optimization → atoms[] + bonds[] + conformers[] → Three.js
```
Fallback: Client-side `smiles-to-3d.ts` uses force-directed graph layout when ML server is offline.

---

### 3. 🤖 AI Assistance — Context-Aware Drug Discovery Assistant

**What it does:** A conversational AI that thinks like a medicinal chemist.

**Powered by:** Cerebras AI (llama3.1-8b) — ultra-fast inference

**Key Capabilities:**
- **Context-Aware RAG:** Automatically ingests the user's compound library, simulation results, and prediction data as context
- **Function Calling:** The AI can run live predictions, compare molecules, compute descriptors, and query QSPR datasets mid-conversation
- **Tool Definitions:** 5 callable functions — `run_prediction`, `get_descriptors`, `get_drug_likeness`, `compare_molecules`, `query_qspr_dataset`
- **Analytical Reasoning:** Identifies structure-activity relationships, flags red flags, spots optimization opportunities
- **Markdown Rendering:** Responses include formatted tables, highlighted values, and chemical annotations
- **Per-Compound Summary:** One-click 2–3 sentence analysis on any molecule card

**Example Interaction:**
```
User: "Compare Aspirin and Ibuprofen for blood-brain barrier penetration"
AI:   [Calls run_prediction for both molecules]
      [Generates side-by-side comparison with BBB probability, LogP, TPSA]
      [Explains: "Ibuprofen has higher predicted BBB penetration (0.87 vs 0.62)
       due to its higher LogP (3.97), though both pass Lipinski's rules..."]
```

---

### 4. 🎙️ PersonaPlex Voice AI Assistant

**What it does:** A floating voice orb on every page — tap and speak naturally to interact with the platform.

**Pipeline:**
```
User speaks → Browser ASR (Web Speech API) → Text
→ Cerebras AI (with function calling + tool execution)
→ Response text → Microsoft Edge Neural TTS → Audio playback
```

**4 Animated States:**
- 🔵 **Idle** — pulsing blue orb
- 🔴 **Listening** — red ripple animation
- 🟣 **Processing** — purple spin
- 🟢 **Speaking** — green wave

**Optional Enterprise:** NVIDIA Riva ASR/TTS for higher accuracy (auto-fallback to browser APIs).

**Voice Example:**
```
"Hey InSilico, what's the solubility of caffeine?"
→ [Runs prediction] → "Caffeine has a predicted aqueous solubility of -0.55 logS,
   which falls in the moderate range. It's reasonably soluble in water..."
```

---

### 5. 📊 Visualization & Analysis Suite

| Component | Technology | What It Shows |
|---|---|---|
| **3Dmol.js Viewer** | 3Dmol.js | Quick interactive 3D molecule rendering |
| **Three.js Molecular Scene** | Three.js | Full engine — reactions, conformers, vibration, recording |
| **Radar Chart** | Plotly.js | LogP, MW, HBD, HBA, TPSA, RotBonds at a glance |
| **Drug-Likeness Gauge** | Framer Motion | Animated dial showing Lipinski pass/fail score |
| **Toxicity Gauges** | Plotly.js | Per-endpoint safety visualization |
| **Solubility Curve** | Plotly.js | pH-dependent solubility profile |
| **Dashboard Charts** | Recharts | User simulation stats, credit usage, trends |
| **Ballpit Background** | Three.js | Interactive 3D particle background (landing page) |

---

### 6. 🧪 Molecule Input System — 3 Ways to Enter

1. **SMILES Input:** Paste any valid SMILES notation — the standard chemical line language
2. **2D Structure Drawing:** Custom canvas with atom palette (C, N, O, S, P, F, Cl, Br, I), bond tools, ring/chain builders, undo/redo
3. **Ketcher Editor:** Professional-grade EPAM Ketcher molecular editor with import/export

All methods auto-populate: SMILES string, molecular formula, and molecular weight.

---

### 7. 📋 Reports & Export

- **PDF Reports** (jsPDF) — molecule info, predicted properties, toxicity screening, drug-likeness scores, radar charts
- **CSV Export** — raw data for external analysis pipelines
- **Shareable Links** — copy-to-clipboard report URLs
- **Configurable Sections** — toggle what to include

---

### 8. 🔐 Authentication & Credits

- **Supabase** email/password auth with profiles
- **Credit System** — simulations cost credits (configurable per property count)
- **Real-time Deduction** — credits update instantly in the UI
- **Row-Level Security (RLS)** — users only see their own data
- **Protected Routes** — dashboard, simulations, molecules, results require login

---

## 🛠️ Technical Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 16 + React 19 + TypeScript)          │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Landing  │ │ Dashboard│ │ AI Assist│ │ Reaction   │  │
│  │ Page     │ │          │ │ Chat     │ │ Lab (3JS)  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       └─────────────┴────────────┴─────────────┘         │
│                         │                                │
│              Next.js API Routes (proxy layer)            │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼                               ▼
┌──────────────────────┐     ┌─────────────────────┐
│  Flask ML Server     │     │  Cerebras AI        │
│  (Python + RDKit)    │     │  (llama3.1-8b)      │
│                      │     │  Function Calling   │
│  • QSPR Ensemble     │     │  + RAG Context      │
│  • 3D Conformers     │     └─────────────────────┘
│  • Drug-Likeness     │
│  • Dataset Lookup    │
│  • PersonaPlex Voice │
│  • Edge TTS          │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Supabase            │
│  Auth + PostgreSQL   │
│  + Row Level Security│
└──────────────────────┘
```

### Tech Stack at a Glance

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Three.js, Framer Motion, Plotly.js, 3Dmol.js, Recharts, Ketcher, Lottie, jsPDF |
| **Backend** | Flask, RDKit, XGBoost, scikit-learn, Optuna, pandas, numpy |
| **AI** | Cerebras AI (llama3.1-8b), Edge TTS, NVIDIA Riva (optional) |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **Deployment** | Vercel (frontend), Railway + Docker (ML backend) |

---

## 🏆 What Makes Us Different?

| | InSilico Formulator | Existing Commercial Tools |
|---|---|---|
| **Cost** | **Free & open source** | $10K–$100K/year |
| **Setup** | **2 minutes** | Days to weeks |
| **AI Assistant** | Context-aware AI Assistance + voice | ❌ None |
| **3D Engine** | Custom Three.js (reactions, conformers, vibration, recording) | Static images |
| **Voice** | PersonaPlex (speak to predict) | ❌ None |
| **ML Predictions** | Ensemble (RF + XGB) with confidence scores | Single-model, no confidence |
| **Dataset Lookup** | Query 8,862 measured values mid-chat | Manual literature search |
| **Reports** | One-click PDF/CSV | Manual export |
| **Deployment** | Cloud-native (Vercel + Railway) | On-premises only |

---

## 🔢 By the Numbers

| Metric | Value |
|---|---|
| **ML Training Compounds** | 8,862 across 4 MoleculeNet datasets |
| **Feature Dimensions** | 2,056 (2048 ECFP4 + 8 physicochemical) |
| **ML Models** | 8 QSPR v2 ensemble + 4 legacy fallback = 12 total |
| **Predicted Properties** | 6+ (LogS, LogD, BBB, Toxicity, TPSA, QED, Drug-Likeness) |
| **API Endpoints** | 13 Flask + 6 Next.js = 19 total |
| **Voice Tools** | 5 function-call tools |
| **Visualization Modes** | 3 (ball-stick, space-filling, wireframe) |
| **Frontend Components** | 23+ custom React components |
| **Three.js Engine Modules** | 10 specialized modules |
| **Lottie Animations** | 2 animated assets |
| **Supabase Tables** | 5 (profiles, projects, molecules, simulations, prediction_results) |
| **Total Source Files** | ~80+ TypeScript/Python files |

---

## 🎬 Demo Flow (Suggested for Judges)

### Path 1: Quick Prediction (30 seconds)
1. Open app → Landing page with animated ballpit background
2. Click **"Start Simulation"** → New simulation page
3. Paste SMILES: `CC(=O)Oc1ccccc1C(=O)O` (Aspirin)
4. Hit **Predict** → See all 6 properties with confidence scores, color-coded status
5. Click **"Export PDF"** → Download professional report

### Path 2: 3D Reaction Lab (45 seconds)
1. Navigate to **Reactions** page
2. Click **"Dehydration"** preset → Ethanol → Ethylene + Water
3. Hit **Play** → Watch bond breaking/forming in 3D
4. Slide **Temperature** to 3000 K → See thermal vibration
5. Click **Record** → Download WebM video

### Path 3: AI Assistance (30 seconds)
1. Navigate to **AI Assistance** page
2. Type: *"Compare Aspirin and Caffeine for drug-likeness"*
3. Watch AI call prediction tools and return formatted analysis
4. Click the **voice orb** → Speak: *"What is Ibuprofen's solubility?"*
5. Hear the AI respond with neural TTS voice

### Path 4: Draw a Molecule (30 seconds)
1. Navigate to **Molecules → New**
2. Click **"Draw Structure"** tab
3. Draw a benzene ring → Add functional groups
4. See SMILES auto-generate → Click **Save**

---

## 👥 Team

| Name | Role |
|------|------|
| **Parmeet Singh** | Full-Stack Developer & ML Engineer |
| **Chetan Sharma** | Backend & AI Integration |
| **Niharika Khosla** | Frontend & UI/UX Design |
| **Muskan Bindal** | Data Science & Testing |

---

## 🔮 Future Vision

- **ADMET Expansion** — CYP inhibition, plasma protein binding, hERG cardiotoxicity
- **Retrosynthesis** — AI-suggested synthesis pathways
- **Molecular Docking** — Protein-ligand binding prediction
- **GNN Models** — Graph Neural Networks (GCN, AttentiveFP) for higher accuracy
- **Batch Prediction** — Upload CSV of 1000+ SMILES
- **PubChem/ChEMBL Integration** — Search 100M+ known compounds
- **Collaborative Workspaces** — Team research projects
- **No-Code QSAR Builder** — Train custom models on your data

---

<p align="center">
  <strong>InSilico Formulator — Making drug discovery accessible to everyone, powered by AI.</strong>
</p>
<p align="center">
  🧬 Built for the future of healthcare.
</p>
