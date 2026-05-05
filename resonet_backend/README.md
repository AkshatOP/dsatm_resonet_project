# ResoNet Backend — FastAPI Multi-Agent System

> Python + FastAPI backend powering the ResoNet disaster resource orchestration platform. Implements a from-scratch **Contract Net Protocol** multi-agent system with real-time WebSocket broadcasting, ML-based zone classification, and LLM-generated explainability.

---

## Architecture Overview

```
main.py (FastAPI lifespan)
   │
   ├── MessageBroker (Redis Pub/Sub / asyncio.Queue fallback)
   │       └── Channels: rfp, bids, awards, broadcast, {agent_id}
   │
   ├── CityModel (NetworkX DiGraph)
   │       └── 12 pre-seeded zones, road weights, block_road()
   │
   ├── ZoneClassifier
   │       ├── Rule-based: severity×0.4 + population×0.3 + infra×0.3
   │       └── RandomForest (Nepal earthquake data, 99.6% F1) — advisory
   │
   ├── NegotiationOrchestrator
   │       └── run_cycle(rfp) → 12-step CNP loop → NegotiationDecision
   │
   ├── Agents (all subclass BaseAgent)
   │       ├── SensingAgent    — earthquake/fire pipeline, triggers RFPs
   │       ├── PowerAgent      — power grid, LIFE SAFETY OVERRIDE
   │       ├── HospitalAgent   — patient load, power + personnel RFPs
   │       ├── FireAgent       — suppression dispatch, vehicle/water bids
   │       ├── PoliceAgent     — crowd control assignment, personnel bids
   │       ├── NDRFAgent       — heavy rescue, aerial units
   │       ├── RescueCoordinator — AERIAL/LAND routing logic
   │       ├── PolicyAgent     — Gini fairness enforcer
   │       └── XAIAgent        — LLM explanation generator
   │
   ├── DecisionLog (SQLite — decisions.db)
   │       └── One row per negotiation cycle; XAI patched back async
   │
   └── WebSocketManager
           └── Broadcasts: zone_update, negotiation, xai, agent_state, dispatch
```

---

## Agent Descriptions

### SensingAgent
The system entry point. Receives earthquake or fire events, computes zone severities using the Haversine formula against a configurable epicenter, classifies zones by distance bands (CRITICAL < 3,600m, HIGH < 7,000m, LOW < 11,000m for earthquakes; much tighter bands for fires), broadcasts `zone_update` WebSocket events, and triggers downstream agents to issue Resource For Proposals.

Distance-based classification is **authoritative** and mirrors the frontend's `ZoneCircle.jsx` exactly — the map and backend always agree on zone severity.

### PowerAgent
Manages the city power grid. Tracks power status per zone. Bids on `power_units` RFPs when its surplus exceeds 20% of its pool. Implements a **LIFE SAFETY OVERRIDE** that bypasses normal negotiation to guarantee hospital zones always receive power.

### HospitalAgent
Monitors patient surge after a disaster event (surge scales with earthquake magnitude: a M7.0 quake adds 52.5% patient load). Issues a `power_units` RFP when its zone loses power (power demand scales with zone severity). Issues a `personnel` RFP when patient load exceeds 80% threshold.

### FireAgent
Manages suppression vehicles, firefighters, and water tanks. Dispatches to every CRITICAL zone (deducting 2 vehicles, 8 personnel, 100 water units per deployment). Bids on `personnel`, `vehicles`, and `water_units` RFPs from surplus.

### PoliceAgent
Manages crowd control. Maintains a `crowd_control_zones` list. Bids on `personnel` and `vehicles` RFPs. Assigned to every CRITICAL and HIGH zone automatically.

### NDRFAgent
The primary heavy-rescue responder. Deploys 15 personnel and 2 heavy equipment units per CRITICAL zone. Issues a single `power_units` RFP per disaster event (not per zone) to avoid flooding the negotiation queue.

### RescueCoordinator
Determines dispatch mode (AERIAL vs LAND) per zone based on the `road_blocked` flag and ETA estimates. LAND routes use `networkx.shortest_path` with lat/lon waypoints for Leaflet polylines. All roads blocked in a M7.2+ scenario → all dispatch goes AERIAL. Broadcasts a `dispatch` WebSocket event with assignments for every CRITICAL/HIGH zone.

### PolicyAgent
Monitors the **Gini coefficient** over all agent resource pools after every negotiation cycle. When Gini > 0.4, it intervenes by penalising bids from agents with utilisation below 30%. Fairness is also baked into the bid scoring formula: `(1 - gini) × 0.2` weight.

