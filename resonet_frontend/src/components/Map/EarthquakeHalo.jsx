/**
 * EarthquakeHalo.jsx
 * Large semi-transparent red circle with dashed border drawn around the earthquake
 * epicenter once a simulation fires. Visually frames the impact zone without
 * obscuring the building-density dots already rendered inside it.
 * Disappears when the system is reset (epicenter becomes null).
 */

import { Circle } from 'react-leaflet';

// Base radius in metres — large enough to frame the epicenter cluster visually
const BASE_RADIUS_M = 3600;

export default function EarthquakeHalo({ epicenter }) {
  if (!epicenter) return null;

  // Optionally scale by magnitude if provided (mag 7 → 3600 m baseline)
  const radius = epicenter.magnitude
    ? Math.round((epicenter.magnitude / 7.0) * BASE_RADIUS_M)
    : BASE_RADIUS_M;

  return (
    <>
      {/* Outer glow ring — slightly larger, very faint */}
      <Circle
        center={[epicenter.lat, epicenter.lon]}
        radius={radius + 600}
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
          fillOpacity: 0.07,
          interactive: false,
        }}
      />
    </>
  );
}
