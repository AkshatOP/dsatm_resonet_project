/**
 * DispatchLine.jsx
 * Draws LAND (solid polyline) or AERIAL (dashed arc) dispatch routes on the Leaflet map.
 * LAND: uses the path waypoints from the dispatch payload.
 * AERIAL: path is null; draws a curved arc from Zone-A (NDRF base) to target zone.
 */

import { Polyline, Tooltip } from 'react-leaflet';

/** NDRF base — Zone-A coordinates */
const NDRF_BASE = [12.9914, 77.5561];

/**
 * Compute intermediate arc points between two lat/lon positions.
 * Adds a "bend" by lifting a midpoint perpendicular to the great-circle path.
 */
function arcPoints(from, to, numPts = 20, arcHeight = 0.08) {
  const points = [];
  for (let i = 0; i <= numPts; i++) {
    const t   = i / numPts;
    const lat = from[0] + (to[0] - from[0]) * t;
    const lon = from[1] + (to[1] - from[1]) * t;
    // Parabolic lift: max at t=0.5
    const lift = arcHeight * Math.sin(Math.PI * t);
    // Offset lat to create the arc (simple vertical lift)
    points.push([lat + lift, lon]);
  }
  return points;
}

export default function DispatchLine({ zoneId, assignment }) {
  const { mode, eta_minutes, units_assigned, path } = assignment;

  let positions;
  if (mode === 'LAND' && path && path.length > 0) {
    positions = path.map((p) => [p.lat, p.lon]);
  } else {
    // AERIAL — path is null, draw arc from NDRF base
    const target = path && path.length > 0
      ? [path[path.length - 1].lat, path[path.length - 1].lon]
      : null;

    // We need the target zone lat/lon — passed via targetLatLon prop
    // Fallback: use NDRF_BASE to itself (will be overridden by prop)
    positions = arcPoints(
      NDRF_BASE,
      assignment._targetLatLon ?? NDRF_BASE,
    );
  }

  const label = `${zoneId}: ${mode} · ETA ${eta_minutes}min · ${units_assigned} units`;

  if (mode === 'LAND') {
    return (
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#93c5fd',
          weight: 3,
          opacity: 0.9,
          dashArray: null,
        }}
      >
        <Tooltip sticky>{label}</Tooltip>
      </Polyline>
    );
  }

  // AERIAL — dashed arc
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: '#fb923c',
        weight: 2,
        opacity: 0.85,
        dashArray: '8 5',
        lineCap: 'round',
      }}
    >
      <Tooltip sticky>{label}</Tooltip>
    </Polyline>
  );
}
