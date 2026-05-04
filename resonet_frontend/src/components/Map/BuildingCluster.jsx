/**
 * BuildingCluster.jsx
 * Renders a dense scatter of tiny dots around a zone center — simulating
 * building density. Count and spread scale with population_density.
 * Positions are deterministic (seeded by zone ID) so they never shift on re-render.
 * Colors track zone classification. Non-interactive.
 *
 * 4-ring layout:
 *   Ring 1 (40%) — tight urban core      0.0003–0.0028°
 *   Ring 2 (30%) — main built-up area    0.003–0.008°
 *   Ring 3 (22%) — outer fringe          0.008–0.017°
 *   Ring 4  (8%) — far outliers          0.017–0.027°
 */

import { useMemo } from 'react';
import { CircleMarker } from 'react-leaflet';
import { ZONE_COLOURS } from '../../constants/agentIcons';

// FNV-1a string → u32 seed
function strToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// LCG PRNG — same seed always yields same sequence
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildDotLayout(lat, lon, density, zoneId) {
  const rand  = makePRNG(strToSeed(zoneId));
  // 55–105 dots per zone — scales linearly with density
  const total = Math.round(density * 100 + 25);
  const dots  = [];

  for (let i = 0; i < total; i++) {
    const angle = rand() * Math.PI * 2;
    const tier  = rand();

    let dist;
    if (tier < 0.40) {
      // Ring 1 — tight urban core
      dist = 0.0003 + rand() * 0.0025;
    } else if (tier < 0.70) {
      // Ring 2 — main built-up area
      dist = 0.003  + rand() * 0.005;
    } else if (tier < 0.92) {
      // Ring 3 — outer fringe / suburbs
      dist = 0.008  + rand() * 0.009;
    } else {
      // Ring 4 — far outliers (sparse)
      dist = 0.017  + rand() * 0.010;
    }

    dots.push({
      lat:     lat + Math.sin(angle) * dist,
      // slight lon stretch to compensate cos(lat) ≈ 0.975 at 13°N
      lon:     lon + Math.cos(angle) * dist * 1.12,
      radius:  1.0  + rand() * 2.2,   // 1.0–3.2 px
      opacity: 0.28 + rand() * 0.55,  // 0.28–0.83
    });
  }
  return dots;
}

export default function BuildingCluster({ zone }) {
  const { id, lat, lon, population_density = 0.5, classification } = zone;
  const color = ZONE_COLOURS[classification] ?? ZONE_COLOURS.DEFAULT;

  // Recompute only when geographic / density props change — not on color change
  const dots = useMemo(
    () => buildDotLayout(lat, lon, population_density, id),
    [id, lat, lon, population_density],
  );

  return (
    <>
      {dots.map((d, i) => (
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
      ))}
    </>
  );
}
