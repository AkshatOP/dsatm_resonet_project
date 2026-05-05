/**
 * AgentInventory.jsx
 * Bottom-panel inventory showing live resource levels per agent.
 * Shows ALL agents (including operational agents with no physical resources).
 * Drag-to-scroll horizontal strip.
 */

import { useRef, useState, useCallback } from 'react';
import { AGENT_ICONS, agentTypeFromId } from '../../constants/agentIcons';

/* ── Initial pools (mirrors backend config.py) ───────────────── */
const INITIAL_POOLS = {
  power_agent:    { power_units: 200 },
  hospital_agent: { power_units: 50, beds: 300, personnel: 80, ambulances: 10 },
  fire_agent:     { vehicles: 12, personnel: 60, water_units: 500 },
  police_agent:   { personnel: 100, vehicles: 20 },
  ndrf_agent:     { heavy_equipment: 15, personnel: 120, aerial_units: 4 },
};

/* ── Friendly resource names ─────────────────────────────────── */
const RESOURCE_LABELS = {
  power_units:     'Power',
  beds:            'Beds',
  personnel:       'Personnel',
  water_tanks:     'Water',
  water_units:     'Water',
  vehicles:        'Vehicles',
  units:           'Units',
  drones:          'Drones',
  food_packs:      'Food',
  medicines:       'Medicine',
  ambulances:      'Ambulance',
  heavy_equipment: 'Heavy Eq.',
  aerial_units:    'Aerial',
};

function friendlyLabel(key) {
  return RESOURCE_LABELS[key] ?? key.replace(/_/g, ' ');
}

/* ── NODE tag derivation ─────────────────────────────────────── */
function nodeTag(agentId) {
  const map = {
    hospital_agent:     'HA-01',
    power_agent:        'PW-01',
    fire_agent:         'FR-01',
    police_agent:       'PL-01',
    ndrf_agent:         'NF-01',
    rescue_coordinator: 'RC-01',
    sensing_agent:      'SE-01',
    policy_agent:       'PO-01',
    xai_agent:          'XA-01',
  };
  return map[agentId] ?? agentId.slice(0, 4).toUpperCase() + '-01';
}

/* ── Role description for non-resource agents ────────────────── */
const AGENT_ROLE = {
  rescue_coordinator: 'Route & ETA Optimization',
  sensing_agent:      'Zone Sensing & Dispatch',
  policy_agent:       'Fairness & Gini Enforcement',
  xai_agent:          'Decision Explainability',
};

/* ── Total available computation for a resource type ─────────── */
function computeTotalAvailable(agents, resourceKey) {
  let total = 0;
  for (const agent of Object.values(agents)) {
    if (agent.resource_pool && resourceKey in agent.resource_pool) {
      total += Math.max(0, agent.resource_pool[resourceKey] ?? 0);
    }
  }
  return Math.round(total);
}

