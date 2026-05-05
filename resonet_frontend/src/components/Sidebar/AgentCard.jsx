/**
 * AgentCard.jsx
 * Displays the status of a single ResoNet agent.
 * Updated in real-time via agent_state WebSocket events.
 */

import { AGENT_ICONS, STATUS_COLOURS, agentTypeFromId } from '../../constants/agentIcons';

function LoadBar({ load, color }) {
  const pct = Math.round((load ?? 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color ?? '#60a5fa' }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function ResourcePill({ label, value }) {
  return (
    <div className="flex flex-col items-center bg-gray-800/60 rounded-lg px-2 py-1.5 min-w-[52px]">
      <span className="text-xs text-gray-500 leading-none">{label}</span>
      <span className="text-sm font-semibold text-gray-200 tabular-nums">{value ?? '—'}</span>
    </div>
  );
}

export default function AgentCard({ agent }) {
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
  const statCls = STATUS_COLOURS[status] ?? STATUS_COLOURS.IDLE;

  // Pick top 3 resources to show as pills
  const resources = Object.entries(resource_pool).slice(0, 3);

  return (
    <div className="bg-panel-card border border-panel-border rounded-xl p-3 space-y-2 transition-all duration-300 hover:border-gray-600">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <div>
            <p className="text-xs font-semibold text-gray-200 leading-tight">{agent_id}</p>
            <p className="text-xs text-gray-500">{meta.label}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statCls}`}>
            {status}
          </span>
          <span className="text-xs text-gray-600">w={priority_weight.toFixed(1)}</span>
        </div>
      </div>

      {/* Load bar */}
      <LoadBar load={current_load} color={meta.color} />

      {/* Resource pills */}
      {resources.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {resources.map(([key, val]) => (
            <ResourcePill
              key={key}
              label={key.replace(/_/g, ' ').replace('units', 'u')}
              value={typeof val === 'number' ? Math.round(val) : val}
            />
          ))}
        </div>
      )}
    </div>
  );
}
