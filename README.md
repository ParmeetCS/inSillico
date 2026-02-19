<p align="center">
  <img width="60" height="60" alt="Gemini_Generated_Image_c2bzihc2bzihc2bz" src="https://github.com/user-attachments/assets/1a259672-4b3c-45f2-94e5-bcdf682ba972" />

</p>

<h1 align="center">🧬 InSilico Formulator</h1>

<p align="center">
  <strong>AI-Powered In-Silico Drug Formulation & Physicochemical Prediction Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-ml-models">ML Models</a> •
  <a href="#-available-scripts">Scripts</a> •
  <a href="#-team">Team</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1-black?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase" />
  <img src="https://img.shields.io/badge/Python-ML%20Backend-3776ab?logo=python" />
  <img src="https://img.shields.io/badge/QSPR-v2.0_Ensemble-ff6600" />
  <img src="https://img.shields.io/badge/RDKit-ECFP4_2048-005571" />
  <img src="https://img.shields.io/badge/Cerebras-AI_Copilot-8b5cf6" />
  <img src="https://img.shields.io/badge/PersonaPlex-Voice_AI-22c55e" />
</p>

---

## 🎯 Problem Statement

Drug discovery is one of the slowest, most expensive pipelines in healthcare — taking **10–15 years** and costing **$2.6 billion+** per approved drug. Early-stage researchers lack access to fast, intelligent tools that can predict molecular properties, flag ADMET risks, and suggest lead optimizations — all in one place.

**InSilico Formulator** solves this by putting an AI-powered drug formulation lab directly in the browser — combining ML-based property prediction, interactive molecular visualization, and a context-aware AI copilot that reasons like a senior medicinal chemist.

---

## ✨ Features

### 🔬 Molecular Property Prediction (QSPR v2.0)
- Predict **Aqueous Solubility (logS)**, **Lipophilicity (logD)**, **Blood-Brain Barrier Penetration**, and **Clinical Toxicity** from any SMILES input
- **QSPR v2.0 Ensemble Engine**: **RandomForest + XGBoost** with Optuna-tuned hyperparameters, trained on MoleculeNet benchmarks (ESOL, Lipophilicity, BBBP, ClinTox)
- **2056-dimensional feature vector**: Morgan Fingerprints (ECFP4, radius 2, 2048 bits) + 8 physicochemical descriptors (MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3)
- Drug-likeness assessment: Lipinski Rule-of-Five, Veber rules, Ghose filter + structural alert screening (PAINS/Brenk)
- **QSPR Dataset Lookup** — query training datasets for experimentally measured values by SMILES or compound name
- Each property classified as `optimal` / `moderate` / `poor` with color-coded insights

### 🧪 Multiple Molecule Input Methods
| Method | Description |
|--------|-------------|
| **SMILES String** | Paste any valid SMILES notation |
| **2D Structure Drawing** | Interactive canvas — atom palette (C, N, O, S, P, halogens), bond tools, ring & chain builders |
| **Ketcher Editor** | Professional-grade EPAM Ketcher molecule editor with SMILES import/export |
| **File Upload** | Batch molecular input support |

### 📊 Rich Visualization Suite
| Component | Technology | What It Does |
|-----------|-----------|-------------|
| **3D Molecule Viewer** | 3Dmol.js | Interactive rendering — rotate, zoom, fullscreen, spin |
| **Radar Property Chart** | Plotly.js | LogP, MW, HBD, HBA, TPSA, RotBonds at a glance |
| **Drug-Likeness Gauge** | Framer Motion | Animated Lipinski Rule-of-Five pass/fail dial |
| **Toxicity Gauges** | Plotly.js | Per-endpoint safety visualizations |
| **Solubility Curve** | Plotly.js | pH-dependent solubility profile |

### ⚔️ Model Comparison & QSPR Dataset Access
- Side-by-side **Ensemble vs Legacy** prediction comparison
- Radar chart overlay with per-property **winner indicators** (🏆)
- Compare multiple compounds across all predicted properties
- **Live dataset lookup** — query experimentally measured values by SMILES or compound name across 8,862 training compounds

