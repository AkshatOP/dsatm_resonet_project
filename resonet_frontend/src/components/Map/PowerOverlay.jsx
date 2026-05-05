/**
 * PowerOverlay.jsx
 * Renders small glowing blue "city light" dots around every zone that has power.
 *
 * Power-loss logic (frontend-driven, ignores backend's broad power_status signal):
 *   • No epicenter active → all zones show dots (city fully lit)
 *   • Epicenter active    → zones within 7 000 m lose dots (CRITICAL + HIGH impact ring)
 *                           zones beyond 7 000 m keep dots (LOW + SAFE — grid stable)
 *
 * 7 000 m matches the HIGH/LOW boundary used by ZoneCircle and BuildingCluster,
 * so color bands and power-off areas are always perfectly in sync.
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

// Zones within this distance from the epicenter lose power
// (matches the HIGH zone outer boundary → CRITICAL + HIGH ring goes dark)
const POWER_LOSS_RADIUS_M = 7000;

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
    if (!epicenter) return zones;   // no earthquake → all zones powered

    return zones.filter((z) => {
      const d = metersApart(z.lat, z.lon, epicenter.lat, epicenter.lon);
      // Keep dots only for zones outside the power-loss radius
      return d >= POWER_LOSS_RADIUS_M;
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
