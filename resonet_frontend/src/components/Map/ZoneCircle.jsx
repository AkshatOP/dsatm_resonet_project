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
 * Earthquake thresholds (unchanged):
 *   < 3 600 m  CRITICAL  (epicenter zone)
 *   < 7 000 m  HIGH      (inner ring)
 *   < 11 000 m LOW       (outer ring)
 *   ≥ 11 000 m SAFE
 *
 * Fire thresholds (tight — only epicenter is CRITICAL, no HIGH):
 *   <   500 m  CRITICAL  (epicenter zone only)
 *   <   500 m  HIGH      (zero-width band → impossible)
 *   < 2 500 m  LOW       (immediately adjacent zones: B, A, H, C)
 *   ≥ 2 500 m  SAFE
 */
const EQ_BANDS_M   = [3_600, 7_000, 11_000];
const FIRE_BANDS_M = [500, 500, 2_500];   // no HIGH for fires

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
  const d     = metersApart(lat, lon, epicenter.lat, epicenter.lon);
  const bands = epicenter.calamity_type === 'FIRE' ? FIRE_BANDS_M : EQ_BANDS_M;
  if (d < bands[0]) return 'CRITICAL';
  if (d < bands[1]) return 'HIGH';
  if (d < bands[2]) return 'LOW';
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
export default function ZoneCircle({
  zone,
  epicenter,
  isHighlighted = false,
  isDimmed = false,
  onTriggerFire,
  onTriggerEarthquake,
  isSimulating = false,
}) {
  const {
    id, name, lat, lon,
    population_density = 0.5,
    classification,
    severity_score,
    has_critical_infra,
    power_status,
    road_blocked,
  } = zone;

  const handleFire = (e) => {
    e?.stopPropagation?.();
    onTriggerFire?.(lat, lon, id);
  };
  const handleEarthquake = (e) => {
    e?.stopPropagation?.();
    onTriggerEarthquake?.(lat, lon, id);
  };

  // Distance-based classification overrides backend when earthquake is active
  const effectiveClass = epicenter ? quakeClass(lat, lon, epicenter) : classification;
  const color          = classColour(effectiveClass);
  const baseRadius     = Math.max(5, Math.min(9, (population_density ?? 0.5) * 10));
  const radius         = baseRadius;   // glow ring handles size on highlight
  const isCritical     = effectiveClass === 'CRITICAL';

  // Highlight: no fill on main circle — just a clean stroke ring outline.
  // The outer dashed glow ring carries all the visual weight.
  // Dimmed: subtle fade so the highlighted zone pops.
  const fillOpacity = isDimmed
    ? 0.20
    : isHighlighted
      ? 0           // hollow — no fill when highlighted
      : isCritical ? 0.92 : 0.78;

  const strokeOpacity = isDimmed
    ? 0.15
    : isHighlighted
      ? 0.9
      : isCritical ? 1 : 0.6;

  const strokeWeight = isHighlighted ? 2 : isCritical ? 1.5 : 0.5;

  return (
    <>
      {/* Outer glow ring — the main highlight indicator */}
      {isHighlighted && (
        <CircleMarker
          center={[lat, lon]}
          radius={baseRadius + 8}
          pathOptions={{
            color:       color,
            fillColor:   color,
            fillOpacity: 0.10,
            weight:      1.5,
            opacity:     0.6,
            dashArray:   '4 4',
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

          {(onTriggerFire || onTriggerEarthquake) && (
            <div className="pt-2 mt-1 border-t border-white/10 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">
                Simulate calamity here
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {onTriggerFire && (
                  <button
                    type="button"
                    onClick={handleFire}
                    disabled={isSimulating}
                    className={`group relative flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 backdrop-blur-sm border ${
                      isSimulating
                        ? 'bg-orange-900/30 border-orange-900/40 text-orange-300/60 cursor-not-allowed'
                        : 'bg-gradient-to-br from-orange-500/90 to-red-600/90 border-orange-400/40 text-white hover:from-orange-400 hover:to-red-500 hover:border-orange-300 hover:shadow-[0_0_12px_rgba(251,146,60,0.5)] active:scale-95'
                    }`}
                  >
                    <span className="text-sm leading-none">🔥</span>
                    <span>Fire</span>
                  </button>
                )}
                {onTriggerEarthquake && (
                  <button
                    type="button"
                    onClick={handleEarthquake}
                    disabled={isSimulating}
                    className={`group relative flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 backdrop-blur-sm border ${
                      isSimulating
                        ? 'bg-red-900/30 border-red-900/40 text-red-300/60 cursor-not-allowed'
                        : 'bg-gradient-to-br from-red-600/90 to-rose-900/90 border-red-500/40 text-white hover:from-red-500 hover:to-rose-800 hover:border-red-400 hover:shadow-[0_0_12px_rgba(239,68,68,0.5)] active:scale-95'
                    }`}
                  >
                    <span className="text-sm leading-none">🌋</span>
                    <span>Earthquake</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
    </>
  );
}
