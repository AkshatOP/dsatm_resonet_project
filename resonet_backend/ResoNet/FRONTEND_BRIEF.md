# ResoNet Frontend — Complete Build Brief for AI Agent

---

## ⚠️ MANDATORY FIRST STEP — Before You Write a Single Line of Code

Before touching any source file, you **MUST** create two context files in the frontend project root (`frontend/`). These files are your memory across sessions — without them you will lose context and make mistakes.

### Step 1 — Create `frontend/CLAUDE.md`

This is your standing instruction file. Copy the template from the **Backend Reference** section at the bottom of this brief and adapt it for the frontend. It must contain:
- Project identity and mandate
- Tech stack (React 18, Vite, Leaflet, Tailwind, etc.)
- Code rules (component naming, hook conventions, file naming)
- File update discipline (the rule that you update these files every prompt)
- Folder structure (from the "File structure suggestion" section below)

### Step 2 — Create `frontend/Context.md`

This is your living build log. On first creation, seed it with:
- The backend API contract (base URL, WebSocket URL, all endpoints)
- The WebSocket event contract (zone_update, negotiation, xai, agent_state, dispatch)
- A "Build Log" section (empty at first — you will fill it in as you build)
- A "Known Issues" section (empty at first)

### Step 3 — Update Both Files After EVERY Prompt

After completing **any** task — a component, a bug fix, a refactor, a config change — you MUST:
1. Append to the `## Build Log` section in `Context.md` what was built, key decisions made, and any issues discovered.
2. Update `CLAUDE.md` if any code rules, folder structure, or stack decisions changed.

**This is non-negotiable.** The files are your only persistent memory. If you skip an update you will contradict yourself in the next prompt.

---



## What you are building

A real-time crisis response dashboard for ResoNet (Resource Negotiation Network). The backend is a running FastAPI server. Your job is to build the frontend that connects to it and visualises everything live.

The visual reference is a dark-themed map interface (like the image.png in the root folder): dark basemap, coloured circular zone markers, left sidebar with live data panels, bottom-right legend. Think crisis command centre, not a webpage.

---

## Backend is already running

```
Base URL:   http://localhost:8000
WebSocket:  ws://localhost:8000/ws
CORS:       open (all origins allowed)
```

You do not need to change any backend code. Everything you need is exposed via REST + WebSocket.

---

## Tech stack for frontend

```
React 18 + Vite
Leaflet + react-leaflet          (the map)
Tailwind CSS                     (styling — dark theme)
shadcn/ui or plain Tailwind      (sidebar components)
No Redux — useState + useEffect is sufficient
```

---

## REST Endpoints (call these on page load)

### GET /health
Returns system readiness.
```json
{ "status": "ok", "agents": 9, "redis": true }
```
Use this to show a status indicator in the header.

### GET /zones
Returns the full city graph for initial map render.
```json
{
  "zones": [
    {
      "id": "Zone-A",
      "name": "Rajajinagar",
      "lat": 12.9914,
      "lon": 77.5561,
      "population_density": 0.65,
      "has_critical_infra": true,
      "power_status": true,
      "road_blocked": false,
      "connected_zones": ["Zone-B", "Zone-C", "Zone-G"]
    },
    ...12 zones total
  ]
}
```
Draw each zone as a Leaflet circle on the map. Use this for the initial render before any earthquake fires.

### GET /state
Returns everything at once: agents, zones, last 10 decisions.
```json
{
  "agents": {
    "hospital_agent": {
      "agent_id": "hospital_agent",
      "agent_type": "hospital",
      "resource_pool": { "power_units": 50, "beds": 300, "personnel": 80 },
      "current_load": 0.0,
      "priority_weight": 2.0,
      "status": "IDLE",
      "last_updated": "..."
    },
    ...9 agents total
  },
  "zones": [...same as /zones...],
  "recent_decisions": [...]
}
```

