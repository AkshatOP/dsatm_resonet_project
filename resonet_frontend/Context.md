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
- POST /simulate/scenario/fire                      → { scenario, event_id, calamity_type:"FIRE", intensity, radius_km, epicenter_lat, epicenter_lon }
- POST /simulate/reset                              → { status, message }
- POST /agents/{agent_id}/priority  body:{weight}  → adjusts priority weight

### WebSocket Event Contract
All events: { event_type, payload, timestamp }

zone_update:   zone_id, severity_score, classification (SAFE/LOW/HIGH/CRITICAL),
               population_density, has_critical_infra, road_blocked, power_status,
               lat, lon, calamity_type ("EARTHQUAKE"|"FIRE")

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

## Distance-Band Classification (source of truth)
Both the Map (ZoneCircle.jsx) and the Backend (SensingAgent) now use identical
distance-from-epicenter thresholds. These MUST stay in sync.

Earthquake bands (metres):  CRITICAL < 3 600 | HIGH < 7 000 | LOW < 11 000 | SAFE ≥ 11 000
Fire bands (metres):        CRITICAL <   500 | HIGH: IMPOSSIBLE (zero-width) | LOW < 2 500 | SAFE ≥ 2 500
                            → Only the epicenter zone can ever be CRITICAL for fires.
                            → Nearby zones (B, A, H, C within 2.5km) are LOW; everything else SAFE.

Frontend mirror: EmergencyRoutes.jsx — EQ_BANDS_M / FIRE_BANDS_M + effectiveClass()
Backend mirror:  sensing_agent.py   — _EQ_BANDS_M / _FIRE_BANDS_M + _distance_class()
Backend mirror:  ZoneCircle.jsx     — quakeClass() uses same 3600/7000/11000 values

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

[2026-05-05 07:15] FIRE CALAMITY SIMULATION —
  Backend:
  - messaging/message_types.py: Added FireEvent dataclass (intensity, radius_km, calamity_type="FIRE").
      EarthquakeEvent got calamity_type="EARTHQUAKE" field for parity.
  - simulation/fire_simulator.py: New. Steep falloff: severity = max(0, 1 − dist_km/radius_km).
      Default radius 1.5km → only epicenter zone CRITICAL, adjacent zones LOW, rest SAFE.
  - config.py: Added DEMO_FIRE seed (Zone-I / Mahalakshmi Layout: 13.0051, 77.5591).
  - agents/sensing_agent.py: Added process_fire_event(). Refactored shared _common_pipeline().
      Fire dispatch: fire_agent + police_agent + hospital_agent to all CRITICAL/HIGH zones.
      zone_update WS payload now includes calamity_type field.
  - api/routes.py: Added POST /simulate/scenario/fire. Added FireBody pydantic model.
      Reset endpoint now clears police_agent.crowd_control_zones.
  Frontend:
  - constants/api.js: Added simulateFire endpoint.
  - hooks/useSimulation.js: Added triggerFire() method.
  - Sidebar/Controls.jsx: Added 🔥 "Simulate Fire (Zone-I)" button (orange theme).
  - Map/EmergencyRoutes.jsx: Added police responder. Fire danger zone = 500m circle.
  - Map/EarthquakeHalo.jsx: Dynamic radius — fire 500m tight, earthquake mag-based.
  - App.jsx: Wired triggerFire + calamity_type/radius_km on epicenter object.
  VERIFIED: npm run build → 0 errors. Fire at Zone-I: only Zone-I=CRITICAL, rest SAFE.

