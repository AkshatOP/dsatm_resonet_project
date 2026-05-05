/**
 * App.jsx — ResoNet Crisis Response Dashboard
 *
 * Sidebar layout:
 *   Controls (fixed) → AgentChat (flex-3) → AgentInventory (flex-2)
 *
 * WS events → chat messages:
 *   zone_update  → buffered 700ms, then grouped by classification (CRITICAL/HIGH)
 *   negotiation  → requester bubble + award bubble (deduped by decision_id)
 *   xai          → XAI agent explanation bubble
 *   dispatch     → NDRF aerial/land announcement
 *   agent_state  → silently updates inventory only
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

import { useWebSocket }  from './hooks/useWebSocket';
import { useSimulation } from './hooks/useSimulation';
import { ENDPOINTS }     from './constants/api';
import { AGENT_ICONS, agentTypeFromId } from './constants/agentIcons';

import CityMap        from './components/Map/CityMap';
import Controls       from './components/Sidebar/Controls';
import AgentChat      from './components/Sidebar/AgentChat';
import AgentInventory from './components/Sidebar/AgentInventory';

const MAX_MSGS = 80;

/* ── Initial resource pools (mirrors backend config.py) ────────── */
const INITIAL_POOLS = {
  power_agent:    { power_units: 200 },
  hospital_agent: { power_units: 50, beds: 300, personnel: 80, ambulances: 10 },
  fire_agent:     { vehicles: 12, personnel: 60, water_units: 500 },
  police_agent:   { personnel: 100, vehicles: 20 },
  ndrf_agent:     { heavy_equipment: 15, personnel: 120, aerial_units: 4 },
};

/* ── Route responder → backend agent ID mapping ────────────────────── */
const RESP_AGENT = {
  hospital: 'hospital_agent',
  ndrf:     'ndrf_agent',
  fire:     'fire_agent',
  police:   'police_agent',
};

/* cost per unit deployed — deducted once per route when OSRM resolves */
const DEPLOY_COST = {
  hospital: { personnel: 8,  beds: 10, ambulances: 1 },
  ndrf:     { personnel: 12, heavy_equipment: 1 },
  fire:     { personnel: 6,  vehicles: 1, water_units: 30 },
  police:   { personnel: 8,  vehicles: 1 },
};

/* ── Haversine approx (flat-earth OK for < 50 km) ────────────── */
function metersApart(lat1, lon1, lat2, lon2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const mLat = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  return Math.sqrt((dLat * R) ** 2 + (dLon * R * Math.cos(mLat)) ** 2);
}

/* ── Chat message factory ─────────────────────────────────────── */
function makeMsg(type, agentId, text, subtext = null, extras = {}) {
  return {
    id:      `${Date.now()}-${Math.random()}`,
    type, agentId, text, subtext,
    time:    new Date(),
    ...extras,
  };
}

function agentLabel(agentId) {
  const type = agentTypeFromId(agentId);
  return AGENT_ICONS[type]?.label ?? agentId;
}

