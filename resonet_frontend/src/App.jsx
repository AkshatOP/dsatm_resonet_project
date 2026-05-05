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
  hospital_agent: { power_units: 50, beds: 300, personnel: 80 },
  fire_agent:     { vehicles: 12, personnel: 60, water_units: 500 },
  police_agent:   { personnel: 100, vehicles: 20 },
  ndrf_agent:     { heavy_equipment: 15, personnel: 120, aerial_units: 4 },
};

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

  // Power batch buffer — collects power status changes, flushes a power_agent chat msg
  const powerBatchRef      = useRef({ off: [], on: [] });
  const powerBatchTimerRef = useRef(null);

  const { triggerEarthquake, resetSystem, isSimulating, lastEvent } = useSimulation();

  // Derive epicenter from the POST /simulate response — cleared to null on reset
  const epicenter = lastEvent?.epicenter_lat != null
    ? { lat: lastEvent.epicenter_lat, lon: lastEvent.epicenter_lon, magnitude: lastEvent.magnitude }
    : null;

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
    const { off, on } = powerBatchRef.current;
    powerBatchRef.current = { off: [], on: [] };
    if (off.length === 0) return;

    const offList  = off.join(', ');
    const onCount  = on.length;
    pushMsg(makeMsg(
      'award', 'power_agent',
      `Grid failure confirmed — ${off.length} sector${off.length > 1 ? 's' : ''} offline: ${offList}.`,
      `Emergency load shedding active. ${onCount} sector${onCount !== 1 ? 's' : ''} maintaining stable supply.`,
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

    // Track power status changes for the power_agent chat message
    if (power_status === false && !powerBatchRef.current.off.includes(zone_id)) {
      powerBatchRef.current.off.push(zone_id);
    } else if (power_status === true && !powerBatchRef.current.on.includes(zone_id)) {
      powerBatchRef.current.on.push(zone_id);
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

    // ── Chat messages ──────────────────────────────────────────────
    // Requester asking
    pushMsg(makeMsg(
      'request', requester,
      `Urgently requesting ${amount_awarded} ${resLabel} to support active response operations.`,
      `Submitting RFP to all available agents in the resource pool.`,
    ));

    // Winner responding after short delay
    setTimeout(() => {
      const delta = ((gini_after ?? 0) - (gini_before ?? 0));
      pushMsg(makeMsg(
        'award', winner,
        `Bid accepted. Deploying ${amount_awarded} ${resLabel} immediately.`,
        `Gini: ${gini_before?.toFixed(3)} → ${gini_after?.toFixed(3)} (${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) · ${bids_count ?? 1} bid${bids_count !== 1 ? 's' : ''}`,
        { badge: 'AWARDED' },
      ));
    }, 350);
  }, [pushMsg]);

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
    const { assignments } = payload;
    setDispatch(assignments ?? {});

    const aerial = Object.entries(assignments ?? {}).filter(([, a]) => a.mode === 'AERIAL');
    const land   = Object.entries(assignments ?? {}).filter(([, a]) => a.mode === 'LAND');

    if (aerial.length > 0) {
      const summary = aerial.map(([z, a]) => `${z} (ETA ${a.eta_minutes}min)`).join(', ');
      pushMsg(makeMsg('dispatch', 'ndrf_agent',
        `Aerial deployment authorised for: ${summary}.`,
        `${aerial[0]?.[1]?.units_assigned ?? 10} units per zone · helicopter dispatch initiated`,
        { badge: 'AERIAL' },
      ));
    }
    if (land.length > 0) {
      const summary = land.map(([z, a]) => `${z} (ETA ${a.eta_minutes}min)`).join(', ');
      pushMsg(makeMsg('dispatch', 'ndrf_agent',
        `Ground convoy routing to: ${summary}.`,
        `${land[0]?.[1]?.units_assigned ?? 10} units per zone · land route confirmed`,
        { badge: 'LAND' },
      ));
    }
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
  const handleTrigger = useCallback(async () => {
    pushMsg(makeMsg(
      'request', 'power_agent',
      'Seismic activity detected. Initiating emergency power grid monitoring across all sectors.',
      'Scanning grid integrity — standby for sector status report.',
    ));
    await triggerEarthquake();
  }, [triggerEarthquake, pushMsg]);

  /* ── Reset ────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    resetSystem(() => {
      // Clear zone batch
      clearTimeout(zoneBatchTimerRef.current);
      zoneBatchRef.current = [];
      // Clear power batch
      clearTimeout(powerBatchTimerRef.current);
      powerBatchRef.current = { off: [], on: [] };
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
          <span className="text-xs text-gray-600 font-mono hidden md:inline">
            Resilient Network — Crisis Resource Orchestrator
          </span>
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
          <div className="shrink-0 p-3 border-b border-panel-border">
            <Controls isSimulating={isSimulating} onTrigger={handleTrigger} onReset={handleReset} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <AgentChat messages={messages} />
          </div>
        </aside>

        {/* Map — dispatch lines hidden for now */}
        <main className="flex-1 relative">
          <CityMap zones={zones} epicenter={epicenter} />
        </main>
      </div>

      {/* Bottom Panel — Agent Inventory */}
      <div className="h-[240px] shrink-0 border-t border-[#1e2330] overflow-hidden">
        <AgentInventory agents={agents} />
      </div>
    </div>
  );
}
