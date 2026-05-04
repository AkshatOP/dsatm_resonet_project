/** Agent type → emoji icon and accent colour mapping. */

export const AGENT_ICONS = {
  power:              { emoji: '⚡', color: '#facc15', label: 'Power Grid' },
  hospital:           { emoji: '🏥', color: '#f472b6', label: 'Hospital'   },
  fire:               { emoji: '🚒', color: '#fb923c', label: 'Fire Dept'  },
  police:             { emoji: '🚔', color: '#60a5fa', label: 'Police'     },
  ndrf:               { emoji: '🪖', color: '#4ade80', label: 'NDRF'       },
  rescue_coordinator: { emoji: '🗺️', color: '#a78bfa', label: 'Rescue Coord' },
  sensing:            { emoji: '📡', color: '#38bdf8', label: 'Sensing'    },
  policy:             { emoji: '⚖️', color: '#e2e8f0', label: 'Policy'     },
  xai:                { emoji: '🤖', color: '#c084fc', label: 'XAI Agent'  },
};

/** Maps agent_id → agent_type by stripping the _agent suffix. */
export function agentTypeFromId(agentId) {
  // e.g. "hospital_agent" → "hospital", "rescue_coordinator" → "rescue_coordinator"
  const stripped = agentId.replace(/_agent$/, '');
  return stripped;
}

export const STATUS_COLOURS = {
  IDLE:       'bg-gray-500  text-gray-100',
  ACTIVE:     'bg-green-600 text-green-100',
  OVERLOADED: 'bg-red-600   text-red-100',
  OFFLINE:    'bg-gray-900  text-gray-400',
};

export const ZONE_COLOURS = {
  SAFE:     '#22c55e',
  LOW:      '#eab308',
  HIGH:     '#f97316',
  CRITICAL: '#ef4444',
  DEFAULT:  '#6b7280',
};
