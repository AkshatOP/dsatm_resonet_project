/**
 * EarthquakeHalo.jsx
 * Large semi-transparent red circle with dashed border drawn around the
 * epicenter once a simulation fires. Adapts size based on calamity type:
 *   - Earthquake: magnitude-based radius (~3.6 km for M7)
 *   - Fire:       tight circle from radius_km (~500m default)
 * Disappears when the system is reset (epicenter becomes null).
 */

import { Circle } from 'react-leaflet';

// Base radius in metres for earthquake — large enough to frame the epicenter cluster
const EQ_BASE_RADIUS_M = 3600;

export default function EarthquakeHalo({ epicenter }) {
  if (!epicenter) return null;

  const isFire = epicenter.calamity_type === 'FIRE';

  // Fire: fixed tight 400m circle — classification bands are (500, 500, 2500)
  //       so the halo visually frames the "only CRITICAL" zone.
  // Earthquake: scale by magnitude (mag 7 → 3600 m baseline)
  const radius = isFire
    ? 400
    : epicenter.magnitude
      ? Math.round((epicenter.magnitude / 7.0) * EQ_BASE_RADIUS_M)
      : EQ_BASE_RADIUS_M;

  // Fire halo is more opaque and glows tighter
  const mainFillOpacity = isFire ? 0.18 : 0.07;
  const glowExtra       = isFire ? 100  : 600;

  return (
    <>
      {/* Outer glow ring — slightly larger, very faint */}
      <Circle
        center={[epicenter.lat, epicenter.lon]}
        radius={radius + glowExtra}
        pathOptions={{
          stroke:      false,
          fillColor:   '#ef4444',
          fillOpacity: 0.04,
          interactive: false,
        }}
      />

      {/* Main halo — dashed red border, low fill */}
      <Circle
        center={[epicenter.lat, epicenter.lon]}
        radius={radius}
        pathOptions={{
          color:       '#ef4444',
          weight:      2,
          opacity:     0.70,
          dashArray:   '10 7',
          fillColor:   '#ef4444',
          fillOpacity: mainFillOpacity,
          interactive: false,
        }}
      />
    </>
  );
}

