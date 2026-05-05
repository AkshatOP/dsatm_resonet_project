/**
 * AgentInventory.jsx
 * Bottom-panel inventory showing live resource levels per agent.
 * Uniform card sizes, clean layout, drag-to-scroll.
 */

import { useRef, useState, useCallback } from 'react';
import { AGENT_ICONS, agentTypeFromId } from '../../constants/agentIcons';

/* ── Friendly resource names ─────────────────────────────────── */
const RESOURCE_LABELS = {
  power_units: 'Power',
  beds:        'Beds',
  personnel:   'Personnel',
  water_tanks: 'Water',
  vehicles:    'Vehicles',
  units:       'Units',
  drones:      'Drones',
  food_packs:  'Food',
  medicines:   'Medicine',
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

/* ── Single agent inventory card ─────────────────────────────── */
function AgentInventoryCard({ agent }) {
  const {
    agent_id,
    agent_type,
    resource_pool = {},
    current_load  = 0,
    status        = 'IDLE',
    priority_weight = 1,
  } = agent;

  const type   = agent_type ?? agentTypeFromId(agent_id);
  const meta   = AGENT_ICONS[type] ?? { emoji: '🤖', color: '#94a3b8', label: type };
  const tag    = nodeTag(agent_id);
  const loadPct = Math.round(current_load * 100);
  const isCrit  = loadPct > 80;

  const resources = Object.entries(resource_pool);

  const statusColor = {
    IDLE:       '#6b7280',
    ACTIVE:     '#22c55e',
    OVERLOADED: '#ef4444',
    OFFLINE:    '#374151',
  }[status] ?? '#6b7280';

  return (
    <div
      className="inv-card"
      style={{ '--accent': meta.color }}
    >
      {/* ─ Header ─ */}
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

      {/* ─ Resources ─ */}
      {resources.length > 0 && (
        <div className="inv-card-resources">
          {resources.map(([key, val]) => {
            const isNum = typeof val === 'number';
            const isLow = isNum && val < 20;
            return (
              <div key={key} className={`inv-res ${isLow ? 'inv-res--low' : ''}`}>
                <span className="inv-res-label">{friendlyLabel(key)}</span>
                <span className="inv-res-val" style={{ color: isLow ? '#ef4444' : meta.color }}>
                  {isNum ? Math.round(val) : (val ?? '—')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ─ Load bar ─ */}
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

/* ── Agents to hide (no physical resources) ──────────────────── */
const HIDDEN_AGENTS = new Set([
  'rescue_coordinator',
  'sensing_agent',
  'policy_agent',
  'xai_agent',
]);

/* ── Main export ─────────────────────────────────────────────── */
export default function AgentInventory({ agents }) {
  const agentList = Object.values(agents).filter(
    (a) => !HIDDEN_AGENTS.has(a.agent_id) && Object.keys(a.resource_pool ?? {}).length > 0
  );
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
        <div>
          <span className="inv-panel-title">Agent Inventory</span>
          <span className="inv-panel-sub">{agentList.length} active</span>
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
        {agentList.length === 0 ? (
          <p className="inv-empty">Connecting to agents…</p>
        ) : (
          agentList.map((agent) => (
            <AgentInventoryCard key={agent.agent_id} agent={agent} />
          ))
        )}
      </div>
    </div>
  );
}
