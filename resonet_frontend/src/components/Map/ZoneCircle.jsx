/**
 * ZoneCircle.jsx
 * Small dot marker for each zone — styled like image2 reference.
 * Radius = 5–8px (small, clustered). Color from classification.
 * Popup on click, tooltip on hover.
 */

import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { ZONE_COLOURS } from '../../constants/agentIcons';

function classColour(classification) {
  return ZONE_COLOURS[classification] ?? ZONE_COLOURS.DEFAULT;
}

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

export default function ZoneCircle({ zone }) {
  const {
    id, name, lat, lon,
    population_density = 0.5,
    classification,
    severity_score,
    has_critical_infra,
    power_status,
    road_blocked,
  } = zone;

  const color = classColour(classification);

  // Small dots — radius 5 to 9 based on density, like image2
  const radius = Math.max(5, Math.min(9, (population_density ?? 0.5) * 10));

  // Epicenter-style: CRITICAL dots get a subtle glow via higher opacity
  const isCritical = classification === 'CRITICAL';

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={radius}
      pathOptions={{
        color:       isCritical ? color : color,
        fillColor:   color,
        fillOpacity: isCritical ? 0.92 : 0.78,
        weight:      isCritical ? 1.5  : 0.5,
        opacity:     isCritical ? 1    : 0.6,
        className:   'zone-circle-path',
      }}
    >
      <Tooltip sticky>
        <span className="font-semibold">{name}</span>
        {classification && (
          <span className="ml-2 text-xs opacity-75">({classification})</span>
        )}
      </Tooltip>

      <Popup minWidth={200} maxWidth={260}>
        <div className="p-3 space-y-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-white">{name}</p>
            <span className="text-[10px] text-gray-500">{id}</span>
          </div>

          {classification && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white ${CLS_COLOURS[classification] ?? 'bg-gray-600'}`}>
              {classification}
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
  );
}