/* ── Resource inventory card (agents with physical resources) ─── */
function ResourceCard({ agent, allAgents }) {
  const {
    agent_id,
    agent_type,
    resource_pool = {},
    current_load  = 0,
    status        = 'IDLE',
    priority_weight = 1,
  } = agent;

  const type    = agent_type ?? agentTypeFromId(agent_id);
  const meta    = AGENT_ICONS[type] ?? { emoji: '🤖', color: '#94a3b8', label: type };
  const tag     = nodeTag(agent_id);
  const loadPct = Math.round(current_load * 100);
  const isCrit  = loadPct > 80;

  const initial  = INITIAL_POOLS[agent_id] ?? {};
  const resources = Object.entries(resource_pool);

  const statusColor = {
    IDLE:       '#6b7280',
    ACTIVE:     '#22c55e',
    OVERLOADED: '#ef4444',
    OFFLINE:    '#374151',
  }[status] ?? '#6b7280';

  return (
    <div className="inv-card" style={{ '--accent': meta.color }}>
      {/* Header */}
      <div className="inv-card-header">
        <div className="inv-card-agent">
          <span className="inv-card-emoji">{meta.emoji}</span>
          <div>
            <div className="inv-card-name">{meta.label}</div>
            <div className="inv-card-meta">
              <span className="inv-card-dot" style={{ background: statusColor }} />
              <span>{status}</span>
              <span className="inv-card-sep">·</span>
              <span style={{ color: meta.color }}>{tag}</span>
            </div>
          </div>
        </div>
        <div className="inv-card-weight" title="Priority weight">
          {priority_weight.toFixed(1)}×
        </div>
      </div>

      {/* Resources grid */}
      {resources.length > 0 && (
        <div className="inv-card-resources">
          {resources.map(([key, val]) => {
            const isNum = typeof val === 'number';
            const initVal = initial[key];
            const isLow = isNum && initVal && val < initVal * 0.2;
            // Total available across all agents for this resource type
            const totalAvail = isNum ? computeTotalAvailable(allAgents, key) : null;
            return (
              <div key={key} className={`inv-res ${isLow ? 'inv-res--low' : ''}`}>
                <span className="inv-res-label">{friendlyLabel(key)}</span>
                <span className="inv-res-val" style={{ color: isLow ? '#ef4444' : meta.color }}>
                  {isNum ? Math.round(val) : (val ?? '—')}
                </span>
                {totalAvail !== null && initVal && (
                  <span className="inv-res-total" title={`Total available across all agents`}>
                    /{totalAvail} avail
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load bar */}
      <div className="inv-card-load">
        <div className="inv-load-header">
          <span>Load</span>
          <span className={isCrit ? 'inv-load-crit' : ''}>{loadPct}%</span>
        </div>
        <div className="inv-load-track">
          <div
            className="inv-load-fill"
            style={{
              width: `${Math.min(100, loadPct)}%`,
              background: isCrit ? '#ef4444' : meta.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Operational card (no physical resources — policy/xai/sensing/rescue) ── */
function OperationalCard({ agent }) {
  const {
    agent_id,
    agent_type,
    status = 'IDLE',
    priority_weight = 1,
  } = agent;

  const type = agent_type ?? agentTypeFromId(agent_id);
  const meta = AGENT_ICONS[type] ?? { emoji: '🤖', color: '#94a3b8', label: type };
  const tag  = nodeTag(agent_id);
  const role = AGENT_ROLE[agent_id] ?? 'Operational Agent';

  const statusColor = {
    IDLE:       '#6b7280',
    ACTIVE:     '#22c55e',
    OVERLOADED: '#ef4444',
    OFFLINE:    '#374151',
  }[status] ?? '#6b7280';

  return (
    <div className="inv-card inv-card--op" style={{ '--accent': meta.color }}>
      <div className="inv-card-header">
        <div className="inv-card-agent">
          <span className="inv-card-emoji">{meta.emoji}</span>
          <div>
            <div className="inv-card-name">{meta.label}</div>
            <div className="inv-card-meta">
              <span className="inv-card-dot" style={{ background: statusColor }} />
              <span>{status}</span>
              <span className="inv-card-sep">·</span>
              <span style={{ color: meta.color }}>{tag}</span>
            </div>
          </div>
        </div>
        <div className="inv-card-weight" title="Priority weight">
          {priority_weight.toFixed(1)}×
        </div>
      </div>

      {/* Role description */}
      <div className="inv-op-role">
        <p className="inv-op-label">Function</p>
        <p className="inv-op-desc" style={{ color: meta.color }}>{role}</p>
      </div>

      {/* Status indicator */}
      <div className="inv-op-status-row">
        <span className="inv-op-status-dot" style={{ background: statusColor }} />
        <span className="inv-op-status-text" style={{ color: statusColor }}>
          {status === 'ACTIVE' ? 'Actively processing' : status === 'IDLE' ? 'Standing by' : status.toLowerCase()}
        </span>
      </div>
    </div>
  );
}

/* ── Preferred display order ─────────────────────────────────── */
const DISPLAY_ORDER = [
  'power_agent',
  'fire_agent',
  'police_agent',
  'hospital_agent',
  'ndrf_agent',
  'rescue_coordinator',
  'sensing_agent',
  'policy_agent',
  'xai_agent',
];

/* ── Main export ─────────────────────────────────────────────── */
export default function AgentInventory({ agents }) {
  const allAgentsList = Object.values(agents);

  // Sort by preferred order
  const sortedAgents = [...allAgentsList].sort((a, b) => {
    const ai = DISPLAY_ORDER.indexOf(a.agent_id);
    const bi = DISPLAY_ORDER.indexOf(b.agent_id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const resourceAgents    = sortedAgents.filter((a) => Object.keys(a.resource_pool ?? {}).length > 0);
  const operationalAgents = sortedAgents.filter((a) => Object.keys(a.resource_pool ?? {}).length === 0);

  const scrollRef = useRef(null);
  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });
  const [, forceRender] = useState(0);

  const onPointerDown = useCallback((e) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { dragging: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    forceRender(n => n + 1);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragState.current.dragging) return;
    e.preventDefault();
    const dx = e.clientX - dragState.current.startX;
    scrollRef.current.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.dragging = false;
    forceRender(n => n + 1);
  }, []);

  return (
    <div className="inv-panel">
      {/* Header */}
      <div className="inv-panel-header">
        <div className="flex items-center gap-3">
          <span className="inv-panel-title">Inventory</span>
          <span className="inv-panel-sub">{allAgentsList.length} agents</span>
          {resourceAgents.length > 0 && (
            <span className="inv-panel-sub text-[9px]">
              · {resourceAgents.length} with resources · {operationalAgents.length} operational
            </span>
          )}
        </div>
      </div>

      {/* Cards strip */}
      <div
        ref={scrollRef}
        className={`inv-strip ${dragState.current.dragging ? 'inv-strip--dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {allAgentsList.length === 0 ? (
          <p className="inv-empty">Connecting to agents…</p>
        ) : (
          <>
            {/* Resource agents first */}
            {resourceAgents.map((agent) => (
              <ResourceCard key={agent.agent_id} agent={agent} allAgents={agents} />
            ))}
            {/* Divider */}
            {operationalAgents.length > 0 && resourceAgents.length > 0 && (
              <div className="inv-divider" />
            )}
            {/* Operational agents */}
            {operationalAgents.map((agent) => (
              <OperationalCard key={agent.agent_id} agent={agent} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
