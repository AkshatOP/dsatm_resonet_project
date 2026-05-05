# ResoNet — Real-Time Multi-Agent Disaster Resource Orchestrator

> **Hackathon Project** · Built for the problem statement: *Intelligent, decentralized autonomous agent negotiation for real-time resource allocation during natural disasters.*

---

## Problem Statement

During natural disasters, critical city infrastructure — power grids, hospitals, emergency services, water systems — operates in silos. Human decision-makers cannot negotiate and reallocate resources fast enough in high-pressure, rapidly evolving scenarios. The consequences: cascading failures, inequitable resource distribution, and preventable loss of life.

**ResoNet** solves this by deploying a **fully autonomous multi-agent system** where each utility (Power Grid, Hospital, Fire Department, Police, NDRF) is represented by an intelligent software agent that can perceive disaster events, negotiate resource allocation in real time using a formal protocol, and dispatch physical responders — all without human intervention.

---

## How ResoNet Matches the Problem's Expected Outcomes

| Expected Outcome | ResoNet Implementation |
|---|---|
| Real-time simulation with coordinated negotiation | WebSocket-driven live dashboard; Contract Net Protocol runs a full negotiation cycle per event |
| Efficient, stable power allocation | Power Agent tracks grid zones; LIFE SAFETY OVERRIDE guarantees hospital power; Gini coefficient enforces equity |
| Intelligent agent decision-making balancing priority, fairness, and system impact | Composite bid scoring (urgency × 0.5 + availability × 0.3 + fairness × 0.2) with live Gini monitoring |
| Scalable framework for dynamic disaster scenarios | Plug-in agent architecture; any new utility type is a subclass of `BaseAgent`; dynamic epicenter dispatch |

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        React + Leaflet Dashboard                 │
│   Map · Agent Chat · Inventory · Gini Meter · Routing Lines     │
└────────────────────┬──────────────────────────┬────────────────┘
                     │ HTTP REST                 │ WebSocket
                     ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                      │
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ SensingAgent │──▶│ Orchestrator │──▶│  NegotiationDecision  │ │
│  │  (Epicenter) │   │  (CNP cycle) │   │  → SQLite Log        │ │
│  └──────────────┘   └──────┬───────┘   └──────────────────────┘ │
│                             │                                     │
│   ┌─────────┬──────────┬───┴──────┬────────────┐                 │
│   │  Power  │ Hospital │  Fire    │   Police   │  NDRF           │
│   │  Agent  │  Agent   │  Agent   │   Agent    │  Agent          │
│   └─────────┴──────────┴──────────┴────────────┘                 │
│                                                                   │
│  ┌────────────────────────────┐   ┌────────────────────────────┐ │
│  │     Redis Pub/Sub Bus      │   │     XAI Agent (LLM)        │ │
│  │  (asyncio.Queue fallback)  │   │  Groq → Gemini → Claude    │ │
│  └────────────────────────────┘   └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             │
               ┌─────────────────────────┐
               │   ML Zone Classifier     │
               │  (scikit-learn RF model) │
               │  Trained on Nepal Data   │
               └─────────────────────────┘