[2026-05-05 08:00] CLASSIFICATION CONSISTENCY FIX — CRITICAL BUG —
  ROOT CAUSE: ZoneCircle.jsx used distance-based classification (CRITICAL<3600m, HIGH<7000m,
  LOW<11000m) while the backend ZoneClassifier used a weighted score (0.4×severity +
  0.3×population + 0.3×infra). These produced completely different results for 9/12 zones.
  FIX:
  - backend/agents/sensing_agent.py: _common_pipeline() now classifies zones by DISTANCE from
      epicenter using haversine, matching ZoneCircle.jsx bands exactly.
      _EQ_BANDS_M = (3600, 7000, 11000) | _FIRE_BANDS_M = (500, 500, 2500)
      Rule-based ZoneClassifier still runs for DEBUG logging only (no longer authoritative).
  - frontend/Map/EmergencyRoutes.jsx: getTargetZones() now computes effectiveClass() per zone
      using the same distance bands, not zone.classification from WS payload.
  - backend/simulation/earthquake.py: Damage threshold raised 0.6 → 0.85.
  RESULT: All 12 zones match 100% between map and backend. Validated with script.
  VERIFIED: npm run build → 0 errors. 74 modules.
  ⚠️ INVARIANT: EQ_BANDS_M values must stay identical in:
     ZoneCircle.jsx quakeClass() | EmergencyRoutes.jsx EQ_BANDS_M | sensing_agent.py _EQ_BANDS_M

[2026-05-05 08:25] FIRE CLASSIFICATION TIGHTENING —
  PROBLEM: Fire simulation was incorrectly marking Yeshwanthpur and other nearby zones CRITICAL
  because ZoneCircle.jsx was still using earthquake bands for fire, and FIRE_BANDS allowed HIGH.
  User requirement: ONLY Zone-I (Mahalakshmi Layout) = CRITICAL, adjacent zones = LOW (no HIGH).
  CHANGES:
  - Map/ZoneCircle.jsx: quakeClass() now reads epicenter.calamity_type. If FIRE, uses
      FIRE_BANDS_M=[500,500,2500] instead of EQ_BANDS_M=[3600,7000,11000].
      The zero-width HIGH band (500==500) means no zone can ever be HIGH in a fire.
  - agents/sensing_agent.py: _FIRE_BANDS_M updated (500,500,2500).
  - Map/EmergencyRoutes.jsx: FIRE_BANDS_M updated [500,500,2500].
  - config.py: DEMO_FIRE radius_km reduced 1.5 → 0.4 (tight 400m visual circle).
  - Map/EarthquakeHalo.jsx: Fire halo fixed at 400m radius (not radius_km-based),
      mainFillOpacity 0.18 (more visible), glowExtra 100m (tighter).
  RESULT (validated):
      Zone-I   0m      → CRITICAL ✓
      Zone-B   1302m   → LOW ✓
      Zone-A   1558m   → LOW ✓
      Zone-H   2330m   → LOW ✓
      Zone-C   2358m   → LOW ✓
      Zone-D   5142m   → SAFE ✓  (was wrongly HIGH before)
      All others       → SAFE ✓
  VERIFIED: npm run build → 0 errors. 74 modules.
  ⚠️ Restart backend to pick up config.py + sensing_agent.py changes.

[2026-05-05 09:15] ZONE-COHERENT DOT COLORING —
  PROBLEM: BuildingCluster colored each dot by the dot's own physical distance to the epicenter.
  This caused dots physically near zone borders to pick up a different color than their zone's
  big circle, making the map look inconsistent (dots of mixed colors around each zone).
  FIX: Map/BuildingCluster.jsx rewritten.
  - Replaced per-dot quakeColourAt(d.lat, d.lon) with zoneEffectiveClass(zone.lat, zone.lon).
  - Classification computed ONCE per zone using the zone center's distance to epicenter.
  - Uses the same EQ_BANDS_M / FIRE_BANDS_M constants as ZoneCircle.jsx and EmergencyRoutes.jsx.
  - All dots in Zone-C (Yeshwanthpur) are yellow (LOW). All dots in Zone-I are red (CRITICAL).
  - No epicenter → dots fall back to zone.classification from backend (unchanged behavior).
  - Removed the redundant quakeColourAt() per-dot function and the inner map callback wrapper.
  VERIFIED: npm run build → 0 errors. 74 modules.

