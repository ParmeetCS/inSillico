<p align="center">
  <img width="969" height="1161" alt="Gemini_Generated_Image_c2bzihc2bzihc2bz" src="https://github.com/user-attachments/assets/1a259672-4b3c-45f2-94e5-bcdf682ba972" />

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
  <a href="#-team">Team</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1-black?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase" />
  <img src="https://img.shields.io/badge/Python-ML%20Backend-3776ab?logo=python" />
  <img src="https://img.shields.io/badge/XGBoost-Models-ff6600" />
  <img src="https://img.shields.io/badge/RDKit-Descriptors-005571" />
  <img src="https://img.shields.io/badge/AI_Copilot-Gemma_3-8b5cf6" />
</p>

---

## 🎯 Problem Statement

Drug discovery is one of the slowest, most expensive pipelines in healthcare — taking **10–15 years** and costing **$2.6 billion+** per approved drug. Early-stage researchers lack access to fast, intelligent tools that can predict molecular properties, flag ADMET risks, and suggest lead optimizations — all in one place.

**InSilico Formulator** solves this by putting an AI-powered drug formulation lab directly in the browser — combining ML-based property prediction, interactive molecular visualization, and a context-aware AI copilot that reasons like a senior medicinal chemist.

---

## ✨ Features

### 🔬 Molecular Property Prediction
- Predict **LogP**, **pKa**, **Aqueous Solubility**, **TPSA**, **Bioavailability**, and **Toxicity** from any SMILES input
- Dual ML engine: **XGBoost** + **Decision Tree** models trained on MoleculeNet benchmarks (ESOL, Lipophilicity, BBBP, ClinTox)
- **27 RDKit molecular descriptors** with drug-likeness filters (Lipinski, Veber, Ghose) and structural alert screening (PAINS/Brenk)
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

### ⚔️ Head-to-Head Model Comparison
- Side-by-side **XGBoost vs Decision Tree** prediction comparison
- Radar chart overlay with per-property **winner indicators** (🏆)
- Compare multiple compounds across all predicted properties

### 🤖 AI Drug Discovery Copilot
- Conversational AI assistant with deep **medicinal chemistry, ADMET, SAR, and PK/PD** expertise
- **Context-aware** — automatically ingests your compound library, simulations & prediction results
- **Analytical reasoning**: identifies patterns, flags red flags, spots structure-property relationships
- Powered by **Gemma 3 27B** via OpenRouter (free tier)
- Markdown-rendered responses with suggested follow-up prompts
- **Per-compound AI summary** — one-click 2–3 sentence analysis on any molecule card

### 🎙️ Voice-to-Voice AI Assistant
- **Floating draggable orb** on every page — tap to speak naturally
- Full **Speech → AI → Speech** pipeline (Web Speech API — zero cost)
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
| **Flask** | Python ML API server |
| **RDKit** | Molecular descriptor computation |
| **XGBoost** | Gradient boosting ML models |
| **scikit-learn** | Decision Tree models, preprocessing |
| **OpenRouter** | LLM gateway (Gemma 3 27B) |
| **Web Speech API** | Browser-native voice recognition & synthesis |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          BROWSER                                   │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌───────────────┐ │
│  │ Molecule   │  │ Simulation│  │ AI Copilot  │  │ Voice Assist. │ │
│  │ Input      │  │ Config    │  │ Chat        │  │ (Speech API)  │ │
│  │ (SMILES /  │  │ (Props,   │  │ (Markdown)  │  │ STT→AI→TTS   │ │
│  │  Draw /    │  │  Solvent, │  │             │  │               │ │
│  │  Ketcher)  │  │  T, P)    │  │             │  │               │ │
│  └──────┬─────┘  └─────┬─────┘  └──────┬──────┘  └──────┬────────┘│
│         │              │               │                │         │
│  ┌──────▼──────────────▼───────────────▼────────────────▼────────┐│
│  │                   Next.js API Routes                          ││
│  │  /api/predict   /api/predict/compare   /api/copilot           ││
│  │  /api/predict/save                     /api/copilot/summary   ││
│  └──────────┬──────────────────────────────────────┬─────────────┘│
└─────────────┼──────────────────────────────────────┼──────────────┘
              │                                      │
   ┌──────────▼──────────┐             ┌─────────────▼───────────┐
   │  Flask ML Server    │             │   OpenRouter API        │
   │  (Port 5001)        │             │   (Gemma 3 27B)         │
   │                     │             │                         │
   │  ┌───────────────┐  │             │  Analytical reasoning + │
   │  │ RDKit          │  │             │  user compound context  │
   │  │ 27 descriptors │  │             │  injection              │
   │  │ Drug-likeness  │  │             └─────────────────────────┘
   │  │ PAINS/Brenk    │  │
   │  └───────┬────────┘  │
   │  ┌───────▼────────┐  │
   │  │ XGBoost +      │  │
   │  │ Decision Tree  │  │
   │  │ (8 models)     │  │
   │  └────────────────┘  │
   └──────────────────────┘
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

