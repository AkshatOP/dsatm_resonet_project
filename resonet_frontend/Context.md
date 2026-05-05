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

[2026-05-05 01:04] INIT — Scaffolded Vite+React project. Installed leaflet, react-leaflet, tailwindcss@3, postcss, autoprefixer. Initialized Tailwind config. Created CLAUDE.md and Context.md.

[2026-05-05 01:40] FULL BUILD COMPLETE — Built all components from scratch:
  - src/constants/api.js — BASE_URL, WS_URL, ENDPOINTS
  - src/constants/agentIcons.js — AGENT_ICONS, STATUS_COLOURS, ZONE_COLOURS
  - src/hooks/useWebSocket.js — native WS, auto-reconnect 3s, typed event dispatch
  - src/hooks/useSimulation.js — trigger/reset with 15s safety timeout
  - src/components/Map/CityMap.jsx — Leaflet MapContainer, CartoDB Dark basemap
  - src/components/Map/ZoneCircle.jsx — CircleMarker with Tooltip + Popup, colour transitions
  - src/components/Map/DispatchLine.jsx — LAND polyline + AERIAL dashed arc
  - src/components/Map/MapLegend.jsx — bottom-right overlay legend
  - src/components/Sidebar/Controls.jsx — Trigger + Reset buttons with pulse animation
  - src/components/Sidebar/GiniMeter.jsx — Gini bar with before/after delta
  - src/components/Sidebar/AgentCard.jsx — agent status card with load bar + resource pills
  - src/components/Sidebar/EventLog.jsx — scrolling live log, max 50 entries
  - src/components/BottomPanel/XAIPanel.jsx — typewriter rationale/counterfactual display
  - src/App.jsx — root layout, all state management, WS wiring
  - src/index.css — dark theme, animations, Leaflet overrides
  VERIFIED: npm run build → 0 errors. Dev server at http://localhost:5173.
  DECISION: /state zones is flat array (not {zones:[]}). Parsing handles both shapes.
  DECISION: Agent type extracted via agentTypeFromId() stripping _agent suffix.

[2026-05-05 03:13] CHAT REFACTOR — Replaced Gini+AgentCards+EventLog+XAI panel with two new components:
  - AgentChat.jsx: Chat-style feed. Each WS event → human-readable bubble.
      negotiation → requester bubble (request) + 250ms delayed winner bubble (award)
      xai         → 🤖 XAI Agent bubble with rationale + counterfactual as subtext
      zone_update → only CRITICAL/HIGH zones get bubbles (to avoid noise)
      dispatch    → batched AERIAL and LAND into one bubble each
  - AgentInventory.jsx: Redesigned agent resource panel with NODE tags, resource tiles,
      load bars, status dots. Every metric has a hoverable ? tooltip (TipWrap component).
      Critical resources (<20) shown in red with ! indicator.
  - App.jsx: Rewired. Sidebar = Controls (fixed) + AgentChat (flex-3) + AgentInventory (flex-2).
      Bottom XAI panel removed. No more EventLog, GiniMeter, AgentCard imports.
  - index.css: Added .animate-fadein for chat bubbles.
  VERIFIED: npm run build → 0 errors. Layout confirmed via screenshot.

[2026-05-05 03:26] ZONE GROUPING + DEDUP FIX —
  - DUPLICATE FIX: Added seenDecisions Set ref in App.jsx. onNegotiation checks decision_id
    before posting chat msg — blocks StrictMode double-fire duplicates completely.
  - ZONE GROUPING: zone_update events buffered 700ms in zoneBatchRef, then flushed as a single
    zone_group message. Groups CRITICAL/HIGH/LOW zones. Each zone name has a CSS stagger
    animation (0.22s increments, .zone-line class + inline animationDelay).
  - ZONE FORMAT: "Zone found CRITICAL (power lost · roads blocked · critical infrastructure):\n  › Zone B\n  › Zone A"
  - Chat bubble redesign: compact image2-style (6px left accent border, emoji + name + time on one row, xs text).
  - ZoneGroupBubble: separate render path for zone_group type, reads groups[] from msg extras.
  - Reset: clears zoneBatchTimerRef + zoneBatchRef + seenDecisions + decisionsRef.
  VERIFIED: npm run build → 0 errors.