### GET /decisions?limit=20
Returns the last N negotiation decisions from SQLite.
```json
{
  "decisions": [
    {
      "decision_id": "...",
      "event_id": "...",
      "rfp_json": {
        "requester_agent_id": "hospital_agent",
        "resource_type": "power_units",
        "amount_needed": 73,
        "urgency_score": 0.70,
        "zone_id": "Zone-B"
      },
      "award_json": {
        "winner_agent_id": "power_agent",
        "amount_awarded": 73,
        "all_bids_summary": [{ "bidder_id": "power_agent", "offered_amount": 73 }]
      },
      "gini_before": 0.626,
      "gini_after": 0.631,
      "xai_explanation": "RATIONALE: ... | COUNTERFACTUAL: ...",
      "timestamp": "..."
    }
  ]
}
```

### POST /simulate/scenario/hospital-earthquake
Triggers the full demo. No body needed. Returns immediately with event_id — all results arrive via WebSocket.
```json
{
  "scenario": "hospital-earthquake",
  "event_id": "...",
  "magnitude": 7.1,
  "epicenter_lat": 12.9621,
  "epicenter_lon": 77.602
}
```

### POST /simulate/reset
Restores city and agents to initial state. No body needed.
```json
{ "status": "reset", "message": "City and all agents restored to initial state" }
```

### POST /agents/{agent_id}/priority
Body: `{ "weight": 2.5 }` — adjusts an agent's priority weight at runtime.

---

## WebSocket Events

Connect to `ws://localhost:8000/ws` on page load. All messages arrive as JSON:
```json
{ "event_type": "...", "payload": {...}, "timestamp": "2026-05-05T..." }
```

### event_type: "zone_update"
Fires for every zone immediately after an earthquake is processed.
```json
{
  "zone_id": "Zone-B",
  "severity_score": 0.91,
  "classification": "CRITICAL",
  "population_density": 0.80,
  "has_critical_infra": true,
  "road_blocked": true,
  "power_status": false,
  "lat": 13.0035,
  "lon": 77.5710
}
```
**Action:** Update that zone's circle colour on the map. Pulse/animate it briefly.

### event_type: "negotiation"
Fires once per completed RFP cycle (~3 per earthquake).
```json
{
  "decision_id": "...",
  "rfp_id": "...",
  "resource_type": "power_units",
  "requester": "hospital_agent",
  "winner": "power_agent",
  "amount_awarded": 73,
  "gini_before": 0.626,
  "gini_after": 0.631,
  "bids_count": 1
}
```
**Action:** Add a row to the live negotiation feed. Update the Gini coefficient display.

### event_type: "xai"
Fires ~1–3 seconds after a negotiation event (async LLM call).
```json
{
  "decision_id": "...",
  "rationale": "73 power units were allocated to the hospital because Zone-B lost power...",
  "counterfactual": "Without this allocation, the hospital would have entered critical capacity...",
  "raw_explanation": "RATIONALE: ... | COUNTERFACTUAL: ..."
}
```
**Action:** Show in the XAI panel. Match to the decision by decision_id. Typewriter effect optional.

### event_type: "agent_state"
Fires after each resource transfer.
```json
{
  "agent_id": "power_agent",
  "agent_type": "power",
  "resource_pool": { "power_units": 127 },
  "current_load": 0.365,
  "status": "ACTIVE",
  "priority_weight": 1.2
}
```
**Action:** Update that agent's card in the sidebar.

### event_type: "dispatch"
Fires once after zone classification completes.
```json
{
  "assignments": {
    "Zone-D": {
      "mode": "AERIAL",
      "eta_minutes": 16.0,
      "units_assigned": 10,
      "classification": "CRITICAL",
      "path": null
    },
    "Zone-B": {
      "mode": "LAND",
      "eta_minutes": 8.5,
      "units_assigned": 10,
      "classification": "CRITICAL",
      "path": [
        { "zone_id": "Zone-A", "lat": 12.9914, "lon": 77.5561 },
        { "zone_id": "Zone-B", "lat": 13.0035, "lon": 77.5710 }
      ]
    }
  }
}
```
**Action:**
- AERIAL mode: draw a dashed arc (or curved Leaflet polyline) between Zone-A (NDRF base) and the target zone
- LAND mode: draw a solid polyline through the waypoints
- Show ETA label on each line

---

## Map Design

### Basemap
Use CartoDB Dark Matter tile layer:
```
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
```
Attribution: `&copy; OpenStreetMap contributors &copy; CARTO`

