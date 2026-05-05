/**
 * MapLegend.jsx
 * Bottom-right always-visible map legend — zone priorities + infrastructure types
 * + interactive zone list with hover highlight and area coverage info.
 */

import { useState, useMemo } from 'react';
import { ZONE_COLOURS } from '../../constants/agentIcons';

/* ── Area estimate ────────────────────────────────────────────────────────────
 * Approximates each zone's "coverage area" using population density as a proxy:
 * denser zones → smaller geographic spread (urban core),
 * sparse zones → larger spread (suburban/rural).
 * Base radius (km) = lerp(1.2 → 3.5, inverse of density).
 * Area (km²) = π·r²
 */
function estimateAreaKm2(zone) {
  const d      = zone.population_density ?? 0.5;
  const radius = 3.5 - d * 2.3;          // 1.2 km (dense) → 3.5 km (sparse)
  return Math.PI * radius * radius;
}

/* ── Classification colour helper ────────────────────────────────────────── */
function clsColor(cls) {
  return ZONE_COLOURS[cls] ?? ZONE_COLOURS.DEFAULT;
}

const CLS_TEXT = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-orange-400',
  LOW:      'text-yellow-400',
  SAFE:     'text-green-400',
};

/* ── Sub-components ───────────────────────────────────────────────────────── */
function LegendDot({ color }) {
  return (
    <div
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function ZoneRow({ zone, isHovered, onEnter, onLeave }) {
  const area = useMemo(() => estimateAreaKm2(zone).toFixed(1), [zone]);
  const cls  = zone.classification ?? null;
  const col  = cls ? clsColor(cls) : '#6b7280';

  return (
    <div
      className="zone-legend-row"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '6px',
        padding:        '3px 4px',
        borderRadius:   '5px',
        cursor:         'default',
        transition:     'background 0.18s ease',
        background:     isHovered ? `${col}18` : 'transparent',
        borderLeft:     isHovered ? `2px solid ${col}` : '2px solid transparent',
        marginBottom:   '1px',
        position:       'relative',
      }}
    >
      {/* Colour dot */}
      <div
        style={{
          width:           8,
          height:          8,
          borderRadius:    '50%',
          background:      col,
          flexShrink:      0,
          boxShadow:       isHovered ? `0 0 6px ${col}` : 'none',
          transition:      'box-shadow 0.18s ease',
        }}
      />

      {/* Zone ID + name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#e5e7eb' }}>
          {zone.id}
        </span>
        <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 4 }}>
          {zone.name}
        </span>
      </div>

      {/* Area badge — only on hover */}
      <div
        style={{
          fontSize:     9,
          color:        col,
          fontWeight:   600,
          opacity:      isHovered ? 1 : 0,
          transform:    isHovered ? 'translateX(0)' : 'translateX(4px)',
          transition:   'opacity 0.18s ease, transform 0.18s ease',
          whiteSpace:   'nowrap',
        }}
      >
        {area} km²
      </div>

      {/* Classification pill — only when cls is known */}
      {cls && (
        <div
          style={{
            fontSize:     8,
            fontWeight:   700,
            color:        col,
            opacity:      isHovered ? 0 : 0.7,
            transition:   'opacity 0.15s ease',
            whiteSpace:   'nowrap',
          }}
        >
          {cls[0]}
        </div>
      )}
    </div>
  );
}

/* ── Main Legend ──────────────────────────────────────────────────────────── */
export default function MapLegend({ zones = [], onHoverZone }) {
  const [expandZones, setExpandZones] = useState(false);
  const [hoveredId,   setHoveredId]   = useState(null);

  function handleEnter(id) {
    setHoveredId(id);
    onHoverZone?.(id);
  }
  function handleLeave() {
    setHoveredId(null);
    onHoverZone?.(null);
  }

  return (
    <div
      className="absolute bottom-6 right-3 z-[1000] bg-panel-card/90 backdrop-blur border border-panel-border rounded-xl shadow-2xl"
      style={{ minWidth: 168, maxWidth: 210 }}
    >
      {/* ── Priority section ───────────────────────────────────────── */}
      <div style={{ padding: '10px 12px 6px' }}>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Legend</p>

        <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-1.5">Zone Priority</p>
        {[
          { label: 'CRITICAL', color: '#ef4444' },
          { label: 'HIGH',     color: '#f97316' },
          { label: 'LOW',      color: '#eab308' },
          { label: 'SAFE',     color: '#22c55e' },
          { label: 'No data',  color: '#6b7280' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2 mb-1">
            <LegendDot color={color} />
            <span className="text-[11px] text-gray-300">{label}</span>
          </div>
        ))}

        {/* Power grid indicator */}
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid #1e293b' }}>
          <LegendDot color="#60a5fa" />
          <span className="text-[11px] text-gray-300">Power grid ON</span>
        </div>
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-gray-600" style={{ background: 'transparent' }} />
          <span className="text-[11px] text-gray-500">Power grid OFF</span>
        </div>
      </div>

      {/* ── Infrastructure section ─────────────────────────────────── */}
      <div style={{ padding: '0 12px 8px', borderTop: '1px solid #1e293b' }}>
        <p className="text-[9px] text-gray-600 uppercase tracking-wide mt-2 mb-1.5">Infrastructure</p>
        {[
          { emoji: '🏥', label: 'Hospital',     color: '#f472b6' },
          { emoji: '🚒', label: 'Fire Station', color: '#fb923c' },
          { emoji: '🪖', label: 'NDRF Base',    color: '#4ade80' },
          { emoji: '🚁', label: 'Air Rescue',   color: '#38bdf8' },
          { emoji: '🚑', label: 'Land Rescue',  color: '#a78bfa' },
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

      {/* ── Zones section ─────────────────────────────────────────── */}
      {zones.length > 0 && (
        <div style={{ borderTop: '1px solid #1e293b', padding: '6px 8px 8px' }}>
          {/* Collapsible header */}
          <button
            onClick={() => setExpandZones((v) => !v)}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              width:          '100%',
              background:     'none',
              border:         'none',
              cursor:         'pointer',
              padding:        '2px 4px 4px',
              color:          '#6b7280',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Zones ({zones.length})
            </span>
            <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: expandZones ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▾
            </span>
          </button>

          {/* Zone rows */}
          {expandZones && (
            <div
              style={{
                maxHeight:  '220px',
                overflowY:  'auto',
                paddingRight: '2px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#334155 transparent',
              }}
            >
              <p style={{ fontSize: 8, color: '#475569', marginBottom: 4, paddingLeft: 4 }}>
                Hover a zone to highlight it on the map
              </p>
              {zones.map((z) => (
                <ZoneRow
                  key={z.id}
                  zone={z}
                  isHovered={hoveredId === z.id}
                  onEnter={() => handleEnter(z.id)}
                  onLeave={handleLeave}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