# AI Copilot — OpenRouter API Key (free)
# Get yours at: https://openrouter.ai/
GEMINI_API_KEY=your-openrouter-api-key
```

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

### ML Prediction API (Flask — Port 5001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/predict` | Full property prediction from SMILES |
| `GET` | `/models` | List available models & capabilities |
| `POST` | `/descriptors` | Raw RDKit descriptor computation |

### Next.js API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/predict` | Proxy to ML server with model type selection |
| `POST` | `/api/predict/compare` | XGBoost vs Decision Tree side-by-side |
| `POST` | `/api/predict/save` | Persist results to Supabase |
| `POST` | `/api/copilot` | AI chat with context-aware analytical responses |
| `POST` | `/api/copilot/summary` | Short 2–3 sentence compound analysis |

### Example Request

```bash
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O", "model_type": "xgboost"}'
```

---

## 🧠 ML Models

### Training Data (MoleculeNet Benchmarks)

| Dataset | Task | Compounds | Property |
|---------|------|-----------|----------|
| **ESOL** | Regression | 1,128 | Aqueous Solubility (logS) |
| **Lipophilicity** | Regression | 4,200 | LogP |
| **BBBP** | Classification | 2,039 | Blood-Brain Barrier Penetration |
| **ClinTox** | Classification | 1,484 | Clinical Toxicity |

### Descriptor Pipeline (27 features)

- **Physicochemical**: MW, LogP, TPSA, Molar Refractivity
- **Hydrogen Bonding**: HBD, HBA counts
- **Topological**: Rotatable bonds, aromatic rings, ring count, Balaban J
- **Drug-Likeness**: Lipinski RO5, Veber rules, Ghose filter
- **Safety Alerts**: PAINS & Brenk structural alert filtering

### Model Files

```
ml/models/
├── solubility_xgboost.joblib       ├── solubility_decision_tree.joblib
├── logp_xgboost.joblib             ├── logp_decision_tree.joblib
├── bbbp_xgboost.joblib             ├── bbbp_decision_tree.joblib
├── toxicity_xgboost.joblib         ├── toxicity_decision_tree.joblib
└── training_metadata.json
```

To retrain models:
```bash
cd ml && python train_models.py
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
│   │   ├── voice-assistant.tsx     # 🎙️ Floating voice AI (global)
│   │   ├── molecule-viewer-3d.tsx  # 3Dmol.js 3D rendering
│   │   ├── molecule-drawer.tsx     # Canvas 2D drawing tool
│   │   ├── molecule-sketcher.tsx   # Ketcher integration
│   │   ├── drug-likeness-gauge.tsx # Animated Lipinski gauge
│   │   ├── plotly-charts.tsx       # Radar, bar, gauge, curve charts
│   │   ├── layout/navbar.tsx       # Navigation with glassmorphism
│   │   └── ui/                     # Glass cards, toasts, badges, skeletons
│   └── lib/
│       ├── auth-context.tsx        # Auth provider + credit tracking
│       ├── generate-pdf-report.ts  # jsPDF report generation
│       ├── haptics.ts              # Haptic feedback patterns
│       └── supabase/               # Client & server Supabase helpers
├── ml/
│   ├── server.py                   # Flask ML prediction API (port 5001)
│   ├── train_models.py             # Model training pipeline
│   ├── descriptors.py              # RDKit descriptor engine
│   ├── data/                       # MoleculeNet CSV datasets
│   └── models/                     # Pre-trained .joblib files
├── public/                         # Static assets
└── package.json
```

---

## 🔑 Key Differentiators

| Feature | InSilico Formulator | Traditional Tools |
|---------|--------------------|--------------------|
| **Setup time** | 2 minutes | Days to weeks |
| **Cost** | Free & open source | $10K–$100K/yr licenses |
| **AI Assistant** | Context-aware copilot + voice | None |
| **Model comparison** | Head-to-head XGBoost vs Decision Tree | Single model only |
| **Voice interaction** | Browser-native STT → AI → TTS | N/A |
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
| `npm run dev:all` | Start Next.js + Python ML server together |
| `npm run dev` | Next.js dev server only (port 3000) |
| `npm run ml` | Python ML server only (port 5001) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👥 Team

<!-- Update with your hackathon team details -->

| Name | Role | GitHub |
|------|------|--------|
| Your Name | Full-Stack Developer + ML Engineer | [@username](https://github.com/username) |

---

<p align="center">
  Built with 🧬 for the future of drug discovery
</p>