### Zone circles
Each zone is a `CircleMarker` with radius proportional to `population_density * 20`.

Colour by classification:
```
SAFE     → #22c55e  (green)
LOW      → #eab308  (yellow)
HIGH     → #f97316  (orange)
CRITICAL → #ef4444  (red)

Default (before earthquake) → #6b7280  (grey)
```

On zone_update event: transition the colour, add a brief pulse animation.

### Zone labels
Show zone name on hover via Leaflet tooltip.

### Dispatch lines
LAND route → solid white/blue polyline, 3px
AERIAL route → dashed red/orange polyline, 2px, with an arced midpoint
Add animated dashed-line CSS if possible to suggest movement.

### Zone click popup
Clicking a zone shows:
- Zone name + ID
- Severity score (0–1)
- Classification badge
- Population density bar
- Power: ON / OFF
- Roads: CLEAR / BLOCKED
- Has critical infra: yes/no

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  DACRO  [status dot] [agents: 9] [redis: ●]   [dark]   │  ← Header bar
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  LEFT        │                                          │
│  SIDEBAR     │            LEAFLET MAP                   │
│  (320px)     │         (takes remaining width)          │
│              │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│  BOTTOM PANEL — Negotiation feed + XAI (collapsible)   │
└─────────────────────────────────────────────────────────┘
```

### Left Sidebar sections (top to bottom)

**1. Controls**
```
[🔴 Trigger Earthquake]    ← POST /simulate/scenario/hospital-earthquake
[⟳ Reset System]           ← POST /simulate/reset
```
Earthquake button goes red/pulsing while simulation is running. Disable both during active simulation.

**2. Gini Fairness Monitor**
```
Gini Coefficient
████████░░  0.63
Before: 0.626  After: 0.631  Δ +0.005
Policy intervention: active / inactive
```
Updates on every `negotiation` event.

**3. Agent Status Cards**
One card per agent. 9 cards total.
```
┌──────────────────────────┐
│ 🏥 hospital_agent  ACTIVE │
│ Load: ████████░░  78%    │
│ Power: 50  Beds: 300     │
│ Personnel: 62            │
└──────────────────────────┘
```
Status badge colour: IDLE=grey, ACTIVE=green, OVERLOADED=red, OFFLINE=black.
Updates on every `agent_state` event.

Agent icons:
```
power_agent       → ⚡
hospital_agent    → 🏥
fire_agent        → 🚒
police_agent      → 🚔
ndrf_agent        → 🪖
rescue_coordinator→ 🗺️
sensing_agent     → 📡
policy_agent      → ⚖️
xai_agent         → 🤖
```

**4. Live Event Log**
Scrolling list, newest at top, max 50 entries.
Each entry is one line:
```
[14:23:01] NEGOTIATION  hospital_agent ← 73 power_units from power_agent  (Gini +0.005)
[14:23:02] XAI          "73 power units were allocated because Zone-B lost..."
[14:23:00] ZONE         Zone-B → 🔴 CRITICAL  severity=0.91  power=OFF
[14:23:00] DISPATCH     Zone-D → AERIAL 16min  10 units
```

### Bottom Panel — XAI Explanation

Shows the latest XAI explanation in full:
```
┌─ Latest Decision Explanation ─────────────────────────────────┐
│ RATIONALE                                                      │
│ "73 power units were allocated to hospital_agent from          │
│  power_agent because Zone-B lost grid power post-quake and    │
│  patient surge reached 0.70 capacity."                        │
│                                                                │
│ COUNTERFACTUAL                                                 │
│ "Without this allocation, hospital_agent would have entered   │
│  resource-critical state within the next response window."    │
│                                         decision_id: abc123   │
└────────────────────────────────────────────────────────────────┘
```

### Map Legend (bottom-right, always visible)
```
Zone Priority          Dispatch
● CRITICAL             ── LAND route
● HIGH                 ╌╌ AERIAL route
● LOW
● SAFE
● No data
```

---

## Sequence of events on button press (what the user sees)

1. User clicks **Trigger Earthquake** button
2. Button turns red and shows "Simulating..."
3. POST fires, response returns immediately with magnitude + coordinates
4. Within ~200ms: 12 `zone_update` events arrive → map zones change colour rapidly
5. Zone-B, Zone-A, Zone-F go red (CRITICAL). Others go orange/yellow.
6. Within ~500ms: first `negotiation` event → negotiation feed updates, Gini bar updates
7. Within ~1s: `dispatch` event → routing lines appear on map
8. Within ~1–3s: first `xai` event → XAI panel updates with explanation
9. 2–3 more `negotiation` + `xai` events follow
10. Button returns to normal. Reset button highlights.

---

## File structure suggestion

```
frontend/
├── src/
│   ├── App.jsx                  # root layout
│   ├── hooks/
│   │   ├── useWebSocket.js      # WebSocket connection + event dispatch
│   │   └── useSimulation.js     # trigger/reset actions
│   ├── components/
│   │   ├── Map/
│   │   │   ├── CityMap.jsx      # Leaflet map wrapper
│   │   │   ├── ZoneCircle.jsx   # single zone marker
│   │   │   └── DispatchLine.jsx # AERIAL/LAND routing lines
│   │   ├── Sidebar/
│   │   │   ├── Controls.jsx     # trigger + reset buttons
│   │   │   ├── GiniMeter.jsx    # fairness display
│   │   │   ├── AgentCard.jsx    # single agent status card
│   │   │   └── EventLog.jsx     # scrolling live log
│   │   └── BottomPanel/
│   │       └── XAIPanel.jsx     # latest explanation
│   └── constants/
│       └── agentIcons.js        # agent_type → emoji + colour map
├── index.html
├── vite.config.js
└── tailwind.config.js
```

---

## Critical implementation notes

1. **WebSocket reconnect** — if the connection drops, retry every 3 seconds. The backend will have restarted during development.

2. **Zone colour transition** — use CSS transition on fill colour, not instant swap. 300ms ease is enough.

3. **Zone state initialisation** — on page load, all zones are grey. Only after a `zone_update` event do they get colours. Do NOT pre-colour them from `/zones` data (that has no `classification`).

4. **Decision matching for XAI** — the `xai` event arrives 1–3 seconds after the matching `negotiation` event. Store decisions in a `Map<decision_id, {...}>` and merge XAI data when it arrives.

5. **Dispatch line for AERIAL** — `path` is `null` for AERIAL. Draw a curved arc using Leaflet's built-in curve or a simple midpoint elevation: origin is Zone-A (NDRF base, always `lat: 12.9914, lon: 77.5561`), target is the affected zone.

6. **Reset clears map** — on `POST /simulate/reset`, clear all zone colours back to grey, clear routing lines, clear the negotiation feed. Keep agent cards but reset their loads.

7. **CORS is open** — no proxy needed. Call `http://localhost:8000` directly from the browser.