/* ── App ──────────────────────────────────────────────────────── */
export default function App() {
  const [zones,    setZones]    = useState([]);
  const [agents,   setAgents]   = useState({});
  const [health,   setHealth]   = useState(null);
  const [dispatch, setDispatch] = useState({});
  const [messages, setMessages] = useState([]);

  // decision_id dedup — prevents StrictMode double-fire duplicates
  const seenDecisions  = useRef(new Set());
  const decisionsRef   = useRef(new Map());

  // Zone batch buffer — collects zone_update events, flushes as one grouped msg
  const zoneBatchRef      = useRef([]);
  const zoneBatchTimerRef = useRef(null);

  // Power batch — stores { id, lat, lon } for every zone the backend marks power_off.
  // Filtered by distance at flush time so the message matches the map exactly.
  const powerBatchRef      = useRef([]);
  const powerBatchTimerRef = useRef(null);

  // Mirror of the epicenter state in a ref so async callbacks can read it without
  // being in the dependency chain of useCallback.
  const epicenterRef = useRef(null);

  const { triggerEarthquake, triggerFire, resetSystem, isSimulating, lastEvent } = useSimulation();

  // Derive epicenter from the POST /simulate response — cleared to null on reset
  // Include calamity_type and radius_km so EmergencyRoutes and EarthquakeHalo
  // can render the correct danger-zone size for fire vs earthquake.
  const epicenter = lastEvent?.epicenter_lat != null
    ? {
        lat: lastEvent.epicenter_lat,
        lon: lastEvent.epicenter_lon,
        magnitude: lastEvent.magnitude,
        calamity_type: lastEvent.calamity_type ?? 'EARTHQUAKE',
        radius_km: lastEvent.radius_km ?? null,
      }
    : null;
  // Keep ref in sync with state so flush callbacks can read it without being
  // added to useCallback dependency arrays (refs are stable objects).
  epicenterRef.current = epicenter;

  const pushMsg = useCallback((msg) => {
    setMessages((prev) => [...prev, msg].slice(-MAX_MSGS));
  }, []);

  /* ── Zone batch flush ─────────────────────────────────────────── */
  const flushZoneBatch = useCallback(() => {
    const batch = zoneBatchRef.current;
    zoneBatchRef.current = [];
    if (batch.length === 0) return;

    // Group by classification
    const groupMap = {};
    batch.forEach((z) => {
      if (!groupMap[z.classification]) groupMap[z.classification] = [];
      groupMap[z.classification].push(z);
    });

    const ORDER = ['CRITICAL', 'HIGH', 'LOW'];
    const groups = ORDER
      .filter((cls) => groupMap[cls])
      .map((cls) => ({ cls, zones: groupMap[cls] }));

    if (groups.length === 0) return;

    pushMsg(makeMsg('zone_group', 'zone_monitor', '', null, { groups }));
  }, [pushMsg]);

  /* ── Power batch flush — fires after all zone_update events settle ── */
  const flushPowerBatch = useCallback(() => {
    const collected = powerBatchRef.current;
    powerBatchRef.current = [];
    if (collected.length === 0) return;

    const epi = epicenterRef.current;

    // Use the same calamity-aware radius as PowerOverlay:
    // Fire → 500m (only the epicenter zone), Earthquake → 7000m (CRITICAL+HIGH ring)
    const lossRadius = epi?.calamity_type === 'FIRE' ? 500 : 7000;
    const off = epi
      ? collected.filter((z) => metersApart(z.lat, z.lon, epi.lat, epi.lon) < lossRadius)
      : [];

    if (off.length === 0) return;

    const offIds      = off.map((z) => z.id).join(', ');
    const stableCount = 12 - off.length;
    pushMsg(makeMsg(
      'award', 'power_agent',
      `Grid failure confirmed — ${off.length} sector${off.length > 1 ? 's' : ''} offline: ${offIds}.`,
      `Emergency load shedding active. ${stableCount} sector${stableCount !== 1 ? 's' : ''} maintaining stable supply.`,
      { badge: 'OFFLINE' },
    ));
  }, [pushMsg]);

  /* ── WebSocket handlers ───────────────────────────────────────── */
  const onZoneUpdate = useCallback((payload) => {
    const { zone_id, lat, lon, classification, severity_score,
            population_density, has_critical_infra, road_blocked, power_status } = payload;

    setZones((prev) => prev.map((z) =>
      z.id === zone_id
        ? { ...z, classification, severity_score,
            lat: lat ?? z.lat, lon: lon ?? z.lon,
            population_density: population_density ?? z.population_density,
            has_critical_infra: has_critical_infra ?? z.has_critical_infra,
            road_blocked:  road_blocked  ?? z.road_blocked,
            power_status:  power_status  ?? z.power_status }
        : z
    ));

    // Collect every zone the backend reports as powered-off.
    // Distance filtering happens at flush time (in flushPowerBatch) using the epicenter,
    // so the chat message always matches exactly what PowerOverlay shows on the map.
    if (power_status === false) {
      const alreadyTracked = powerBatchRef.current.some((z) => z.id === zone_id);
      if (!alreadyTracked) {
        powerBatchRef.current.push({ id: zone_id, lat: lat ?? 0, lon: lon ?? 0 });
      }
    }
    clearTimeout(powerBatchTimerRef.current);
    // Flush slightly after zone batch (900 ms) so power msg appears after zone alert
    powerBatchTimerRef.current = setTimeout(flushPowerBatch, 900);

    // Buffer for grouped zone classification chat message
    if (['CRITICAL', 'HIGH', 'LOW'].includes(classification)) {
      const existingIdx = zoneBatchRef.current.findIndex((z) => z.zone_id === zone_id);
      const updateData = { zone_id, classification, power_status, road_blocked, has_critical_infra };
      if (existingIdx >= 0) {
        zoneBatchRef.current[existingIdx] = updateData;
      } else {
        zoneBatchRef.current.push(updateData);
      }
      clearTimeout(zoneBatchTimerRef.current);
      zoneBatchTimerRef.current = setTimeout(flushZoneBatch, 700);
    }
  }, [flushZoneBatch, flushPowerBatch]);

  const onNegotiation = useCallback((payload) => {
    const { decision_id, resource_type, requester, winner,
            amount_awarded, gini_before, gini_after, bids_count } = payload;

    // ── Skip 0-unit awards — completely pointless to announce
    if (!amount_awarded || amount_awarded === 0) return;

    // Dedup — StrictMode / reconnect can fire the same event twice
    if (seenDecisions.current.has(decision_id)) return;
    seenDecisions.current.add(decision_id);

    decisionsRef.current.set(decision_id, { ...decisionsRef.current.get(decision_id), ...payload });

    const resLabel = resource_type?.replace(/_/g, ' ') ?? 'resources';

    // ── Update inventory live ──────────────────────────────────────
    // Subtract from winner's pool, add to requester's pool
    if (winner && requester && resource_type && amount_awarded) {
      setAgents((prev) => {
        const next = { ...prev };

        // Helper: compute load using initial pools (same formula as backend)
        const computeLoad = (agentId, pool) => {
          const initial = INITIAL_POOLS[agentId];
          if (!initial) return 0;
          const ratios = [];
          for (const [key, initVal] of Object.entries(initial)) {
            if (initVal > 0) {
              const current = pool[key] ?? 0;
              ratios.push(Math.max(0, Math.min(1, 1 - (current / initVal))));
            }
          }
          return ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
        };

        // Winner loses resources
        if (next[winner]) {
          const winnerPool = { ...next[winner].resource_pool };
          winnerPool[resource_type] = Math.max(0, (winnerPool[resource_type] ?? 0) - amount_awarded);
          const load = computeLoad(winner, winnerPool);
          next[winner] = {
            ...next[winner],
            resource_pool: winnerPool,
            current_load: load,
            status: load >= 0.9 ? 'OVERLOADED' : load > 0 ? 'ACTIVE' : 'IDLE',
          };
        }

        // Requester gains resources
        if (next[requester]) {
          const reqPool = { ...next[requester].resource_pool };
          reqPool[resource_type] = (reqPool[resource_type] ?? 0) + amount_awarded;
          const load = computeLoad(requester, reqPool);
          next[requester] = {
            ...next[requester],
            resource_pool: reqPool,
            current_load: load,
            status: load >= 0.9 ? 'OVERLOADED' : load > 0 ? 'ACTIVE' : 'IDLE',
          };
        }

        return next;
      });
    }

    // ── Build population-density-aware zone deployment breakdown ───
    // Pull current zones from state snapshot for distribution message.
    // We derive a subtext explaining *which* zones the units go to.
    const buildDeploySubtext = () => {
      const currentZones = zones; // closure over state
      const affectedZones = currentZones.filter((z) =>
        z.classification === 'CRITICAL' || z.classification === 'HIGH'
      );

      if (affectedZones.length === 0) {
        const delta = ((gini_after ?? 0) - (gini_before ?? 0));
        return `Gini: ${gini_before?.toFixed(3)} → ${gini_after?.toFixed(3)} (${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) · ${bids_count ?? 1} bid${bids_count !== 1 ? 's' : ''}`;
      }

      // Weight each zone by population density × classification priority
      const clsPriority = { CRITICAL: 1.0, HIGH: 0.5 };
      const weighted = affectedZones.map((z) => ({
        id: z.id,
        cls: z.classification,
        weight: (z.population_density ?? 0.5) * (clsPriority[z.classification] ?? 0.5),
      }));
      const totalWeight = weighted.reduce((s, z) => s + z.weight, 0);

      // Allocate units proportionally (integer, min 1 per zone, sum = amount_awarded)
      let remaining = amount_awarded;
      const allocations = weighted.map((z, i) => {
        if (i === weighted.length - 1) return { ...z, units: remaining };
        const share = Math.max(1, Math.round((z.weight / totalWeight) * amount_awarded));
        remaining = Math.max(1, remaining - share);
        return { ...z, units: share };
      });

      // Group allocations by classification
      const criticals = allocations.filter((z) => z.cls === 'CRITICAL');
      const highs     = allocations.filter((z) => z.cls === 'HIGH');

      const parts = [];
      if (criticals.length > 0) {
        const critUnits = criticals.reduce((s, z) => s + z.units, 0);
        const critIds   = criticals.map((z) => z.id).join(', ');
        parts.push(`${critUnits} → ${critIds} (CRITICAL)`);
      }
      if (highs.length > 0) {
        const highUnits = highs.reduce((s, z) => s + z.units, 0);
        const highIds   = highs.map((z) => z.id).join(', ');
        parts.push(`${highUnits} → ${highIds} (HIGH)`);
      }

      const delta = ((gini_after ?? 0) - (gini_before ?? 0));
      const giniStr = `Gini ${gini_before?.toFixed(3)} → ${gini_after?.toFixed(3)} (${delta >= 0 ? '+' : ''}${delta.toFixed(3)})`;
      return parts.length > 0
        ? `Deploying: ${parts.join(' · ')} · ${giniStr}`
        : giniStr;
    };

    // ── Chat messages ──────────────────────────────────────────────
    // Requester asking
    pushMsg(makeMsg(
      'request', requester,
      `Requesting ${amount_awarded} ${resLabel} for active response operations.`,
      `RFP submitted to all available agents in the resource pool.`,
    ));

    // Winner responding after short delay
    setTimeout(() => {
      pushMsg(makeMsg(
        'award', winner,
        `Bid accepted. Deploying ${amount_awarded} ${resLabel} immediately.`,
        buildDeploySubtext(),
        { badge: 'AWARDED' },
      ));
    }, 350);
  }, [pushMsg, zones]);

  const onXai = useCallback((payload) => {
    const { decision_id, rationale, counterfactual } = payload;

    // Dedup — XAI events also double-fire in StrictMode dev
    const xaiKey = `xai:${decision_id}`;
    if (seenDecisions.current.has(xaiKey)) return;
    seenDecisions.current.add(xaiKey);

    decisionsRef.current.set(decision_id, { ...decisionsRef.current.get(decision_id), ...payload });

    pushMsg(makeMsg(
      'xai', 'xai_agent',
      rationale ?? 'Explanation not available.',
      counterfactual ? `↩ ${counterfactual}` : null,
    ));
  }, [pushMsg]);

  const onAgentState = useCallback((payload) => {
    setAgents((prev) => ({ ...prev, [payload.agent_id]: { ...prev[payload.agent_id], ...payload } }));
  }, []);

  const onDispatch = useCallback((payload) => {
    // Silently update dispatch state — chat messages now come from onRouteReady
    setDispatch(payload.assignments ?? {});
  }, []);

  /* ── Route-ready — fired by EmergencyRoutes when each OSRM fetch resolves ── */
  const handleRouteReady = useCallback((info) => {
    const { respId, label, emoji, unitIdx, originName, destLabel, destClass,
            etaMinutes, distanceKm, hasDanger } = info;

    // Dedup: include origin so the same responder can fire bubbles for
    // different stations covering different destinations.
    const key = `route:${respId}:${unitIdx}:${originName ?? '?'}:${destLabel}`;
    if (seenDecisions.current.has(key)) return;
    seenDecisions.current.add(key);

    const fromBit = originName ? ` from ${originName}` : '';

    // Chat bubble — unique message per responder type
    const MESSAGES = {
      hospital: [
        `🏥 Ambulance Unit ${unitIdx + 1}${fromBit} en route to ${destLabel}.`,
        `ETA ${etaMinutes} min · ${distanceKm} km${hasDanger ? ' · ⚠️ route passes through danger zone' : ''} · Medical team on standby.`,
      ],
      ndrf:     [
        `🪖 NDRF Unit ${unitIdx + 1}${fromBit} deploying to ${destLabel}.`,
        `ETA ${etaMinutes} min · ${distanceKm} km${hasDanger ? ' · ⚠️ danger zone on path' : ''} · Heavy rescue equipment loaded.`,
      ],
      fire:     [
        `🚒 Fire Unit ${unitIdx + 1}${fromBit} responding to ${destLabel}.`,
        `ETA ${etaMinutes} min · ${distanceKm} km${hasDanger ? ' · ⚠️ active fire zone ahead' : ''} · Water tanker + suppression crew dispatched.`,
      ],
      police:   [
        `🚓 Police Unit ${unitIdx + 1}${fromBit} en route to ${destLabel} for crowd control.`,
        `ETA ${etaMinutes} min · ${distanceKm} km${hasDanger ? ' · ⚠️ route through incident zone' : ''} · Perimeter establishment protocol active.`,
      ],
    };
    const [text, subtext] = MESSAGES[respId] ?? [
      `${emoji} ${label} Unit ${unitIdx + 1}${fromBit} dispatched to ${destLabel}.`,
      `ETA ${etaMinutes} min · ${distanceKm} km`,
    ];

    const agentId = RESP_AGENT[respId] ?? respId;
    pushMsg(makeMsg('dispatch', agentId, text, subtext, { badge: destClass === 'CRITICAL' ? 'AERIAL' : 'LAND' }));

    // Deduct resources for this deployed unit
    const cost = DEPLOY_COST[respId];
    if (!cost) return;

    setAgents((prev) => {
      if (!prev[agentId]) return prev;
      const pool = { ...prev[agentId].resource_pool };
      for (const [resource, amount] of Object.entries(cost)) {
        pool[resource] = Math.max(0, (pool[resource] ?? 0) - amount);
      }
      const initial = INITIAL_POOLS[agentId] ?? {};
      const ratios = Object.entries(initial)
        .filter(([, iv]) => iv > 0)
        .map(([k, iv]) => Math.max(0, Math.min(1, 1 - (pool[k] ?? 0) / iv)));
      const load = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
      return {
        ...prev,
        [agentId]: {
          ...prev[agentId],
          resource_pool: pool,
          current_load:  load,
          status: load >= 0.9 ? 'OVERLOADED' : load > 0 ? 'ACTIVE' : 'IDLE',
        },
      };
    });
  }, [pushMsg]);

  useWebSocket({ onZoneUpdate, onNegotiation, onXai, onAgentState, onDispatch });

  /* ── Bootstrap ────────────────────────────────────────────────── */
  useEffect(() => {
    async function bootstrap() {
      try {
        const [hRes, sRes] = await Promise.all([
          fetch(ENDPOINTS.health),
          fetch(ENDPOINTS.state),
        ]);
        const hData = await hRes.json();
        const sData = await sRes.json();
        setHealth(hData);
        const zonesArr = Array.isArray(sData.zones) ? sData.zones : (sData.zones?.zones ?? []);
        setZones(zonesArr.map((z) => ({ ...z, classification: null, severity_score: null })));
        setAgents(sData.agents ?? {});
      } catch (err) {
        console.error('[BOOT]', err);
      }
    }
    bootstrap();
  }, []);

  /* ── Trigger — push immediate power_agent alert, then fire simulation ── */
  const handleTrigger = useCallback(async (lat, lon, zone_id) => {
    const zoneLabel = zone_id ?? 'all sectors';
    pushMsg(makeMsg(
      'request', 'power_agent',
      `Seismic activity detected${zone_id ? ` near ${zoneLabel}` : ''}. Initiating emergency power grid monitoring across all sectors.`,
      'Scanning grid integrity — standby for sector status report.',
    ));
    await triggerEarthquake({ lat, lon, zone_id });
  }, [triggerEarthquake, pushMsg]);

  const handleTriggerFire = useCallback(async (lat, lon, zone_id) => {
    const zoneLabel = zone_id ? ` in ${zone_id}` : ' in Zone-I (Mahalakshmi Layout)';
    pushMsg(makeMsg(
      'request', 'fire_agent',
      `🔥 Fire outbreak reported${zoneLabel}. Dispatching emergency units.`,
      'Alerting Fire, Police, and Ambulance — initiating response protocol.',
    ));
    await triggerFire({ lat, lon, zone_id });
  }, [triggerFire, pushMsg]);

  /* ── Reset ────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    resetSystem(() => {
      // Clear zone batch
      clearTimeout(zoneBatchTimerRef.current);
      zoneBatchRef.current = [];
      // Clear power batch
      clearTimeout(powerBatchTimerRef.current);
      powerBatchRef.current = [];
      // Clear dedup sets
      seenDecisions.current.clear();
      decisionsRef.current.clear();
      // Clear UI state
      setZones((prev) => prev.map((z) => ({ ...z, classification: null, severity_score: null })));
      setDispatch({});
      setMessages([]);
      fetch(ENDPOINTS.state).then((r) => r.json()).then((d) => {
        setAgents(d.agents ?? {});
      }).catch(() => {});
    });
  }, [resetSystem]);

  const isHealthy = health?.status === 'ok';

  return (
    <div className="flex flex-col h-screen bg-panel-bg overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-panel-surface border-b border-panel-border shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl">🌐</span>
          <span className="text-base font-bold tracking-tight text-white">ResoNet</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-400 status-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-400">{isHealthy ? 'System OK' : 'Offline'}</span>
          </div>
          {health && (
            <>
              <span className="text-xs text-gray-500">Agents: <span className="text-gray-300">{health.agents}</span></span>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${health.redis ? 'bg-green-400' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">Redis</span>
              </div>
            </>
          )}
          {isSimulating && (
            <div className="flex items-center gap-2 bg-red-900/40 border border-red-800 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 bg-red-400 rounded-full sim-pulse" />
              <span className="text-xs text-red-300 font-semibold">Simulation Active</span>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 bg-panel-surface border-r border-panel-border flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 py-2 border-b border-panel-border flex items-center">
            <Controls isSimulating={isSimulating} onTrigger={handleTrigger} onTriggerFire={handleTriggerFire} onReset={handleReset} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <AgentChat messages={messages} />
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <CityMap
            zones={zones}
            epicenter={epicenter}
            onRouteReady={handleRouteReady}
            onTriggerFire={handleTriggerFire}
            onTriggerEarthquake={handleTrigger}
            isSimulating={isSimulating}
          />
        </main>
      </div>

      {/* Bottom Panel — Agent Inventory */}
      <div className="h-[240px] shrink-0 border-t border-[#1e2330] overflow-hidden">
        <AgentInventory agents={agents} />
      </div>
    </div>
  );
}
