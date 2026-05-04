
---

## CONTEXT.md

```markdown
# DACRO — Build Context Log

## Project Overview
14-hour hackathon build. Backend-first. One teammate handling React/Leaflet frontend.
Backend is complete. Frontend integration is the current focus.

## Architecture Decisions

### Why no LangGraph
Judges will ask how agents make decisions. LangGraph hides state transitions.
We own every line of the state machine — we can explain it cold.

### Message Bus
Redis Pub/Sub for inter-agent comms. Each agent subscribes to its own channel + broadcast channel.
Fallback: asyncio.Queue if Redis not available (demo safety net).

### Contract Net Protocol
Implemented as pure Python in negotiation/. Steps: RFP → Bid Collection → Scoring → Award.
One full cycle = one "tick". Ticks are triggered by events from the simulation engine.

### Zone Classification
Rule-based weighted score (severity × 0.4 + population_density × 0.3 + critical_infra × 0.3).
Rule-based is always authoritative — it never loses to ML.
RandomForestClassifier trained on 260,601 building damage records from the 2015 Nepal Gorkha earthquake (Mw 7.8),
aggregated to 1414 ward-level zones. Percentile-based labeling ensures all 4 classes appear.
99.6% weighted F1. Model saved to models/zone_classifier.pkl, loaded at startup via joblib.
If the two classifiers disagree, rule-based wins and the disagreement is logged.

### LLM Strategy
Primary:   Groq (llama-3.3-70b-versatile) — high RPM, no input quota issues, free tier
Secondary: Gemini 2.0 Flash — falls back automatically if Groq fails
Tertiary:  Claude Sonnet — only if USE_CLAUDE=true or both above fail
Last:      Templated string — demo-safe, never crashes
Switch controlled by USE_CLAUDE env var or automatic on provider failure.

### Fairness
Gini coefficient computed over current resource allocations after every award.
Policy Agent intervenes if Gini > 0.4 — penalises bids from agents with utilisation < 30%.
Fairness adjustment is also baked into the bid scoring formula (1 - gini) × 0.2 weight.

### Dispatch Routing
RescueCoordinator decides AERIAL vs LAND per zone based on road_blocked flag and ETA.
LAND path uses NetworkX shortest_path and returns lat/lon waypoints for Leaflet polylines.
All roads blocked in a M7.2 scenario, so all routes go AERIAL in the demo.
LAND routing is preserved and activates correctly for lower-magnitude events.

## WebSocket Event Contract (for frontend team)

All events arrive as: { event_type, payload, timestamp }

zone_update:
  zone_id, severity_score, classification (CRITICAL/HIGH/LOW/SAFE),
  population_density, has_critical_infra, road_blocked, power_status, lat, lon

negotiation:
  decision_id, rfp_id, resource_type, requester, winner,
  amount_awarded, gini_before, gini_after, bids_count

xai:
  decision_id, rationale, counterfactual, raw_explanation

agent_state:
  agent_id, agent_type, resource_pool, current_load, status, priority_weight

dispatch:
  assignments: { zone_id: { mode (AERIAL|LAND), eta_minutes, units_assigned,
                             classification, path: [{zone_id, lat, lon}] | null } }

## Build Log
[FILE] config.py — all constants, thresholds, API keys, zone seeds, channel names
[FILE] messaging/message_types.py — 8 typed dataclasses; Optional[Award] handles no-bid scenario
[FILE] messaging/broker.py — Redis pub/sub with asyncio.Queue fallback; inline callback dispatch
[FILE] persistence/decision_log.py — SQLite; INSERT OR REPLACE; update_xai_explanation for async patch-back
[FILE] agents/base_agent.py — abstract base; _update_load auto-computes from config initial resources
[FILE] simulation/city_model.py — NetworkX DiGraph, block_road inflates to 999 (keeps routing alive)
[FILE] simulation/earthquake.py — haversine inline, severity formula, apply_damage for severity>0.6
[FILE] simulation/zone_classifier.py — rule-based authoritative; loads pkl if exists, trains synthetic fallback
[FILE] intelligence/fairness.py — standard Gini from numpy; get_allocation_summary per agent
[FILE] negotiation/scoring.py — composite bid score; availability clamped to 1.0
[FILE] negotiation/protocol.py — stateless factory; cost_score from surplus/offered ratio
[FILE] negotiation/orchestrator.py — 12-step CNP; 2s bid timeout; XAI as asyncio.create_task
[FILE] agents/sensing_agent.py — earthquake pipeline; zone table log; triggers RFPs; fires dispatch
[FILE] agents/power_agent.py — bids on power_units if surplus >20%; LIFE SAFETY OVERRIDE
[FILE] agents/hospital_agent.py — power RFP urgency=1.0; personnel RFP if patient_load>0.8
[FILE] agents/fire_agent.py — bids on personnel/vehicles/water; dispatches on CRITICAL
[FILE] agents/police_agent.py — bids on personnel/vehicles; crowd_control_zones list
[FILE] agents/ndrf_agent.py — primary responder; one power RFP per event (not per zone)
[FILE] agents/rescue_coordinator.py — AERIAL/LAND logic; _path_to_waypoints returns [{zone_id,lat,lon}]
[FILE] agents/policy_agent.py — Gini monitor; penalises bids from utilisation<30% agents
[FILE] intelligence/llm_client.py — Groq → Gemini → Claude → template fallback; provider logged
[FILE] agents/xai_agent.py — context dict → LLM → RATIONALE|COUNTERFACTUAL → WebSocket + SQLite patch
[FILE] api/websocket.py — WebSocketManager; dead connections pruned on send failure
[FILE] api/routes.py — 9 endpoints; POST /simulate/reset fully restores city + agent state
[FILE] main.py — lifespan; sensing_agent gets orchestrator ref post-construction; broadcast→WS piped
[FILE] requirements.txt / .env.example — all dependencies and env var template
[FILE] training/train_zone_classifier.py — real Nepal data path + synthetic fallback; saves pkl
[FILE] models/zone_classifier.pkl — trained on Nepal earthquake data, 99.6% F1, auto-loaded

## Known Issues / Tech Debt
- GROQ key not yet confirmed in .env — add GROQ_API_KEY for live XAI during demo
- All roads blocked at M7.2 so LAND routing never activates in the main scenario;
  test with magnitude 5.0 to see LAND paths with waypoints
- Zone power not tracked in ZoneStatus at WebSocket time (city_model tracks it separately);
  frontend should use power_status from zone_update events, not GET /zones
- models/zone_classifier.pkl is gitignored by convention — teammate must run training script
  before first server start, or server falls back to synthetic training

## Demo Scenario Seeds
- Earthquake epicenter: Zone-D (lat: 12.97, lon: 77.59) magnitude: 7.2
- CRITICAL zones post-quake: Zone-A (NDRF base), Zone-B (hospital), Zone-F (fire station)
- Hospital in Zone-B — always gets priority power via LIFE SAFETY OVERRIDE
- NDRF base in Zone-A — all routes AERIAL (roads blocked by severity >0.6)
- Full cycle produces 3 negotiation decisions, all logged to decisions.db

## Demo Run Commands
  redis-server &
  python main.py

  # Trigger scenario
  curl -X POST http://localhost:8000/simulate/scenario/hospital-earthquake

  # Reset and re-run without restarting
  curl -X POST http://localhost:8000/simulate/reset
  curl -X POST http://localhost:8000/simulate/scenario/hospital-earthquake
```

---