[2026-05-05 09:22] PER-RESPONDER DISPATCH CHAT + INVENTORY DEPLETION —
  PROBLEM 1: Chat only showed generic "NDRF aerial/land" messages for all responders.
  Hospital, Fire, Police routes were drawn on the map with zero chat notification.
  PROBLEM 2: Inventory didn't decrease when routes were drawn — only negotiation events
  updated the pool, but route deployment (EmergencyRoutes) was purely frontend-side.
  FIX:
  - Map/EmergencyRoutes.jsx: Added onRouteReady prop. Called with per-unit info
      { respId, label, emoji, unitIdx, destLabel, destClass, etaMinutes, distanceKm, hasDanger }
      once OSRM fetch succeeds for each unit. Stagger timing already gives natural chat rhythm.
  - Map/CityMap.jsx: Threads onRouteReady from App → EmergencyRoutes.
  - App.jsx: 
      • RESP_AGENT map: respId (hospital/ndrf/fire/police) → backend agent_id.
      • DEPLOY_COST table: per-unit resource cost for each responder.
      • handleRouteReady(): dedup by route:respId:unitIdx:destLabel key.
          - Pushes a unique chat bubble per agency with emoji, ETA, km, ⚠️ if dangerous.
          - Deducts DEPLOY_COST from that agent's resource_pool in setAgents.
          - Recomputes current_load and status (IDLE/ACTIVE/OVERLOADED) same as onNegotiation.
      • onDispatch(): now silently updates dispatch state only; no more NDRF-only chat.
      • CityMap now receives onRouteReady={handleRouteReady}.
  CHAT SEQUENCE (fire example):
    [Trigger] 🔥 Fire outbreak — dispatching emergency units (immediate, from handleTriggerFire)
    [WS]      Zone Monitor — Zone-I CRITICAL, Zone-B/A/H/C LOW  (from zone_update batch)
    [WS]      RFP requests + awards from sensing_agent triggering on_critical_zone (negotiation)
    [OSRM]    🚒 Fire Unit 1 en route → Zone-I (ETA Xm) — from onRouteReady
    [OSRM]    🏥 Ambulance Unit 1 en route → Zone-I (ETA Xm)
    [OSRM]    🪖 NDRF Unit 1 deploying → Zone-I (ETA Xm)
    [OSRM]    🚓 Police Unit 1 en route → Zone-I for crowd control (ETA Xm)
    ... (Unit 2 of each responder 300-400ms later)
  INVENTORY DEPLETION per unit deployed:
    hospital: -8 personnel, -10 beds
    ndrf:     -12 personnel, -1 heavy_equipment
    fire:     -6 personnel, -1 vehicle, -30 water_units
    police:   -8 personnel, -1 vehicle
  VERIFIED: npm run build → 0 errors. 74 modules.

[2026-05-05 09:29] POWER OVERLAY FIRE FIX —
  PROBLEM: PowerOverlay hardcoded power-loss radius = 7000m for all calamity types.
  During a fire at Zone-I, this blanked out ALL blue city-light dots within 7km —
  covering most of the visible map — even though only Zone-I (the epicenter) actually
  lost power. The chat also said "1 sector offline" but showed no blue dots for 11 zones.
  FIX:
  - Map/PowerOverlay.jsx: Replaced POWER_LOSS_RADIUS_M with two constants:
      EQ_POWER_LOSS_M   = 7 000 m  (earthquake: CRITICAL+HIGH ring goes dark)
      FIRE_POWER_LOSS_M =   500 m  (fire: only the epicenter zone goes dark)
    poweredZones useMemo now reads epicenter.calamity_type to pick the correct radius.
  - App.jsx flushPowerBatch: Same fix — lossRadius = 500m for FIRE, 7000m for EQ,
    so the "X sectors offline" chat count matches exactly what PowerOverlay renders.
  INVARIANT: FIRE_POWER_LOSS_M (500) must equal FIRE_BANDS_M[0] (500) so the dark
  zone and the CRITICAL classification zone are always the same area.
  VERIFIED: npm run build → 0 errors. 74 modules.
