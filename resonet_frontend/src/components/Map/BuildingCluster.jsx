/**
 * BuildingCluster.jsx
 * Dense scatter of tiny dots around a zone center simulating building density.
 * Dot layout is deterministic (seeded by zone ID) and stable across re-renders.
 *
 * Color logic (updated):
 *   ALL dots in a zone share the zone's own classification color,
 *   so the colored footprint on the map exactly matches its big ZoneCircle dot.
 *   Classification is computed the same way ZoneCircle.jsx does it (distance bands),
 *   supporting both earthquake and fire calamity types dynamically.
 *
 * 4-ring layout:
 *   Ring 1 (40%) 0.0003–0.0028°  tight urban core
 *   Ring 2 (30%) 0.003–0.008°    main built-up area
 *   Ring 3 (22%) 0.008–0.017°    outer fringe
 *   Ring 4  (8%) 0.017–0.027°    far outliers
 */

import { useMemo } from 'react';
import { CircleMarker } from 'react-leaflet';
import { ZONE_COLOURS } from '../../constants/agentIcons';

/* ── PRNG ───────────────────────────────────────────────────────── */
function strToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ── Distance helpers (mirrors ZoneCircle.jsx exactly) ──────────── */
// Earthquake: CRITICAL<3600m, HIGH<7000m, LOW<11000m, else SAFE
const EQ_BANDS_M   = [3_600, 7_000, 11_000];
// Fire: only epicenter CRITICAL, no HIGH, nearby LOW within 2500m
const FIRE_BANDS_M = [500, 500, 2_500];

function metersApart(lat1, lon1, lat2, lon2) {
  const R      = 6371000;
  const dLat   = (lat2 - lat1) * (Math.PI / 180);
  const mLat   = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLon   = (lon2 - lon1) * (Math.PI / 180);
  const dlat_m = dLat * R;
  const dlon_m = dLon * R * Math.cos(mLat);
  return Math.sqrt(dlat_m * dlat_m + dlon_m * dlon_m);
}

/**
 * Compute the classification for an entire zone given the epicenter.
 * Uses the zone's CENTER (not each dot's position) — so every dot in
 * the zone shares the same color as the big ZoneCircle.
 */
function zoneEffectiveClass(zoneLat, zoneLon, epicenter) {
  if (!epicenter) return null;   // no event — fall back to backend classification
  const d     = metersApart(zoneLat, zoneLon, epicenter.lat, epicenter.lon);
  const bands = epicenter.calamity_type === 'FIRE' ? FIRE_BANDS_M : EQ_BANDS_M;
  if (d < bands[0]) return 'CRITICAL';
  if (d < bands[1]) return 'HIGH';
  if (d < bands[2]) return 'LOW';
  return 'SAFE';
}

/* ── Dot layout builder ─────────────────────────────────────────── */
function buildDotLayout(lat, lon, density, zoneId) {
  const rand  = makePRNG(strToSeed(zoneId));
  const total = Math.round(density * 100 + 25); // 55–105 dots
  const dots  = [];

  for (let i = 0; i < total; i++) {
    const angle = rand() * Math.PI * 2;
    const tier  = rand();

    let dist;
    if (tier < 0.40) {
      dist = 0.0003 + rand() * 0.0025;
    } else if (tier < 0.70) {
      dist = 0.003  + rand() * 0.005;
    } else if (tier < 0.92) {
      dist = 0.008  + rand() * 0.009;
    } else {
      dist = 0.017  + rand() * 0.010;
    }

    dots.push({
      lat:     lat + Math.sin(angle) * dist,
      lon:     lon + Math.cos(angle) * dist * 1.12,
      radius:  1.0  + rand() * 2.2,
      opacity: 0.28 + rand() * 0.55,
    });
  }
  return dots;
}

/* ── Component ──────────────────────────────────────────────────── */
export default function BuildingCluster({ zone, epicenter }) {
  const { id, lat, lon, population_density = 0.5, classification } = zone;

  // Layout is stable — only recomputes if zone geometry changes
  const dots = useMemo(
    () => buildDotLayout(lat, lon, population_density, id),
    [id, lat, lon, population_density],
  );

  // Compute ONE color for the entire zone (same logic as ZoneCircle).
  // All dots in this zone use this color so their footprint is visually consistent.
  const effectiveClass = zoneEffectiveClass(lat, lon, epicenter);
  const zoneColor = ZONE_COLOURS[effectiveClass ?? classification] ?? ZONE_COLOURS.DEFAULT;

  return (
    <>
      {dots.map((d, i) => (
        <CircleMarker
          key={`${id}-b-${i}`}
          center={[d.lat, d.lon]}
          radius={d.radius}
          pathOptions={{
            stroke:      false,
            fillColor:   zoneColor,
            fillOpacity: d.opacity,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}