[2026-05-05 03:39] DOT RESIZE + DISPATCH REMOVAL + XAI DEDUP —
  - ZoneCircle: radius max(5, min(9, density*10)). CRITICAL: fillOpacity=0.92, weight=1.5.
  - CityMap: DispatchLine removed. Zoom bumped 12→13. dispatchAssignments prop gone.
  - MapLegend: dispatch routes section removed.
  - XAI DEDUP: onXai checks seenDecisions with key 'xai:decision_id'. All duplicates blocked.
  VERIFIED: npm run build → 0 errors.

[2026-05-05 03:46] EXPANDED CITY ZONES & CHAT ZONE DEDUP —
  - backend/ResoNet/config.py: Replaced the 12 zones with a generated set of 49 zones.
    These are clustered around the epicenter (Zone-D) with normally distributed offsets,
    creating a dense, realistic cluster of dots (many Critical/High near the center).
  - App.jsx: Fixed the zone repetition in chat. The zoneBatchRef now deduplicates incoming
    zone_update events by zone_id before pushing, so StrictMode double-fires are merged.
  VERIFIED: App.jsx builds cleanly. Backend needs a restart to pick up the 49 zones.

## Known Issues
<!-- Append discovered bugs and workarounds here -->

[2026-05-05 05:00] ZONAL MAP LEGEND —
  - MapLegend.jsx: Added interactive "ZONES" section at bottom of legend panel.
      Collapsible list (▾ toggle) shows all zones with ID + name.
      Hovering a row → reveals estimated area coverage (km²) with slide-in animation.
      Active zone highlighted with left accent border + glow dot in zone's severity colour.
  - CityMap.jsx: Added hoveredZoneId state + onHoverZone callback wired to MapLegend.
      Passes isHighlighted / isDimmed booleans down to each ZoneCircle.
  - ZoneCircle.jsx: Added isHighlighted + isDimmed props.
      isHighlighted → radius +4, fillOpacity=1, strokeWeight=3, dashed glow ring.
      isDimmed → fillOpacity=0.25, strokeOpacity=0.2 for subtle focus effect.
  - Area estimate: π·r² where r = 3.5 − density×2.3 (denser = smaller urban footprint).
  VERIFIED: npm run build → 0 errors.

[2026-05-05 06:07] EMERGENCY ROUTING —
  - hooks/useOsrmRoute.js: Standalone hook (not used by current impl — inlined for simplicity).
      OSRM public API, geojson geometry, haversine danger-zone check, segment tagging.
  - Map/AnimatedRoute.jsx: RAF-based progressive polyline animation.
      easeInOut cubic easing over 3200ms. Glow layer (weight=10, opacity=0.20) + main line.
      Danger segments pulse at 600ms interval. Supports replay via key change.
      Uses raw L.polyline via useMap() — NOT react-leaflet components (incremental update).
  - Map/EmergencyRoutes.jsx: Orchestrator for 3 responders (Hospital/NDRF/Fire → epicenter).
      Staggered fetch: 0ms / 600ms / 1200ms. Danger zones = earthquake halo circle.
      ETA panel overlay: top-center, glassmorphism, neon green. Shows km + ETA per route.
      ⚠️ badge when route passes through danger zone. ↺ Replay button.
      Auto-clears on reset (epicenter null). AbortController cancels in-flight fetches.
  - CityMap.jsx: Added EmergencyRoutes inside MapContainer.
  - index.css: Added .emergency-routes-eta panel + all sub-element styles. fadeInDown anim.
  VERIFIED: npm run build → 0 errors. 74 modules.