---

## What "done" looks like

- Page loads, shows 12 grey circles on dark map, all agents showing IDLE
- Click Trigger Earthquake — zones flood with colour in under a second
- Negotiation feed shows 3 bid/award rows with different amounts each run
- Dispatch lines appear (dashed arcs for AERIAL)
- XAI panel fills with a real explanation within 3 seconds
- Click Reset — everything goes grey again
- Click Trigger again — different severity scores, different RFP amounts, different Gini values

---

## Backend Reference — Starter Templates for `CLAUDE.md` and `Context.md`

Use these templates verbatim as your starting point. Adapt where noted.

---

### Template: `frontend/CLAUDE.md`

```markdown
# DACRO Frontend — Claude Code Instructions

## Project Identity
DACRO: Decentralised Autonomous Crisis Resource Orchestrator
This is the **frontend** React dashboard that visualises real-time crisis response data from the DACRO backend.

## Mandate
Build a stunning, real-time crisis command-centre UI in React 18 + Vite + Leaflet + Tailwind.
Every decision must prioritize: working demo > architectural perfection.
The backend is already running at http://localhost:8000 — do NOT touch it.

## Stack
- React 18 + Vite
- Leaflet + react-leaflet (map)
- Tailwind CSS (dark theme)
- No Redux — useState + useEffect + custom hooks only
- WebSocket: native browser WebSocket API (wrapped in useWebSocket.js)

## Code Rules
1. Every component file starts with a JSDoc comment explaining what it does.
2. Custom hooks live in src/hooks/ and are prefixed with "use".
3. All API base URLs and WS URLs live in src/constants/api.js — never inline them.
4. All agent icons and colour maps live in src/constants/agentIcons.js.
5. Zone colour must use CSS transitions (300ms ease) — never instant swap.
6. WebSocket must auto-reconnect every 3 seconds on disconnect.
7. On reset: clear zone colours to grey, clear routing lines, clear negotiation feed.
8. Decision-to-XAI matching uses a Map<decision_id, {...}> — never lose an XAI event.

## File Update Discipline
After completing each task (component, hook, bug fix, refactor), update:
- `Context.md` — append to Build Log: what was built, key decisions, issues found
- `CLAUDE.md` — update if any stack/rules/folder structure changed

THIS IS MANDATORY. Do it after every single prompt without being asked.

## Folder Structure
frontend/
├── CLAUDE.md              ← this file
├── Context.md             ← living build log
├── index.html
├── vite.config.js
├── tailwind.config.js
└── src/
    ├── App.jsx
    ├── constants/
    │   ├── api.js         ← BASE_URL, WS_URL
    │   └── agentIcons.js  ← agent_type → emoji + colour
    ├── hooks/
    │   ├── useWebSocket.js
    │   └── useSimulation.js
    └── components/
        ├── Map/
        │   ├── CityMap.jsx
        │   ├── ZoneCircle.jsx
        │   └── DispatchLine.jsx
        ├── Sidebar/
        │   ├── Controls.jsx
        │   ├── GiniMeter.jsx
        │   ├── AgentCard.jsx
        │   └── EventLog.jsx
        └── BottomPanel/
            └── XAIPanel.jsx
```

