/**
 * ZoneCircle.jsx
 * Zone marker on the map.
 * When an epicenter is active, color is determined by the zone center's
 * distance from that epicenter (red → orange → yellow → green).
 * Without an epicenter, falls back to the backend classification color.
 */

import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { ZONE_COLOURS } from '../../constants/agentIcons';

/* ── Distance-based color ─────────────────────────────────────────────
 * Thresholds chosen so the 12 Bangalore-area zones spread naturally:
 *   < 3 600 m  CRITICAL  (inside halo — Zone-D)
 *   < 7 000 m  HIGH      (inner ring — A, B, G, H, I)
 *   < 11 000 m LOW       (outer ring — C, E, J, K)
 *   ≥ 11 000 m SAFE      (far zones  — F, L)
 */
function metersApart(lat1, lon1, lat2, lon2) {
  const R     = 6371000;
  const dLat  = (lat2 - lat1) * (Math.PI / 180);
  const mLat  = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLon  = (lon2 - lon1) * (Math.PI / 180);
  const dlat_m = dLat * R;
  const dlon_m = dLon * R * Math.cos(mLat);
  return Math.sqrt(dlat_m * dlat_m + dlon_m * dlon_m);
}

function quakeClass(lat, lon, epicenter) {
  const d = metersApart(lat, lon, epicenter.lat, epicenter.lon);
  if (d < 3600)  return 'CRITICAL';
  if (d < 7000)  return 'HIGH';
  if (d < 11000) return 'LOW';
  return 'SAFE';
}

function classColour(cls) {
  return ZONE_COLOURS[cls] ?? ZONE_COLOURS.DEFAULT;
}

/* ── Popup sub-components ─────────────────────────────────────────── */
function Bar({ value, color }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded h-1">
        <div className="h-1 rounded transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

const CLS_COLOURS = {
  CRITICAL: 'bg-red-600',
  HIGH:     'bg-orange-500',
  LOW:      'bg-yellow-500',
  SAFE:     'bg-green-600',
};

/* ── Component ────────────────────────────────────────────────────── */
export default function ZoneCircle({ zone, epicenter, isHighlighted = false, isDimmed = false }) {
  const {
    id, name, lat, lon,
    population_density = 0.5,
    classification,
    severity_score,
    has_critical_infra,
    power_status,
    road_blocked,
  } = zone;

  // Distance-based classification overrides backend when earthquake is active
  const effectiveClass = epicenter ? quakeClass(lat, lon, epicenter) : classification;
  const color          = classColour(effectiveClass);
  const baseRadius     = Math.max(5, Math.min(9, (population_density ?? 0.5) * 10));
  const radius         = isHighlighted ? baseRadius + 4 : baseRadius;
  const isCritical     = effectiveClass === 'CRITICAL';

  // Highlight: brighter, heavier ring + glow effect via weight + opacity
  // Dimmed: subtle fade so the highlighted zone pops
  const fillOpacity = isDimmed
    ? 0.25
    : isHighlighted
      ? 1
      : isCritical ? 0.92 : 0.78;

  const strokeOpacity = isDimmed
    ? 0.2
    : isHighlighted
      ? 1
      : isCritical ? 1 : 0.6;

  const strokeWeight = isHighlighted ? 3 : isCritical ? 1.5 : 0.5;

  return (
    <>
      {/* Subtle glow ring rendered beneath the main circle on highlight */}
      {isHighlighted && (
        <CircleMarker
          center={[lat, lon]}
          radius={radius + 6}
          pathOptions={{
            color:       color,
            fillColor:   color,
            fillOpacity: 0.12,
            weight:      1,
            opacity:     0.5,
            dashArray:   '3 3',
          }}
          interactive={false}
        />
      )}
    <CircleMarker
      center={[lat, lon]}
      radius={radius}
      pathOptions={{
        color:       color,
        fillColor:   color,
        fillOpacity: fillOpacity,
        weight:      strokeWeight,
        opacity:     strokeOpacity,
      }}
    >
      <Tooltip sticky>
        <span className="font-semibold">{name}</span>
        {effectiveClass && (
          <span className="ml-2 text-xs opacity-75">({effectiveClass})</span>
        )}
      </Tooltip>

      <Popup minWidth={200} maxWidth={260}>
        <div className="p-3 space-y-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-white">{name}</p>
            <span className="text-[10px] text-gray-500">{id}</span>
          </div>

          {effectiveClass && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white ${CLS_COLOURS[effectiveClass] ?? 'bg-gray-600'}`}>
              {effectiveClass}
            </span>
          )}

          {severity_score != null && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Severity</p>
              <Bar value={severity_score} color={color} />
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-1">Population density</p>
            <Bar value={population_density} color="#60a5fa" />
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs pt-1">
            <span className="text-gray-500">Power</span>
            <span className={power_status ? 'text-green-400' : 'text-red-400'}>
              {power_status ? '⚡ ON' : '🔴 OFF'}
            </span>
            <span className="text-gray-500">Roads</span>
            <span className={road_blocked ? 'text-red-400' : 'text-green-400'}>
              {road_blocked ? '🚧 BLOCKED' : '✅ CLEAR'}
            </span>
            <span className="text-gray-500">Infra</span>
            <span className={has_critical_infra ? 'text-yellow-400' : 'text-gray-600'}>
              {has_critical_infra ? '🏛️ Yes' : 'No'}
            </span>
          </div>
        </div>
      </Popup>
    </CircleMarker>
    </>
  );
}
