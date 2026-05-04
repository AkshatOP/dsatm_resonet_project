/**
 * BuildingCluster.jsx
 * Dense scatter of tiny dots around a zone center simulating building density.
 * Dot layout is deterministic (seeded by zone ID) and stable across re-renders.
 *
 * Color logic:
 *   • Epicenter present → each DOT is colored by its own distance to the epicenter
 *     (dots physically inside the halo turn red, outer ring orange, etc.)
 *   • No epicenter → all dots use the zone's backend classification color
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

/* ── Distance color ─────────────────────────────────────────────── */
function metersApart(lat1, lon1, lat2, lon2) {
  const R     = 6371000;
  const dLat  = (lat2 - lat1) * (Math.PI / 180);
  const mLat  = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLon  = (lon2 - lon1) * (Math.PI / 180);
  const dlat_m = dLat * R;
  const dlon_m = dLon * R * Math.cos(mLat);
  return Math.sqrt(dlat_m * dlat_m + dlon_m * dlon_m);
}

// Same thresholds as ZoneCircle so dots and circles are always in sync
function quakeColourAt(lat, lon, epicenter) {
  const d = metersApart(lat, lon, epicenter.lat, epicenter.lon);
  if (d < 3600)  return ZONE_COLOURS.CRITICAL;
  if (d < 7000)  return ZONE_COLOURS.HIGH;
  if (d < 11000) return ZONE_COLOURS.LOW;
  return ZONE_COLOURS.SAFE;
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

  // Fallback color used when no earthquake is active
  const defaultColor = ZONE_COLOURS[classification] ?? ZONE_COLOURS.DEFAULT;

  return (
    <>
      {dots.map((d, i) => {
        // Each dot picks its own color based on its exact position vs epicenter
        const color = epicenter ? quakeColourAt(d.lat, d.lon, epicenter) : defaultColor;

        return (
          <CircleMarker
            key={`${id}-b-${i}`}
            center={[d.lat, d.lon]}
            radius={d.radius}
            pathOptions={{
              stroke:      false,
              fillColor:   color,
              fillOpacity: d.opacity,
              interactive: false,
            }}
          />
        );
      })}
    </>
  );
}