### XAIAgent
Generates a plain-language explanation for every negotiation decision. Receives a `decision_context` dict (RFP details, winning bid, scores, Gini delta), calls the LLM chain, parses `RATIONALE|COUNTERFACTUAL` format, and patches the explanation back to SQLite. Broadcasts an `xai` WebSocket event so the dashboard can display it in real time.

---

## Contract Net Protocol — 12-Step Cycle

```
1.  Broadcast RFP to all agents (fire-and-forget notification via Redis)
2.  Poll each agent for a bid (2-second timeout per agent)
3.  Compute Gini coefficient before award
4.  Score all bids: urgency×0.5 + availability×0.3 + fairness×0.2
5.  Policy check: if Gini > 0.4, penalise over-resourced agents
6.  Select winner; execute resource transfer (winner loses, requester gains)
7.  Compute Gini coefficient after award; log delta
7b. Broadcast agent_state WebSocket events for winner and requester
8.  Create Award + NegotiationDecision objects
9.  Fire XAI agent asynchronously (non-blocking, asyncio.create_task)
10. Log NegotiationDecision to SQLite
11. Broadcast negotiation WebSocket event (decision_id, winner, amount, gini)
12. Return NegotiationDecision to caller
```

---

## Machine Learning — Zone Classifier

### Dataset: 2015 Nepal Gorkha Earthquake (Mw 7.8)
The zone damage classifier is trained on the **[DrivenData Nepal Earthquake Dataset](https://www.drivendata.org/competitions/57/nepal-earthquake/data/)** — a real-world public dataset containing 260,601 building-level structural damage assessments collected after the April 2015 Gorkha earthquake. Fields used:

- `damage_grade` (1–5 ordinal damage severity)
- `geo_level_3_id` (ward-level geographic aggregation, 1,414 unique wards)
- `has_superstructure_*` flags (masonry, mud mortar, concrete, timber)
- `count_floors_pre_eq`, `age_building`, `area_percentage`
- `land_surface_condition`, `foundation_type`, `roof_type`

Records were aggregated to **1,414 ward-level zones**. Percentile-based labeling assigns each zone to one of 4 damage classes (SAFE / LOW / HIGH / CRITICAL), ensuring all classes appear. A **Random Forest classifier** (scikit-learn, 100 trees, max_depth=12) was trained on the aggregated features, achieving **99.6% weighted F1**.

The ML model runs in parallel with a rule-based classifier. The rule-based result is always authoritative — if the two disagree, the disagreement is logged. This design is intentional: full explainability for judges, with ML as a confidence layer.

### Training

```bash
python training/train_zone_classifier.py
```

The script:
1. Loads `training/train_values.csv` + `training/train_labels.csv` (Nepal dataset)
2. Aggregates to ward level
3. Percentile-labels damage severity into 4 classes
4. Trains and evaluates the Random Forest
5. Saves `models/zone_classifier.pkl`

If the dataset files are absent, a synthetic fallback trains on generated data (demo safety net — the server will never crash on first boot).

---

## LLM Strategy

The XAI Agent uses a waterfall fallback chain so the demo never crashes regardless of API key availability:

```
1. Groq (llama-3.3-70b-versatile)    — high RPM, generous free tier, primary
2. Google Gemini 2.0 Flash           — secondary; triggered on Groq failure
3. Anthropic Claude Sonnet           — tertiary; only if USE_CLAUDE=true or both above fail
4. Deterministic template string     — always-on last resort; zero latency, zero cost
```

Provider selection and failures are logged. The dashboard always receives an explanation even in fully offline mode.

---

## WebSocket Event Contract

All events follow the shape `{ event_type, payload, timestamp }`.

### `zone_update`
```json
{
  "zone_id": "Zone-B",
  "severity_score": 0.82,
  "classification": "CRITICAL",
  "population_density": 0.75,
  "has_critical_infra": true,
  "road_blocked": true,
  "power_status": false,
  "lat": 13.003,
  "lon": 77.571,
  "calamity_type": "EARTHQUAKE"
}
```

### `negotiation`
```json
{
  "decision_id": "uuid",
  "rfp_id": "uuid",
  "resource_type": "power_units",
  "requester": "hospital_agent",
  "winner": "power_agent",
  "amount_awarded": 45,
  "gini_before": 0.312,
  "gini_after": 0.287,
  "bids_count": 3
}
```

### `xai`
```json
{
  "decision_id": "uuid",
  "rationale": "Power Agent won because...",
  "counterfactual": "If NDRF had bid instead...",
  "raw_explanation": "RATIONALE|COUNTERFACTUAL"
}
```

### `agent_state`
```json
{
  "agent_id": "power_agent",
  "agent_type": "power",
  "resource_pool": { "power_units": 155 },
  "current_load": 0.225,
  "status": "ACTIVE",
  "priority_weight": 1.2
}
```

### `dispatch`
```json
{
  "assignments": {
    "Zone-B": {
      "mode": "AERIAL",
      "eta_minutes": 8,
      "units_assigned": 3,
      "classification": "CRITICAL",
      "path": null
    }
  }
}
```

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health, Redis status, agent count |
| `GET` | `/state` | Full agent states + zone list snapshot |
| `GET` | `/zones` | Zone list with current severity and power status |
| `GET` | `/decisions` | All negotiation decisions from SQLite |
| `POST` | `/simulate/earthquake` | Trigger earthquake at coordinates |
| `POST` | `/simulate/scenario/hospital-earthquake` | Trigger demo scenario (M7.2, Zone-D) |
| `POST` | `/simulate/scenario/fire` | Trigger fire scenario |
| `POST` | `/simulate/reset` | Reset all agent states and city model |
| `WS` | `/ws` | WebSocket connection for live events |

---

## Setup

### Requirements
- Python ≥ 3.11
- Redis ≥ 7 (optional)

### Installation

```bash
cd resonet_backend/ResoNet

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Fill in GROQ_API_KEY (minimum), others optional

python training/train_zone_classifier.py   # one-time model training

redis-server &    # optional but recommended

python main.py
```

### Environment Variables

```env
GROQ_API_KEY=          # Free at console.groq.com
GEMINI_API_KEY=        # Optional
ANTHROPIC_API_KEY=     # Optional
USE_CLAUDE=false       # true → force Claude as LLM
REDIS_URL=redis://localhost:6379
```

---

## File Map

```
resonet_backend/ResoNet/
├── main.py                          FastAPI lifespan, agent wiring, WS pipe
├── config.py                        All constants, thresholds, zone seeds, API keys
├── requirements.txt
├── .env.example
│
├── agents/
│   ├── base_agent.py                Abstract base: resource pool, load, status, bid guard
│   ├── sensing_agent.py             Earthquake/fire pipeline, nearest-station dispatch
│   ├── power_agent.py               Grid zones, LIFE SAFETY OVERRIDE
│   ├── hospital_agent.py            Patient surge, power + personnel RFPs
│   ├── fire_agent.py                Suppression dispatch, multi-resource bids
│   ├── police_agent.py              Crowd control, personnel/vehicle bids
│   ├── ndrf_agent.py                Heavy rescue, single power RFP per event
│   ├── rescue_coordinator.py        AERIAL/LAND mode, waypoint generation
│   ├── policy_agent.py              Gini monitor, bid score adjustment
│   └── xai_agent.py                 LLM explanation generation
│
├── negotiation/
│   ├── protocol.py                  Stateless CNP factory (create_rfp, create_bid, create_award)
│   ├── orchestrator.py              12-step CNP execution loop
│   └── scoring.py                   Composite bid scoring and ranking
│
├── simulation/
│   ├── city_model.py                NetworkX city graph, 12 zones, road blocking
│   ├── earthquake.py                Haversine severity, damage application
│   ├── fire_simulator.py            Steep falloff fire simulation
│   └── zone_classifier.py           Rule-based + ML dual classifier
│
├── training/
│   ├── train_zone_classifier.py     Training script; uses Nepal dataset or synthetic fallback
│   ├── train_values.csv             Nepal earthquake building features (260,601 records)
│   ├── train_labels.csv             Damage grade labels
│   └── test_values.csv              Held-out test split
│
├── models/
│   └── zone_classifier.pkl          Trained Random Forest (joblib serialization)
│
├── intelligence/
│   ├── llm_client.py                Groq → Gemini → Claude → template fallback
│   └── fairness.py                  Gini coefficient, allocation summary
│
├── messaging/
│   ├── broker.py                    Redis pub/sub + asyncio.Queue fallback
│   └── message_types.py             8 typed dataclasses for all messages
│
├── persistence/
│   └── decision_log.py              SQLite log; INSERT OR REPLACE; async XAI patch-back
│
└── api/
    ├── routes.py                    9 REST endpoints, Pydantic request models
    └── websocket.py                 WebSocketManager, dead-connection pruning
```
