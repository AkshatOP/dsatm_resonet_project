/**
 * MapLegend.jsx
 * Bottom-right always-visible map legend — zone priorities + infrastructure types.
 */

export default function MapLegend() {
  return (
    <div
      className="absolute bottom-6 right-3 z-[1000] bg-panel-card/90 backdrop-blur border border-panel-border rounded-xl p-3.5 shadow-2xl"
      style={{ minWidth: 158 }}
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Legend</p>

      <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-1.5">Zone Priority</p>
      {[
        { label: 'CRITICAL', color: '#ef4444' },
        { label: 'HIGH',     color: '#f97316' },
        { label: 'LOW',      color: '#eab308' },
        { label: 'SAFE',     color: '#22c55e' },
        { label: 'No data',  color: '#6b7280' },
      ].map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-gray-300">{label}</span>
        </div>
      ))}

      <div className="border-t border-panel-border mt-2.5 pt-2.5">
        <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-1.5">Infrastructure</p>
        {[
          { emoji: '🏥', label: 'Hospital',       color: '#f472b6' },
          { emoji: '🚒', label: 'Fire Station',   color: '#fb923c' },
          { emoji: '🪖', label: 'NDRF Base',      color: '#4ade80' },
          { emoji: '🚁', label: 'Air Rescue',     color: '#38bdf8' },
          { emoji: '🚑', label: 'Land Rescue',    color: '#a78bfa' },
        ].map(({ emoji, label, color }) => (
          <div key={label} className="flex items-center gap-2 mb-1">
            <div
              className="w-4 h-4 rounded flex items-center justify-center text-[9px] shrink-0"
              style={{ background: '#0f172a', border: `1.5px solid ${color}` }}
            >
              {emoji}
            </div>
            <span className="text-[11px] text-gray-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