### 🤖 AI Drug Discovery Copilot
- Conversational AI assistant with deep **medicinal chemistry, ADMET, SAR, and PK/PD** expertise
- **Context-aware** — automatically ingests your compound library, simulations & prediction results
- **Function calling**: runs live predictions, compares molecules, and queries QSPR datasets mid-conversation
- **Analytical reasoning**: identifies patterns, flags red flags, spots structure-property relationships
- Powered by **Cerebras AI (llama3.1-8b)** — ultra-fast inference
- Markdown-rendered responses with suggested follow-up prompts
- **Per-compound AI summary** — one-click 2–3 sentence analysis on any molecule card

### 🎙️ PersonaPlex Voice AI Assistant
- **Floating draggable orb** on every page — tap to speak naturally
- **PersonaPlex pipeline**: Browser ASR → Cerebras AI (with function calling) → Microsoft Edge Neural TTS
- Optional **NVIDIA Riva** ASR/TTS for enterprise-grade accuracy (falls back to browser APIs)
- **5 voice tools**: `run_prediction`, `get_descriptors`, `get_drug_likeness`, `compare_molecules`, `query_qspr_dataset`
- 4 animated states: Idle 🔵 → Listening 🔴 → Processing 🟣 → Speaking 🟢
- Voice-optimized responses — conversational, natural, no jargon dumps
- Transcript history with message bubbles
- Quick suggestion chips for instant queries

### 📋 Reports & Export
- **PDF reports** with molecule info, predicted properties, toxicity screening, drug-likeness scores
- **CSV export** for data analysis pipelines
- Configurable sections — toggle structures, curves, metadata
- Shareable report links with copy-to-clipboard

### 🔐 Authentication & Credit System
- Supabase email/password auth with user profiles
- **Credit-based simulation system** — each run costs credits based on selected properties
- Protected routes — dashboard, simulations, molecules pages require login
- **Row-Level Security (RLS)** — users can only access their own data

### 💎 UI/UX Design
- **Glassmorphism design system** — dark navy theme with frosted-glass cards and gradient accents
- **Framer Motion animations** — page transitions, stagger effects, hover/tap micro-interactions
- **Skeleton loading states** for all async data fetches
- **Haptic feedback** patterns (light, medium, heavy, success, error)
- **Toast notifications** with auto-dismiss

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 16** | React framework (App Router, Turbopack) |
| **React 19** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Utility-first styling |
| **Framer Motion** | Animations & transitions |
| **Recharts** | Dashboard charts |
| **Plotly.js** | Scientific visualizations |
| **3Dmol.js** | 3D molecule rendering |
| **Ketcher** | Molecular structure editor |
| **jsPDF** | Client-side PDF generation |
| **Lucide React** | Icon system |

