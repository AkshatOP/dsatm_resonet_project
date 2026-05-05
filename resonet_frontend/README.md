# ResoNet Frontend — React Crisis Command Dashboard

> Real-time crisis response visualisation dashboard built with React 19, Leaflet, and Tailwind CSS. Consumes a live WebSocket stream from the ResoNet backend to render zone severity, agent negotiations, dispatch routing, and resource inventory in real time.

---

## What This Dashboard Does

The frontend is a **command-centre-style single-page application** that displays:

- **Interactive city map** — 12 coloured zones that update live as disaster severity changes
- **Agent communication feed** — typewriter-streaming chat bubbles showing each agent's decisions
- **Animated routing lines** — real OSRM road routes drawn on the map as emergency vehicles deploy
- **Infrastructure markers** — all 12 physical stations (hospitals, fire stations, police HQs, NDRF bases) placed at accurate coordinates with nearest-neighbour dispatch origin
- **Live resource inventory** — bottom panel with every agent's current resource pool, load percentage, and status
- **Gini fairness meter** — equity coefficient displayed live after every negotiation
- **XAI explanations** — LLM-generated rationale for each negotiation decision surfaced in real time
- **Earthquake halo** — glowing radius overlay showing the danger zone around any epicenter
- **Power outage overlay** — zones that lost power are visually dimmed after a disaster

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| **React** | 19 | UI framework, component tree |
| **Vite** | 8 | Dev server, HMR, production build |
| **Leaflet** | 1.9 | Interactive map engine |
| **react-leaflet** | 5.0 | React bindings for Leaflet |
| **OpenStreetMap** | — | Free tile layer (no API key needed) |
| **OSRM** | Public API | Road routing (OpenStreetMap-based) |
| **Tailwind CSS** | 3.4 | Dark-theme utility styling |
| **Native WebSocket** | — | Real-time event stream (auto-reconnects every 3s) |

---

## Component Map

```
src/
├── App.jsx                     Root: WebSocket handlers, state, event routing
│
├── hooks/
│   ├── useWebSocket.js         WS connection, auto-reconnect, event dispatch
│   └── useSimulation.js        POST to /simulate/* endpoints; epicenter state
│
├── constants/
│   ├── api.js                  BASE_URL and WS_URL (single source of truth)
│   └── agentIcons.js           agent_type → { emoji, color, label } map
│
└── components/
    ├── Map/
    │   ├── CityMap.jsx          MapContainer, layers, popup wire-up
    │   ├── ZoneCircle.jsx       Per-zone circle + severity coloring + popup buttons
    │   ├── EmergencyRoutes.jsx  OSRM routing, nearest-station logic, animated lines
    │   ├── EarthquakeHalo.jsx   Glowing danger-zone radius overlay
    │   ├── PowerOverlay.jsx     Power-loss dimming overlay on affected zones
    │   └── InfraMarker.jsx      12 station markers (hospital/fire/police/NDRF)
    │
    ├── Sidebar/
    │   ├── Controls.jsx         Trigger earthquake, reset buttons
    │   ├── AgentChat.jsx        Chat feed: Typewriter, ChatBubble, ZoneGroupBubble
    │   ├── AgentInventory.jsx   Bottom panel: per-agent resource cards, drag-scroll
    │   ├── GiniMeter.jsx        Fairness coefficient gauge
    │   └── EventLog.jsx         Raw event log (debug/audit)
    │
    └── BottomPanel/
        └── XAIPanel.jsx         Expandable XAI explanation viewer
```

---

## Key Design Decisions

### 1. WebSocket Auto-Reconnect
`useWebSocket.js` reconnects every 3 seconds on disconnect. All state (zone colours, routing lines, chat history) is preserved on reconnect — only future events are missed.

### 2. Zero-Redux Architecture
Global state lives entirely in `App.jsx` via `useState`. All derived state (epicenter, visible messages) is computed inline. No Redux, no Zustand, no Context API — deliberate choice for hackathon debuggability.

### 3. Decision Deduplication
A `seenDecisions` Set ref prevents duplicate chat bubbles from WebSocket reconnects and React StrictMode double-fires. The dedup key includes `originName` so the same responder type can legitimately produce multiple bubbles when dispatching from different stations to different zones.

### 4. Nearest-Station Dispatch (Frontend Mirror)
`EmergencyRoutes.jsx` maintains a `STATIONS` registry (12 stations, 4 responder types × 3 stations each) that **exactly mirrors `config.RESPONDER_LOCATIONS` in the backend**. For each dispatched unit, the frontend independently runs the same Haversine nearest-neighbour search — ensuring the map line and the InfraMarker icon visually agree with the backend's dispatch log.