```

---

## Unique Features

### 1. Contract Net Protocol (CNP) — From-Scratch Implementation
Every resource request triggers a formal **Contract Net Protocol** negotiation cycle: the requesting agent broadcasts an RFP, all eligible agents submit bids, a composite scoring function ranks them, and the winner executes a resource transfer. This happens in real time, fully logged to SQLite, and streamed to the dashboard via WebSocket.

### 2. ML-Powered Zone Classification (Trained on Real Nepal Earthquake Data)
The zone classifier is a **Random Forest model trained on 260,601 building damage records** from the 2015 Nepal Gorkha earthquake (Mw 7.8), sourced from the [DrivenData Nepal Earthquake Competition](https://www.drivendata.org/competitions/57/nepal-earthquake/data/) — a publicly available dataset containing ward-level structural damage assessments. Records were aggregated to 1,414 ward-level zones with percentile-based labeling across 4 damage classes, achieving **99.6% weighted F1**.

A rule-based authoritative classifier runs in parallel (severity × 0.4 + population density × 0.3 + critical infrastructure × 0.3). When the ML model disagrees with the rule-based output, the rule-based result is authoritative and the disagreement is logged — ensuring explainability for judges.

### 3. Fire Incident Classification with NFIRS-Derived Heuristics
Fire spread severity and zone damage bands were calibrated against **NFIRS (National Fire Incident Reporting System)** incident patterns — the U.S. Fire Administration's public repository of 1M+ annual fire incident reports — to establish realistic fire radius decay curves (critical zone: ≤500m, low-damage fringe: ≤2,500m). This ensures the fire simulation reflects real-world fire propagation physics rather than arbitrary constants.

### 4. Explainable AI (XAI) for Every Decision
Every negotiation decision is explained in plain language by an **XAI Agent** powered by Llama 3.3 70B (via Groq). The explanation includes:
- **Rationale** — why this agent won the bid
- **Counterfactual** — what would have changed if a different agent had won

Explanations are persisted to SQLite and surfaced in the dashboard in real time.

### 5. Fairness-Enforced Resource Allocation
A **Gini coefficient** is computed over all agent resource pools after every allocation. If inequality exceeds the threshold (Gini > 0.4), the Policy Agent intervenes — penalising bids from over-resourced agents and reweighting the scoring. Gini delta is displayed live in the agent chat.

### 6. Nearest-Neighbour Spatial Dispatch
Every responder type (hospital, fire, police, NDRF) has **3 physical stations** distributed across the city map. When a disaster occurs at any arbitrary location, the backend computes the nearest station per responder type using the Haversine formula and dispatches from there. The frontend mirrors this exactly — routing lines originate from the correct station icon, not a dummy position.

### 7. Real OSRM Road Routing with Danger-Zone Detection
Emergency vehicle routes are fetched from the **OSRM routing engine** (OpenStreetMap-based). If a road segment on the computed route passes through a damaged zone, the route is flagged with a warning in the agent chat. When roads are fully blocked (as in a M7.2 earthquake scenario), the system automatically switches all dispatch to **AERIAL mode**.

### 8. Live Agent Chat with Typewriter Streaming
The sidebar shows a live multi-agent conversation feed where each agent "speaks" when it takes an action. Messages stream character-by-character (typewriter effect), and the system replays older messages instantly so new messages don't get blocked. Zone alerts are grouped and stagger-animated for readability.

### 9. Full Inventory Tracking with Load Computation
The bottom panel shows every agent's live resource pool. Resources are deducted in real time as units deploy (one deduction per resolved OSRM route). Agent load percentage is computed as the weighted average depletion across all resource types, matching the backend formula exactly.

### 10. Click-to-Simulate Any Zone
Every map zone has a context popup with **Simulate Fire** and **Simulate Earthquake** buttons. Clicking dispatches the simulation to that zone's exact lat/lon coordinates — the backend classifies surrounding zones based on haversine distance from the new epicenter, and all responders are dispatched from their nearest stations.

---

## Tech Stack

### Backend
| Technology | Role |
|---|---|
| **Python 3.11+** | Core language |
| **FastAPI** | REST API + WebSocket server |
| **Redis (Pub/Sub)** | Inter-agent message bus |
| **asyncio.Queue** | In-process fallback when Redis unavailable |
| **NetworkX** | City graph model, road network, shortest-path routing |
| **scikit-learn** | Random Forest zone damage classifier |
| **joblib** | Model serialization / deserialization |
| **numpy** | Gini coefficient computation, numerical operations |
| **SQLite** | Persistent decision log (one row per negotiation cycle) |
| **Groq (Llama 3.3 70B)** | Primary LLM for XAI explanations |
| **Google Gemini 2.0 Flash** | Secondary LLM fallback |
| **Anthropic Claude Sonnet** | Tertiary LLM fallback |
| **python-dotenv** | Environment variable loading |

### Frontend
| Technology | Role |
|---|---|
| **React 19** | UI framework |
| **Vite 8** | Build tool and dev server |
| **Leaflet + react-leaflet** | Interactive crisis map |
| **OpenStreetMap** | Base tile layer (free, no API key) |
| **OSRM** | Road routing engine (public API, OpenStreetMap-based) |
| **Tailwind CSS v3** | Utility-first dark-theme styling |
| **Native WebSocket API** | Real-time event stream from backend |

---

## Repository Structure

```
ResoNet/
├── README.md                  ← This file
├── resonet_backend/
│   └── ResoNet/
│       ├── README.md          ← Backend setup guide
│       ├── main.py            ← FastAPI entrypoint
│       ├── config.py          ← All constants and seed data
│       ├── requirements.txt
│       ├── .env.example       ← Environment variable template
│       ├── agents/            ← 9 autonomous agent classes
│       ├── negotiation/       ← Contract Net Protocol implementation
│       ├── simulation/        ← Earthquake + fire simulators, zone classifier
│       ├── training/          ← ML training script + Nepal dataset
│       ├── models/            ← Trained RandomForest .pkl file
│       ├── intelligence/      ← LLM client (multi-provider) + Gini fairness
│       ├── messaging/         ← Redis pub/sub broker + typed message dataclasses
│       ├── persistence/       ← SQLite decision log
│       └── api/               ← REST routes + WebSocket manager
└── resonet_frontend/
    ├── README.md              ← Frontend setup guide
    ├── src/
    │   ├── App.jsx            ← Root component; all WS event handling
    │   ├── hooks/             ← useWebSocket, useSimulation
    │   ├── components/
    │   │   ├── Map/           ← CityMap, ZoneCircle, EmergencyRoutes, InfraMarker
    │   │   ├── Sidebar/       ← AgentChat, AgentInventory, Controls, GiniMeter
    │   │   └── BottomPanel/   ← XAIPanel
    │   └── constants/         ← API URLs, agent icon map
    └── public/