### Backend & AI
| Technology | Purpose |
|-----------|---------|
| **Supabase** | Auth, PostgreSQL database, RLS |
| **Flask** | Python ML API server (port 5001) |
| **RDKit** | Morgan fingerprints (ECFP4) + physicochemical descriptors |
| **XGBoost** | Gradient boosting ensemble member |
| **scikit-learn** | RandomForest ensemble member, preprocessing |
| **Optuna** | Bayesian hyperparameter tuning |
| **Cerebras AI** | LLM reasoning engine (llama3.1-8b) |
| **Edge TTS** | Microsoft Edge Neural text-to-speech |
| **NVIDIA Riva** | Enterprise ASR/TTS (optional, browser fallback) |
| **PersonaPlex** | Voice AI session pipeline |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                    │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Molecule   │  │ Simulation│  │ AI Copilot  │  │ PersonaPlex    │  │
│  │ Input      │  │ Config    │  │ Chat        │  │ Voice Orb      │  │
│  │ (SMILES /  │  │ (Props,   │  │ (Function   │  │ ASR → AI → TTS │  │
│  │  Draw /    │  │  Solvent, │  │  Calling)   │  │ Edge TTS /     │  │
│  │  Ketcher)  │  │  T, P)    │  │             │  │ Riva fallback  │  │
│  └──────┬─────┘  └─────┬─────┘  └──────┬──────┘  └──────┬─────────┘ │
│         │              │               │                │           │
│  ┌──────▼──────────────▼───────────────▼────────────────▼──────────┐ │
│  │                    Next.js API Routes                           │ │
│  │  /api/predict   /api/predict/compare   /api/copilot             │ │
│  │  /api/predict/save                     /api/copilot/summary     │ │
│  └──────────┬──────────────────────────────────────┬───────────────┘ │
└─────────────┼──────────────────────────────────────┼────────────────┘
              │                                      │
   ┌──────────▼──────────────┐         ┌─────────────▼───────────┐
   │  Flask ML + Voice       │         │   Cerebras AI           │
   │  Server v2.2            │         │   (llama3.1-8b)         │
   │  (Port 5001)            │         │                         │
   │                         │         │  Function calling +     │
   │  ┌───────────────────┐  │         │  QSPR dataset context   │
   │  │ ECFP4 Fingerprints│  │         │  injection              │
   │  │ 2048 bits + 8     │  │         └─────────────────────────┘
   │  │ physicochemical   │  │
   │  │ = 2056-dim vector │  │
   │  │ Drug-likeness +   │  │
   │  │ PAINS/Brenk       │  │
   │  └───────┬───────────┘  │
   │  ┌───────▼───────────┐  │
   │  │ QSPR v2.0         │  │
   │  │ Ensemble Engine    │  │
   │  │ RandomForest +     │  │
   │  │ XGBoost (8 models) │  │
   │  │ + 4 legacy DT      │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ PersonaPlex Voice  │  │
   │  │ Session Manager +  │  │
   │  │ Cerebras Bridge    │  │
   │  │ + Edge TTS / Riva  │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ QSPR Dataset      │  │
   │  │ Lookup Service     │  │
   │  │ (8,862 compounds) │  │
   │  └───────────────────┘  │
   └──────────────────────────┘
              │
   ┌──────────▼──────────┐
   │     Supabase        │
   │  ┌───────────────┐  │
   │  │ Auth (JWT)     │  │
   │  │ profiles       │  │
   │  │ projects       │  │
   │  │ molecules      │  │
   │  │ simulations    │  │
   │  │ predictions    │  │
   │  │ (RLS enabled)  │  │
   │  └───────────────┘  │
   └─────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10 with **RDKit** (`conda install -c conda-forge rdkit`)