### 5. OSRM Routing with Danger-Zone Detection
Each unit's route is fetched from the OSRM public routing API. The decoded polyline is checked against all CRITICAL/HIGH zone coordinates using Haversine distance. If any waypoint is within 1.5km of a damaged zone, the route is flagged `hasDanger = true` and the agent chat bubble shows a ⚠️ warning.

### 6. Resource Deduction on Route Resolution
Agent inventory deductions happen when each OSRM route resolves (not at dispatch time). This prevents double-counting if a route fetch fails. Cost tables mirror the backend's `DEPLOY_COST` constants exactly.

### 7. Typewriter Chat with Sequential Queuing
Messages stream character-by-character using `setTimeout` with randomised per-character delays (10–30ms) to simulate real typing. Each message waits for the previous one to finish before starting, via a `typingIndex` state that increments in the `onComplete` callback. Past messages fast-forward instantly so new messages are never blocked.

---

## Setup

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- ResoNet backend running at `http://localhost:8000`

### Installation

```bash
cd resonet_frontend

npm install
npm run dev
# Dashboard at http://localhost:5173
```

### Production Build

```bash
npm run build
# Output in dist/ — serve with any static host (Vercel, Netlify, etc.)
```

### API Configuration

Edit `src/constants/api.js` to point to your backend:

```javascript
// Local development (defaults):
export const BASE_URL = 'http://localhost:8000';
export const WS_URL   = 'ws://localhost:8000/ws';

// Production (Railway / Render):
export const BASE_URL = 'https://your-backend.up.railway.app';
export const WS_URL   = 'wss://your-backend.up.railway.app/ws';
```

---

## WebSocket Event Handling

`App.jsx` registers five handlers with `useWebSocket`:

| Handler | Trigger | Effect |
|---|---|---|
| `onZoneUpdate` | `zone_update` | Updates zone colour, buffers for grouped chat alert, tracks power loss |
| `onNegotiation` | `negotiation` | Deduped by `decision_id`; pushes request + award chat bubbles; live inventory update |
| `onXai` | `xai` | Deduped by `xai:{decision_id}`; pushes XAI explanation bubble |
| `onAgentState` | `agent_state` | Silently updates agent inventory only (no chat bubble) |
| `onDispatch` | `dispatch` | Triggers `EmergencyRoutes` to fetch and draw OSRM lines |

---

## Simulation Flow (Frontend Perspective)

1. User clicks **Trigger Earthquake** or a zone popup button
2. `useSimulation` POSTs to `/simulate/earthquake` or `/simulate/scenario/fire`
3. Response contains `epicenter_lat`, `epicenter_lon`, `calamity_type`, `radius_km`
4. `epicenter` state updates → `EarthquakeHalo` renders danger radius on map
5. Backend streams `zone_update` events → zones change colour (300ms CSS transition)
6. Zone batch flushes after 700ms → grouped zone alert appears in chat
7. Power batch flushes after 900ms → grid failure announcement in chat
8. `negotiation` events arrive → request + award bubbles stream in chat; inventory deducted
9. `xai` events arrive → XAI explanation appears in chat and XAI panel
10. `dispatch` event arrives → `EmergencyRoutes` fetches OSRM routes per unit
11. Each resolved route → route line drawn on map + dispatch chat bubble + inventory deducted
12. `onRouteReady` fires → single deduped chat bubble per unit per origin-destination pair

---

## Styling

All styling is **Tailwind CSS v3** with a custom dark theme. Custom values in `tailwind.config.js`:

```javascript
colors: {
  'panel-bg':      '#0b0f1a',   // page background
  'panel-surface': '#0f1623',   // sidebar / header
  'panel-card':    '#131928',   // card backgrounds
  'panel-border':  '#1e2a3a',   // all borders
}
```

Zone severity colours follow a traffic-light convention with CSS transitions:
- **CRITICAL** → `#ef4444` (red)
- **HIGH** → `#f97316` (orange)
- **LOW** → `#eab308` (yellow)
- **SAFE** → `#22c55e` (green)
- **Unclassified** → `#374151` (neutral grey)

---

## Folder Conventions

- Custom hooks → `src/hooks/`, prefixed `use`
- All API URLs → `src/constants/api.js` only — never inline
- Agent icons → `src/constants/agentIcons.js` — single source for all emoji/color/label mappings
- Every component file starts with a JSDoc comment explaining its purpose

---

## Deployment (Vercel)

1. Push to GitHub
2. Connect repo to [vercel.com](https://vercel.com)
3. Set **Build Command**: `npm run build`
4. Set **Output Directory**: `dist`
5. Done — auto-deploys on every push

No environment variables needed on the frontend if your backend URL is hardcoded in `api.js`. For dynamic config, add `VITE_API_URL` and `VITE_WS_URL` to Vercel's environment variable settings and update `api.js` to read `import.meta.env.VITE_API_URL`.