```

---

## Prerequisites

- **Node.js** ≥ 18 and **npm** ≥ 9
- **Python** ≥ 3.11
- **Redis** ≥ 7 (optional — system falls back to in-process queue without it)
- API key for **Groq** (free at [console.groq.com](https://console.groq.com)) — LLM explanations work without it but will use a static template fallback

---

## Quick Start

### 1. Clone and enter the repo

```bash
git clone https://github.com/<your-username>/ResoNet.git
cd ResoNet
```

### 2. Backend Setup

```bash
cd resonet_backend/ResoNet

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate        # Linux/macOS
# .venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and fill in your API keys (Groq at minimum)

# Train the zone classifier (one-time; downloads from bundled Nepal dataset)
python training/train_zone_classifier.py

# Start Redis (if available)
redis-server &

# Start the backend
python main.py
# API available at http://localhost:8000
# WebSocket at ws://localhost:8000/ws
```

### 3. Frontend Setup

```bash
cd resonet_frontend

npm install
npm run dev
# Dashboard available at http://localhost:5173
```

### 4. Trigger a Scenario

Open the dashboard and click **Trigger Earthquake** in the sidebar, or click any zone on the map and select **Simulate Fire / Simulate Earthquake** from the popup.

Or use curl directly:

```bash
# Default demo earthquake (Zone-D epicenter, M7.2)
curl -X POST http://localhost:8000/simulate/scenario/hospital-earthquake

# Earthquake at any coordinates
curl -X POST http://localhost:8000/simulate/earthquake \
  -H 'Content-Type: application/json' \
  -d '{"lat": 13.0245, "lon": 77.5503, "zone_id": "Zone-C", "magnitude": 6.5}'

# Fire simulation
curl -X POST http://localhost:8000/simulate/scenario/fire \
  -H 'Content-Type: application/json' \
  -d '{"lat": 12.9085, "lon": 77.4842, "zone_id": "Zone-F"}'

# Reset system state
curl -X POST http://localhost:8000/simulate/reset
```

---

## Environment Variables

Copy `resonet_backend/ResoNet/.env.example` to `.env` and fill in:

```env
GROQ_API_KEY=your_groq_key_here        # Free at console.groq.com — enables live XAI
GEMINI_API_KEY=your_gemini_key_here    # Optional fallback
ANTHROPIC_API_KEY=your_claude_key_here # Optional tertiary fallback
USE_CLAUDE=false                        # Set true to force Claude as primary LLM

REDIS_URL=redis://localhost:6379        # Optional; system uses asyncio.Queue if unavailable
```

The system runs fully offline (no LLM calls) if no API keys are provided — XAI explanations fall back to a deterministic template so the demo never crashes.

---

## Demo Scenario

The default **hospital-earthquake** scenario seeds:
- **Epicenter:** Zone-D (Koramangala) — M7.2
- **CRITICAL zones post-quake:** Zone-A (NDRF base), Zone-B (hospital), Zone-F (fire station)
- **Hospital** in Zone-B receives priority power via LIFE SAFETY OVERRIDE
- **All roads blocked** at M7.2 → all dispatch routes switch to AERIAL mode
- **3 full CNP cycles** run, each persisted to `decisions.db` with XAI explanation

---

## Contributors

[Akshat Baranwal](https://github.com/AkshatOP) 

[Hemil Rawal](https://github.com/HemilRawal)

[Shreyas](https://github.com/ShreyasShetty1311)

---

## License

MIT