- **Supabase** project ([supabase.com](https://supabase.com))

### 1. Clone & Install

```bash
git clone https://github.com/your-username/insilico-formulator.git
cd insilico-formulator

# Frontend dependencies
npm install

# Python ML dependencies
pip install -r ml/requirements.txt
```

### 2. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AI Copilot — Cerebras AI
CEREBRAS_API_KEY=your-cerebras-api-key
CEREBRAS_MODEL=llama3.1-8b            # default model

# ML Backend
ML_BACKEND_URL=http://localhost:5001   # Flask ML server URL

# (Optional) AI Copilot fallback — OpenRouter API Key
GEMINI_API_KEY=your-openrouter-api-key

# (Optional) NVIDIA Riva — enterprise ASR/TTS
RIVA_ASR_URL=localhost:50051
RIVA_TTS_URL=localhost:50051
RIVA_LANGUAGE=en-US
```

> **Note:** The Python ML server reads `CEREBRAS_API_KEY` from the system environment directly (not from `.env.local`). To enable voice reasoning, export it in your shell:
> ```bash
> export CEREBRAS_API_KEY=your-key   # Linux/macOS
> set CEREBRAS_API_KEY=your-key      # Windows cmd
> $env:CEREBRAS_API_KEY="your-key"   # PowerShell
> ```

### 3. Database Setup

Your Supabase project needs these tables (with RLS enabled):

```sql
-- User profiles with credits
profiles (id UUID, full_name TEXT, role TEXT, credits INT, avatar_url TEXT)

-- Research organization
projects (id UUID, user_id UUID, name TEXT, description TEXT, created_at TIMESTAMPTZ)
molecules (id UUID, user_id UUID, project_id UUID, name TEXT, smiles TEXT, formula TEXT, molecular_weight FLOAT)

-- Computation results
simulations (id UUID, user_id UUID, molecule_id UUID, status TEXT, config_json JSONB, result_json JSONB, compute_cost INT)
prediction_results (id UUID, user_id UUID, smiles TEXT, model_type TEXT, predictions JSONB, created_at TIMESTAMPTZ)
```

### 4. Run

```bash
# Start both Next.js + ML server (recommended)
npm run dev:all

# Or separately:
npm run dev          # Next.js → http://localhost:3000
python ml/server.py  # Flask ML → http://localhost:5001
```

Visit **[http://localhost:3000](http://localhost:3000)** 🎉

---

## 🎮 Demo

### Built-in Demo Mode
Navigate to `/simulations/demo` for a pre-loaded **Aspirin** simulation that works even without the ML server — perfect for quick demos and judging sessions.

### Sample SMILES to Try
| Compound | SMILES |
|----------|--------|
| Aspirin | `CC(=O)Oc1ccccc1C(=O)O` |
| Ibuprofen | `CC(C)Cc1ccc(cc1)C(C)C(=O)O` |
| Caffeine | `Cn1c(=O)c2c(ncn2C)n(C)c1=O` |
| Paracetamol | `CC(=O)Nc1ccc(O)cc1` |
| Metformin | `CN(C)C(=N)NC(=N)N` |

---

## 📡 API Reference

### ML + Voice API (Flask — Port 5001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — engine version, loaded models |
| `GET` | `/models` | List available models & capabilities |
| `POST` | `/predict` | Full QSPR ensemble property prediction from SMILES |
| `POST` | `/descriptors` | Raw molecular descriptor computation (ECFP4 + physicochemical) |
| `POST` | `/drug-likeness` | Lipinski, Veber, Ghose assessment + PAINS/Brenk alerts |
| `POST` | `/qspr/lookup` | Look up a molecule in training datasets by SMILES or name |
| `GET` | `/qspr/stats` | Training dataset statistics (sizes, ranges, distributions) |
| `POST` | `/voice/session` | Create a PersonaPlex voice session |
| `POST` | `/voice/process` | Process a voice query (ASR → Cerebras → tools → response) |
| `POST` | `/voice/tts` | Text-to-speech via Edge TTS or Riva |
| `GET` | `/voice/status` | Voice subsystem status (Cerebras, Riva, Edge TTS) |

### Next.js API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/predict` | Proxy to ML server with model type selection |
| `POST` | `/api/predict/compare` | Ensemble vs legacy side-by-side comparison |
| `POST` | `/api/predict/save` | Persist results to Supabase |
| `POST` | `/api/copilot` | AI chat with context-aware function calling |
| `POST` | `/api/copilot/summary` | Short 2–3 sentence compound analysis |

### Example Requests

```bash
# Predict properties (QSPR ensemble)
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# Look up measured values from training data
curl -X POST http://localhost:5001/qspr/lookup \
  -H "Content-Type: application/json" \
  -d '{"name": "Caffeine"}'

# Drug-likeness assessment
curl -X POST http://localhost:5001/drug-likeness \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# Dataset statistics
curl http://localhost:5001/qspr/stats
```

---

## 🧠 ML Models

### QSPR Engine v2.0

The prediction engine uses a **weighted ensemble** of RandomForest and XGBoost, with weights determined by cross-validation performance. Legacy Decision Tree + XGBoost v1 models are available as fallbacks.

### Training Data (MoleculeNet Benchmarks)

| Dataset | Task | Compounds | Property | Unit |
|---------|------|-----------|----------|------|
| **ESOL** | Regression | 1,128 | Aqueous Solubility | logS (mol/L) |
| **Lipophilicity** | Regression | 4,200 | Lipophilicity | logD at pH 7.4 |
| **BBBP** | Classification | 2,050 | Blood-Brain Barrier Penetration | binary |
| **ClinTox** | Classification | 1,484 | Clinical Toxicity | binary |

### Feature Engineering (2,056 dimensions)

| Feature Type | Count | Details |
|-------------|-------|---------|
| **Morgan Fingerprints (ECFP4)** | 2,048 | Radius 2, captures substructural fragments of diameter 4 |
| **Physicochemical Descriptors** | 8 | MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3 |

### Model Architecture

| Component | Configuration |
|-----------|---------------|
| **RandomForest** | 500 estimators, sqrt features, min_samples_split=5 |
| **XGBoost** | 300 estimators, max_depth=6, lr=0.05, subsample=0.8 |
| **Ensemble** | Weighted average (weights from CV performance, ~40/60 RF/XGB) |
| **Tuning** | Optuna Bayesian optimization (50 trials, 5-fold CV) |
| **Splitting** | Scaffold split (Bemis-Murcko) for realistic generalization |

### Model Files

```
ml/models/
├── qspr/                                    # QSPR v2.0 ensemble models
│   ├── solubility_random_forest.joblib      ├── solubility_xgboost.joblib
│   ├── logp_random_forest.joblib            ├── logp_xgboost.joblib
│   ├── bbbp_random_forest.joblib            ├── bbbp_xgboost.joblib
│   ├── toxicity_random_forest.joblib        ├── toxicity_xgboost.joblib
│   ├── *_ensemble.meta.json                 # Ensemble weights + eval metrics
│   └── *.meta.json                          # Per-model metadata
├── *_xgboost.joblib                         # Legacy v1 models (fallback)
├── *_decision_tree.joblib                   # Legacy v1 models (fallback)
└── training_metadata.json                   # Legacy training metadata
```

### Training & Evaluation Commands

```bash
# Full training with Optuna hyperparameter tuning (recommended)
npm run ml:train:tune
# → Trains RF + XGB for all 4 properties with Bayesian optimization

# Standard training (default hyperparameters)
npm run ml:train
# → Uses DEFAULT_RF_PARAMS & DEFAULT_XGB_PARAMS from qspr/config.py

# Quick training (reduced trials, for testing)
npm run ml:train:quick

# Evaluate trained models
npm run ml:evaluate
# → Runs scaffold-split evaluation, prints RMSE/R²/AUC metrics
```

---

## 📁 Project Structure

```
inSillico/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── predict/            # ML prediction endpoints
│   │   │   └── copilot/            # AI assistant endpoints
│   │   ├── auth/                   # Login & Signup pages
│   │   ├── copilot/                # AI Chat interface
│   │   ├── dashboard/              # User dashboard with metrics
│   │   ├── molecules/new/          # 3-step molecule input wizard
│   │   ├── simulations/            # Simulation config, demo mode
│   │   ├── results/                # Results list, detail, compare, export
│   │   ├── reports/                # PDF/CSV report viewer
│   │   └── projects/               # Project management
│   ├── components/
│   │   ├── voice-assistant.tsx     # 🎙️ PersonaPlex floating voice orb
│   │   ├── molecule-viewer-3d.tsx  # 3Dmol.js 3D rendering
│   │   ├── molecule-drawer.tsx     # Canvas 2D drawing tool
│   │   ├── molecule-sketcher.tsx   # Ketcher integration
│   │   ├── drug-likeness-gauge.tsx # Animated Lipinski gauge
│   │   ├── plotly-charts.tsx       # Radar, bar, gauge, curve charts
│   │   ├── layout/navbar.tsx       # Navigation with glassmorphism
│   │   └── ui/                     # Glass cards, toasts, badges, skeletons
│   └── lib/
│       ├── auth-context.tsx        # Auth provider + credit tracking
│       ├── cerebras-client.ts      # Cerebras AI client wrapper
│       ├── tool-definitions.ts     # AI function calling tool defs
│       ├── rag-context.ts          # RAG context builder for AI
│       ├── generate-pdf-report.ts  # jsPDF report generation
│       ├── haptics.ts              # Haptic feedback patterns
│       └── supabase/               # Client & server Supabase helpers
├── ml/
│   ├── server.py                   # Flask ML + Voice API (port 5001)
│   ├── descriptors.py              # RDKit ECFP4 + physicochemical engine
│   ├── train_qspr.py              # QSPR v2.0 training pipeline
│   ├── evaluate_qspr.py           # Model evaluation & metrics
│   ├── train_models.py             # Legacy v1 training (deprecated)
│   ├── test_api.py                 # API integration tests
│   ├── test_consistency.py         # Model consistency tests
│   ├── qspr/                       # 📦 QSPR Pipeline Package
│   │   ├── config.py              #   Central config (datasets, hyperparams)
│   │   ├── fingerprints.py        #   Morgan FP + descriptor computation
│   │   ├── datasets.py            #   Dataset loading & preprocessing
│   │   ├── models.py              #   Model factory (RF, XGB)
│   │   ├── ensemble.py            #   Weighted ensemble engine
│   │   ├── tuning.py              #   Optuna hyperparameter optimization
│   │   ├── evaluation.py          #   Metrics & cross-validation
│   │   ├── splitting.py           #   Scaffold & random splitting
│   │   └── serialization.py       #   Model save/load with metadata
│   ├── personaplex/                # 🎙️ PersonaPlex Voice Pipeline
│   │   ├── cerebras_bridge.py     #   Cerebras AI integration + tools
│   │   ├── session_manager.py     #   Voice session lifecycle
│   │   ├── audio_processor.py     #   Audio format handling
│   │   └── riva_client.py         #   NVIDIA Riva ASR/TTS client
│   ├── data/                       # MoleculeNet CSV datasets
│   │   ├── esol.csv               #   1,128 compounds (solubility)
│   │   ├── lipophilicity.csv      #   4,200 compounds (logD)
│   │   ├── bbbp.csv               #   2,050 compounds (BBB penetration)
│   │   └── clintox.csv            #   1,484 compounds (toxicity)
│   └── models/                     # Pre-trained model files
│       ├── qspr/                  #   QSPR v2.0 ensemble (.joblib + .meta.json)
│       └── *.joblib               #   Legacy v1 models
├── public/                         # Static assets
└── package.json
```

---

## 🔑 Key Differentiators

| Feature | InSilico Formulator | Traditional Tools |
|---------|--------------------|--------------------|
| **Setup time** | 2 minutes | Days to weeks |
| **Cost** | Free & open source | $10K–$100K/yr licenses |
| **AI Assistant** | Context-aware copilot with function calling + voice | None |
| **ML Engine** | QSPR v2.0 ensemble (RF + XGB, ECFP4) | Single model |
| **Voice interaction** | PersonaPlex (Cerebras + Edge TTS + Riva) | N/A |
| **Dataset lookup** | Query 8,862 measured values mid-conversation | Manual search |
| **Reports** | One-click PDF/CSV export | Manual export |
| **UI/UX** | Modern glassmorphism, Framer Motion | Legacy interfaces |
| **Deployment** | Vercel + Supabase (free tier) | On-premises only |

---

## 🚧 Roadmap

- [ ] ADMET expansion (CYP inhibition, plasma protein binding, hERG)
- [ ] Retrosynthesis pathway suggestion
- [ ] Molecular docking integration
- [ ] Batch prediction (CSV of 1000+ SMILES)
- [ ] GNN-based property prediction (GCN, AttentiveFP)
- [ ] Collaborative workspaces (team projects)
- [ ] PubChem / ChEMBL compound search integration
- [ ] QSAR model builder (no-code)

---

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:all` | Start Next.js + Python ML server together (recommended for dev) |
| `npm run dev` | Next.js dev server only → http://localhost:3000 |
| `npm run ml` | Python ML + Voice server only → http://localhost:5001 |
| `npm run ml:legacy` | Legacy v1 server (deprecated) |
| `npm run ml:train` | Train QSPR v2.0 models (default hyperparameters) |
| `npm run ml:train:tune` | Train with Optuna Bayesian hyperparameter tuning |
| `npm run ml:train:quick` | Quick training (reduced trials, for testing) |
| `npm run ml:evaluate` | Evaluate models — scaffold-split metrics |
| `npm run build` | Production build (Next.js) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 👥 Team

<!-- Update with your hackathon team details -->

| Names | 
|------|
| Parmeet Singh |
| Chetan Sharma |
| Niharika Khosla |
| Muskan Bindal |

---

<p align="center">
  Built with 🧬 for the future of drug discovery
</p>