---

### Template: `frontend/Context.md`

```markdown
# DACRO Frontend — Build Context Log

## Project Overview
React 18 + Vite + Leaflet dashboard for the DACRO crisis response system.
Connects to a FastAPI backend at http://localhost:8000.
This file is updated after every build prompt.

## Backend API Contract

Base URL:  http://localhost:8000
WebSocket: ws://localhost:8000/ws
CORS:      open — call the backend directly from the browser, no proxy needed

### REST Endpoints
- GET  /health                                      → { status, agents, redis }
- GET  /zones                                       → { zones: [...12 zones] }
- GET  /state                                       → { agents, zones, recent_decisions }
- GET  /decisions?limit=N                           → { decisions: [...] }
- POST /simulate/scenario/hospital-earthquake       → { scenario, event_id, magnitude, epicenter_lat, epicenter_lon }
- POST /simulate/reset                              → { status, message }
- POST /agents/{agent_id}/priority  body:{weight}  → adjusts priority weight

### WebSocket Event Contract
All events: { event_type, payload, timestamp }

zone_update:   zone_id, severity_score, classification (SAFE/LOW/HIGH/CRITICAL),
               population_density, has_critical_infra, road_blocked, power_status, lat, lon

negotiation:   decision_id, rfp_id, resource_type, requester, winner,
               amount_awarded, gini_before, gini_after, bids_count

xai:           decision_id, rationale, counterfactual, raw_explanation
               (arrives 1–3s after matching negotiation event — match by decision_id)

agent_state:   agent_id, agent_type, resource_pool, current_load, status, priority_weight

dispatch:      assignments: { zone_id: { mode (AERIAL|LAND), eta_minutes,
                              units_assigned, classification, path: [{zone_id,lat,lon}]|null } }

## Zone Colour Map
SAFE     → #22c55e
LOW      → #eab308
HIGH     → #f97316
CRITICAL → #ef4444
Default  → #6b7280

## Dispatch Line Rules
LAND:   solid white/blue polyline, 3px, uses path waypoints
AERIAL: dashed red/orange polyline, 2px, curved arc;
        path is null — origin is always Zone-A (lat: 12.9914, lon: 77.5561)

## Build Log
<!-- Append entries below after each prompt. Format: [TIMESTAMP] WHAT_WAS_BUILT — decisions/issues -->

## Known Issues
<!-- Append discovered bugs and workarounds here -->
```

