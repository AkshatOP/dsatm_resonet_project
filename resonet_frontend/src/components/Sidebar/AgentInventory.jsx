/**
 * AgentInventory.jsx
 * Compact resource inventory panel showing live resource levels per agent.
 * Styled after the reference design: agent name + NODE tag, resource tiles with % bars.
 * Every metric tile has a hoverable ? tooltip explaining the metric.
 */

import { AGENT_ICONS, agentTypeFromId } from '../../constants/agentIcons';

/* ── Metric definitions ───────────────────────────────────────── */
const RESOURCE_TOOLTIPS = {
  power_units:  'Available power units (kW-equivalents) for distribution to affected zones.',
  beds:         'Unoccupied hospital beds ready for incoming patients.',
  personnel:    'Active emergency response personnel on duty.',
  water_tanks:  'Water tank units available for firefighting operations.',
  vehicles:     'Emergency vehicles available for deployment.',
  units:        'NDRF rapid-response units ready for field deployment.',
  drones:       'Aerial surveillance drones available for reconnaissance.',
  food_packs:   'Emergency food packages available for distribution.',
  medicines:    'Medical supply kits ready for dispatch.',
};

const LOAD_TOOLTIP   = 'Current operational load as a percentage of full capacity. Above 80% is critical.';
const WEIGHT_TOOLTIP = 'Priority weight assigned to this agent during resource negotiation auctions.';

/* ── NODE tag derivation (e.g. hospital_agent → HA-01) ─────────── */
function nodeTag(agentId) {
  const map = {
    hospital_agent:           'HA-01',
    power_agent:              'PW-01',
    fire_agent:               'FR-01',
    police_agent:             'PL-01',
    ndrf_agent:               'NF-01',
    rescue_coordinator:       'RC-01',
    sensing_agent:            'SE-01',
    policy_agent:             'PO-01',
    xai_agent:                'XA-01',
  };
  return map[agentId] ?? agentId.slice(0, 4).toUpperCase() + '-01';
}

/* ── Reusable tooltip wrapper ─────────────────────────────────── */
function TipWrap({ tip, children }) {
  return (
    <div className="relative group inline-flex items-start gap-0.5">
      {children}
      {/* ? badge */}
      <span className="text-[9px] text-gray-700 cursor-help leading-none mt-0.5 select-none group-hover:text-gray-400 transition-colors">
        ?
      </span>
      {/* Tooltip */}
      <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-gray-950 border border-gray-700 text-[11px] text-gray-200 px-3 py-2 rounded-lg shadow-2xl w-52 leading-relaxed">
          {tip}
        </div>
      </div>
    </div>
  );
}

/* ── Single resource tile ─────────────────────────────────────── */
function ResourceTile({ label, value, accentColor, isLow }) {
  const tip = RESOURCE_TOOLTIPS[label.toLowerCase().replace(' ', '_')] ?? `${label} resource level for this agent.`;
  const displayLabel = label.replace(/_/g, ' ').replace('units', 'u').toUpperCase();
  const isNum = typeof value === 'number';
  const isCritical = isLow;

  return (
    <div
      className={`flex flex-col gap-1 bg-panel-bg rounded-xl p-2.5 border transition-colors ${
        isCritical ? 'border-red-700/60' : 'border-panel-border'
      }`}
    >
      <TipWrap tip={tip}>
        <span className={`text-[10px] uppercase tracking-wide leading-none ${isCritical ? 'text-red-400' : 'text-gray-500'}`}>
          {displayLabel}
        </span>
      </TipWrap>
      <span
        className="text-sm font-bold tabular-nums leading-tight"
        style={{ color: isCritical ? '#ef4444' : accentColor }}
      >
        {isNum ? Math.round(value) : (value ?? '—')}
        {isCritical && <span className="text-red-400 ml-0.5">!</span>}
      </span>
    </div>
  );
}

/* ── Single agent inventory card ──────────────────────────────── */
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
  const isCritLoad = loadPct > 80;

  const statusDot = {
    IDLE:       'bg-gray-500',
    ACTIVE:     'bg-green-400',
    OVERLOADED: 'bg-red-400',
    OFFLINE:    'bg-gray-800',
  }[status] ?? 'bg-gray-500';

  const resources = Object.entries(resource_pool);

  return (
    <div className="border border-panel-border rounded-xl overflow-hidden bg-panel-card/40">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-card border-b border-panel-border">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji}</span>
          <div>
            <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide leading-none">
              {meta.label}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              <span className="text-[10px] text-gray-600">{status}</span>
            </div>
          </div>
        </div>
        <TipWrap tip={`Node identifier for ${agent_id} in the DACRO network.`}>
          <span className="text-[10px] font-mono font-semibold" style={{ color: meta.color }}>
            NODE: {tag}
          </span>
        </TipWrap>
      </div>

      {/* Resource grid */}
      {resources.length > 0 && (
        <div className="p-2 grid grid-cols-2 gap-1.5">
          {resources.slice(0, 4).map(([key, val]) => {
            const isLow = typeof val === 'number' && val < 20;
            return (
              <ResourceTile
                key={key}
                label={key}
                value={val}
                accentColor={meta.color}
                isLow={isLow}
              />
            );
          })}
        </div>
      )}

      {/* Load bar */}
      <div className="px-3 pb-2.5 pt-0.5">
        <div className="flex items-center justify-between mb-1">
          <TipWrap tip={LOAD_TOOLTIP}>
            <span className="text-[10px] text-gray-600 uppercase tracking-wide">Load</span>
          </TipWrap>
          <TipWrap tip={WEIGHT_TOOLTIP}>
            <span className="text-[10px] text-gray-600">
              priority <span className="text-gray-400">{priority_weight.toFixed(1)}×</span>
            </span>
          </TipWrap>
        </div>
        <div className="bg-panel-bg rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, loadPct)}%`,
              backgroundColor: isCritLoad ? '#ef4444' : meta.color,
            }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className={`text-[10px] tabular-nums ${isCritLoad ? 'text-red-400' : 'text-gray-600'}`}>
            {loadPct}%{isCritLoad && ' ⚠'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────── */
export default function AgentInventory({ agents }) {
  const agentList = Object.values(agents);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section header */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-t border-panel-border">
        <div>
          <p className="text-xs font-bold text-gray-200 uppercase tracking-widest">Inventory</p>
          <p className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-wide">Active agent resource levels</p>
        </div>
        <span className="text-[10px] text-gray-600">{agentList.length} agents</span>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
        {agentList.length === 0 ? (
          <p className="text-xs text-gray-600 italic text-center py-6">Connecting to agents…</p>
        ) : (
          agentList.map((agent) => (
            <AgentInventoryCard key={agent.agent_id} agent={agent} />
          ))
        )}
      </div>
    </div>
  );
}
