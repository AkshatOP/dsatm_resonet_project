/**
 * useOsrmRoute.js
 *
 * Fetches a driving route from the OSRM public demo API between two lat/lon points.
 * Returns the decoded polyline, ETA in minutes, and danger-zone intersection info.
 *
 * OSRM endpoint used:
 *   https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}
 *   ?overview=full&geometries=geojson&alternatives=true
 *
 * Danger-zone handling:
 *   Each point on the route is tested against the provided danger circles.
 *   If ANY segment falls inside a danger zone it is tagged so the renderer
 *   can colour it red instead of green/yellow.
 */

import { useState, useCallback, useRef } from 'react';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/* ── Geometry helpers ──────────────────────────────────────────────────────── */

/** Haversine distance in metres between two [lat, lon] points. */
function distM(a, b) {
  const R   = 6371000;
  const dLat = (b[0] - a[0]) * (Math.PI / 180);
  const mLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dLon = (b[1] - a[1]) * (Math.PI / 180);
  return Math.sqrt((dLat * R) ** 2 + (dLon * R * Math.cos(mLat)) ** 2);
}

/**
 * Returns true if the point [lat, lon] is inside any danger zone.
 * @param {[number,number]} pt
 * @param {Array<{lat,lon,radiusM}>} zones
 */
function inDangerZone(pt, zones) {
  return zones.some((z) => distM(pt, [z.lat, z.lon]) < z.radiusM);
}

/**
 * Split route coordinates into segments tagged safe/danger.
 * Each segment = { points: [[lat,lon],...], danger: bool }
 * Consecutive same-tag points are merged.
 */
function tagSegments(coords, dangerZones) {
  if (!dangerZones?.length) return [{ points: coords, danger: false }];

  const segments = [];
  let current = { points: [coords[0]], danger: inDangerZone(coords[0], dangerZones) };

  for (let i = 1; i < coords.length; i++) {
    const danger = inDangerZone(coords[i], dangerZones);
    if (danger === current.danger) {
      current.points.push(coords[i]);
    } else {
      // Add a shared junction point so polylines connect seamlessly
      current.points.push(coords[i]);
      segments.push(current);
      current = { points: [coords[i]], danger };
    }
  }
  segments.push(current);
  return segments;
}

/* ── Hook ──────────────────────────────────────────────────────────────────── */

/**
 * @param {Array<{lat,lon,radiusM}>} dangerZones  — circles to check against
 * @returns {{ fetchRoute, route, loading, error, reset }}
 *   route: { segments, etaMinutes, distanceKm, hasDanger, rawCoords }
 */
export function useOsrmRoute(dangerZones = []) {
  const [route,   setRoute]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(null);

  const fetchRoute = useCallback(async (origin, destination) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setRoute(null);

    try {
      const url =
        `${OSRM_BASE}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
        `?overview=full&geometries=geojson&alternatives=false`;

      const res  = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No route found');
      }

      const leg    = data.routes[0];
      const coords = leg.geometry.coordinates.map(([lon, lat]) => [lat, lon]); // GeoJSON → leaflet

      const etaMinutes  = Math.round(leg.duration / 60);
      const distanceKm  = (leg.distance / 1000).toFixed(1);
      const segments    = tagSegments(coords, dangerZones);
      const hasDanger   = segments.some((s) => s.danger);

      setRoute({ segments, etaMinutes, distanceKm, hasDanger, rawCoords: coords });
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dangerZones]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setRoute(null);
    setError(null);
    setLoading(false);
  }, []);

  return { fetchRoute, route, loading, error, reset };
}
