/**
 * PowerOverlay.jsx
 * Renders small glowing blue "city light" dots around every zone that has power.
 *
 * Power-loss logic (calamity-type aware, matches classification bands):
 *   • No epicenter active   → all zones show dots (city fully lit)
 *   • EARTHQUAKE epicenter  → zones within 7 000 m lose dots (CRITICAL + HIGH ring goes dark)
 *   • FIRE epicenter        → zones within 500 m lose dots (only the epicenter zone goes dark)
 *
 * Radius values match EQ_BANDS_M[1] and FIRE_BANDS_M[0] used by ZoneCircle/BuildingCluster
 * so color bands, power-off areas, and classification are always perfectly in sync.
 *
 * Dot positions are seeded by zone ID — stable across re-renders.
 * Non-interactive (no mouse events).
 */

import { useMemo } from 'react';
import { CircleMarker } from 'react-leaflet';

/* ── PRNG ─────────────────────────────────────────────────────── */
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

/* ── Distance helper (same formula as ZoneCircle / BuildingCluster) ── */
function metersApart(lat1, lon1, lat2, lon2) {
  const R     = 6371000;
  const dLat  = (lat2 - lat1) * (Math.PI / 180);
  const mLat  = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLon  = (lon2 - lon1) * (Math.PI / 180);
  return Math.sqrt(
    (dLat * R) ** 2 + (dLon * R * Math.cos(mLat)) ** 2,
  );
}

// Power-loss radii — must match classification band boundaries:
// Earthquake: HIGH outer edge = 7 000 m  → CRITICAL + HIGH ring goes dark
// Fire:       CRITICAL edge   =   500 m  → only epicenter zone goes dark
const EQ_POWER_LOSS_M   = 7_000;
const FIRE_POWER_LOSS_M =   500;

/* ── Dot layout ───────────────────────────────────────────────── */
function buildPowerDots(lat, lon, density, zoneId) {
  const rand  = makePRNG(strToSeed(zoneId + '\x00pw'));
  const count = Math.round(density * 8 + 4);  // 5–10 dots
  const dots  = [];

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist  = 0.0006 + rand() * 0.0045;
    dots.push({
      lat: lat + Math.sin(angle) * dist,
      lon: lon + Math.cos(angle) * dist * 1.12,
      r:   1.8 + rand() * 1.4,
      op:  0.60 + rand() * 0.30,
    });
  }
  return dots;
}

/* ── Single-zone dots ─────────────────────────────────────────── */
function PowerZoneDots({ zone }) {
  const { id, lat, lon, population_density = 0.5 } = zone;
  const dots = useMemo(
    () => buildPowerDots(lat, lon, population_density, id),
    [id, lat, lon, population_density],
  );

  return (
    <>
      {dots.map((d, i) => (
        <CircleMarker
          key={`${id}-pw-${i}`}
          center={[d.lat, d.lon]}
          radius={d.r}
          pathOptions={{
            stroke:      false,
            fillColor:   '#60a5fa',
            fillOpacity: d.op,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}

/* ── Overlay ──────────────────────────────────────────────────── */
export default function PowerOverlay({ zones, epicenter }) {
  const poweredZones = useMemo(() => {
    if (!epicenter) return zones;   // no event → all zones powered

    // Choose radius based on calamity type
    const lossRadius = epicenter.calamity_type === 'FIRE'
      ? FIRE_POWER_LOSS_M   // 500 m: only the epicenter zone loses power
      : EQ_POWER_LOSS_M;    // 7 000 m: entire CRITICAL+HIGH ring goes dark

    return zones.filter((z) => {
      const d = metersApart(z.lat, z.lon, epicenter.lat, epicenter.lon);
      return d >= lossRadius;   // keep dots only outside the loss radius
    });
  }, [zones, epicenter]);

  return (
    <>
      {poweredZones.map((zone) => (
        <PowerZoneDots key={zone.id} zone={zone} />
      ))}
    </>
  );
}
