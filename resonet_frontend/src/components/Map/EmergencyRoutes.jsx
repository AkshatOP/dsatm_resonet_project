/**
 * EmergencyRoutes.jsx
 *
 * Fans responders out to CRITICAL/HIGH/SAFE zones.
 * Route color = destination zone classification:
 *   CRITICAL → #ef4444 red
 *   HIGH     → #f97316 orange
 *   LOW      → #eab308 yellow
 *   SAFE     → #22c55e green
 *   unknown  → #6b7280 grey (epicenter fallback)
 *
 * One AnimatedRoute per (responder, destination) pair — each path independent.
 * ETA panel: top-right, grouped by responder.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import AnimatedRoute from './AnimatedRoute';

/* ── Zone classification → path color ────────────────────────────────────── */
const CLS_COLOR = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  LOW: '#eab308',
  SAFE: '#22c55e',
  DEFAULT: '#6b7280',
};
function clsToColor(cls) { return CLS_COLOR[cls] ?? CLS_COLOR.DEFAULT; }

/* ── Distance-band classification (mirrors ZoneCircle.jsx exactly) ────────── */
// Earthquake: CRITICAL<3600m, HIGH<7000m, LOW<11000m
const EQ_BANDS_M  = [3_600, 7_000, 11_000];
// Fire: only epicenter is CRITICAL, HIGH band eliminated (0 width), nearby LOW
const FIRE_BANDS_M = [500, 500, 2_500];   // CRITICAL<500m | HIGH impossible | LOW<2500m

function distM(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * (Math.PI / 180);
  const mLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dLon = (b[1] - a[1]) * (Math.PI / 180);
  return Math.sqrt((dLat * R) ** 2 + (dLon * R * Math.cos(mLat)) ** 2);
}

function effectiveClass(zone, epicenter) {
  if (!epicenter || zone.lat == null || zone.lon == null) return zone.classification;
  const bands = epicenter.calamity_type === 'FIRE' ? FIRE_BANDS_M : EQ_BANDS_M;
  const d = distM([zone.lat, zone.lon], [epicenter.lat, epicenter.lon]);
  if (d < bands[0]) return 'CRITICAL';
  if (d < bands[1]) return 'HIGH';
  if (d < bands[2]) return 'LOW';
  return 'SAFE';
}

/* ── Responder config ─────────────────────────────────────────────────────── */
const RESPONDERS = [
  { id: 'hospital', label: 'Hospital', emoji: '🏥', maxUnits: 2, lat: 13.030, lon: 77.660 },
  { id: 'ndrf', label: 'NDRF Base', emoji: '🪖', maxUnits: 2, lat: 12.985, lon: 77.662 },
  { id: 'fire', label: 'Fire Station', emoji: '🚒', maxUnits: 2, lat: 12.908, lon: 77.640 },
  { id: 'police', label: 'Police HQ', emoji: '🚓', maxUnits: 2, lat: 12.971, lon: 77.594 },
];

/* ── OSRM helpers ─────────────────────────────────────────────────────────── */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function inDanger(pt, zones) {
  return zones.some((z) => distM(pt, [z.lat, z.lon]) < z.radiusM);
}

function tagSegments(coords, dangerZones) {
  if (!dangerZones?.length) return [{ points: coords, danger: false }];
  const segs = [];
  let cur = { points: [coords[0]], danger: inDanger(coords[0], dangerZones) };
  for (let i = 1; i < coords.length; i++) {
    const d = inDanger(coords[i], dangerZones);
    if (d === cur.danger) { cur.points.push(coords[i]); }
    else { cur.points.push(coords[i]); segs.push(cur); cur = { points: [coords[i]], danger: d }; }
  }
  segs.push(cur);
  return segs;
}

async function fetchRoute(origin, dest, dangerZones, signal) {
  const url = `${OSRM_BASE}/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&alternatives=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route');
  const leg = data.routes[0];
  const coords = leg.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  const etaMinutes = Math.round(leg.duration / 60);
  const distanceKm = (leg.distance / 1000).toFixed(1);
  const segments = tagSegments(coords, dangerZones);
  const hasDanger = segments.some((s) => s.danger);
  return { segments, etaMinutes, distanceKm, hasDanger };
}

/* ── Destination resolver ─────────────────────────────────────────────────── */
/**
 * Returns all CRITICAL + HIGH zones sorted worst-first.
 * Classification is computed by distance from epicenter (same as ZoneCircle.jsx),
 * ensuring the route targets always match what the map shows.
 */
function getTargetZones(zones, epicenter) {
  return zones
    .map((z) => ({ ...z, _eff: effectiveClass(z, epicenter) }))
    .filter((z) => ['CRITICAL', 'HIGH'].includes(z._eff) && z.lat && z.lon)
    .sort((a, b) => {
      if (a._eff !== b._eff) return a._eff === 'CRITICAL' ? -1 : 1;
      return (b.severity_score ?? 0) - (a.severity_score ?? 0);
    });
}

/* ── Route key ────────────────────────────────────────────────────────────── */
const rkey = (rid, destId) => `${rid}::${destId}`;

/* ── Component ────────────────────────────────────────────────────────────── */
/**
 * @param {object}        props.epicenter      — { lat, lon, magnitude } | null
 * @param {boolean}       props.active         — false on reset
 * @param {Array}         props.zones          — live zone array from App state
 * @param {Function}      props.onRouteReady   — called once per successful fetch:
 *                          { respId, label, emoji, unitIdx, destLabel,
 *                            etaMinutes, distanceKm, hasDanger }
 */
export default function EmergencyRoutes({ epicenter, active, zones = [], onRouteReady }) {
  // Flat map of routeKey → { route|null, loading, error, respId, destLabel, unitIdx, color }
  const [routeMap, setRouteMap] = useState({});
  const [replayKey, setReplayKey] = useState(0);
  const abortRef = useRef(null);
  const fetchedRef = useRef(new Set()); // tracks already-fetched keys to avoid re-fetching on every zone update

  // Danger zones — dynamic radius based on calamity type
  // Fire:       tight 500m circle (steep falloff)
  // Earthquake: magnitude-based radius (~3.6 km for M7)
  const dangerZones = useMemo(() => {
    if (!epicenter) return [];
    const isFire = epicenter.calamity_type === 'FIRE';
    const radiusM = isFire
      ? (epicenter.radius_km ?? 0.5) * 1000   // fire: default 500m
      : Math.round((epicenter.magnitude / 7.0) * 3600); // earthquake: scale by magnitude
    return [{ lat: epicenter.lat, lon: epicenter.lon, radiusM }];
  }, [epicenter]);

  // Compute current assignment plan — deal zones round-robin so each unit
  // goes to a DIFFERENT zone, spreading coverage across the disaster area.
  const plan = useMemo(() => {
    if (!epicenter || !active) return [];

    // Only CRITICAL and HIGH zones are valid targets — classified by distance (mirrors ZoneCircle)
    const targets = getTargetZones(zones, epicenter);

    // Fallback: epicenter itself if no zones classified yet (just triggered)
    const fallback = [{ id: 'epicenter', label: 'Epicenter',
                        lat: epicenter.lat, lon: epicenter.lon, classification: null, _eff: null }];
    const pool = targets.length > 0 ? targets : fallback;

    const entries = [];
    let poolIdx = 0;   // round-robin pointer across all units globally

    RESPONDERS.forEach((resp, ri) => {
      for (let di = 0; di < resp.maxUnits; di++) {
        const zone = pool[poolIdx % pool.length];
        poolIdx++;

        const clsForColor = zone._eff ?? zone.classification;
        const dest = {
          id:             zone.id,
          label:          zone.name || zone.label || zone.id,
          lat:            zone.lat,
          lon:            zone.lon,
          classification: clsForColor,
        };

        entries.push({
          key:        rkey(resp.id, dest.id),
          respId:     resp.id,
          label:      resp.label,
          emoji:      resp.emoji,
          unitIdx:    di,
          color:      clsToColor(clsForColor),
          origin:     { lat: resp.lat, lon: resp.lon },
          dest,
          startDelay: ri * 700 + di * 400,
          fetchDelay: ri * 600 + di * 300,
        });
      }
    });

    return entries;
  }, [epicenter, active, zones]);


  /* ── Fetch effect ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!epicenter || !active) {
      abortRef.current?.abort();
      setRouteMap({});
      fetchedRef.current.clear();
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // ── Prune stale routes ────────────────────────────────────────
    // If a zone was CRITICAL/HIGH when first fetched but has since been
    // reclassified (e.g. → SAFE), remove it from the map + fetchedRef
    // so the AnimatedRoute unmounts and no path renders to it.
    const currentKeys = new Set(plan.map((e) => e.key));
    setRouteMap((prev) => {
      const pruned = {};
      for (const [k, v] of Object.entries(prev)) {
        if (currentKeys.has(k)) pruned[k] = v;
      }
      return pruned;
    });
    for (const k of [...fetchedRef.current]) {
      if (!currentKeys.has(k)) fetchedRef.current.delete(k);
    }

    plan.forEach((entry) => {
      // Skip if we already fetched this exact (responder, dest) pair
      if (fetchedRef.current.has(entry.key)) return;
      fetchedRef.current.add(entry.key);

      // Mark loading
      setRouteMap((prev) => ({
        ...prev,
        [entry.key]: {
          ...(prev[entry.key] ?? {}), loading: true, error: null,
          respId: entry.respId, label: entry.label, emoji: entry.emoji,
          unitIdx: entry.unitIdx, color: entry.color, destLabel: entry.dest.label
        },
      }));

      const timer = setTimeout(async () => {
        try {
          const route = await fetchRoute(entry.origin, entry.dest, dangerZones, ctrl.signal);
          setRouteMap((prev) => ({
            ...prev,
            [entry.key]: { ...prev[entry.key], route, loading: false },
          }));
          // Notify App so it can emit a chat bubble + deduct inventory
          onRouteReady?.({
            respId:      entry.respId,
            label:       entry.label,
            emoji:       entry.emoji,
            unitIdx:     entry.unitIdx,
            destLabel:   entry.dest.label,
            destClass:   entry.dest.classification,
            etaMinutes:  route.etaMinutes,
            distanceKm:  route.distanceKm,
            hasDanger:   route.hasDanger,
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            setRouteMap((prev) => ({
              ...prev,
              [entry.key]: { ...prev[entry.key], loading: false, error: err.message },
            }));
          }
        }
      }, entry.fetchDelay);

      ctrl.signal.addEventListener('abort', () => clearTimeout(timer));
    });

    return () => ctrl.abort();
    // Re-run when the SET of dest IDs changes (zone reclassified)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(plan.map((e) => e.key)), epicenter?.lat, epicenter?.lon, active]);


  const handleReplay = useCallback(() => setReplayKey((k) => k + 1), []);

  /* ── Render ────────────────────────────────────────────────────── */
  const hasAny = Object.values(routeMap).some((e) => e.route || e.loading);

  // Group ETA panel rows by responder
  const grouped = useMemo(() => {
    const g = {};
    Object.entries(routeMap).forEach(([key, entry]) => {
      if (!g[entry.respId]) g[entry.respId] = { emoji: entry.emoji, label: entry.label, units: [] };
      g[entry.respId].units.push({ key, ...entry });
    });
    // Sort units within each group by unitIdx
    Object.values(g).forEach((grp) => grp.units.sort((a, b) => a.unitIdx - b.unitIdx));
    return g;
  }, [routeMap]);

  return (
    <>
      {/* ── Animated polylines (inside Leaflet canvas) ────────────── */}
      {plan.map((entry) => {
        const data = routeMap[entry.key];
        if (!data?.route) return null;
        return (
          <AnimatedRoute
            key={`${entry.key}-${replayKey}`}
            route={data.route}
            lineColor={entry.color}
            startDelay={entry.startDelay}
            active={active}
            replay={replayKey}
          />
        );
      })}

      {/* ── ETA panel — top-right ─────────────────────────────────── */}
      {hasAny && (
        <div className="emergency-routes-eta">
          <div className="eta-header">
            <span className="eta-title">🚨 Emergency Routes</span>
            <button className="eta-replay-btn" onClick={handleReplay} title="Replay all animations">
              ↺ Replay
            </button>
          </div>

          {RESPONDERS.filter((r) => grouped[r.id]).map((r) => {
            const grp = grouped[r.id];
            return (
              <div key={r.id} className="eta-responder-group">
                {/* Responder header */}
                <div className="eta-responder-header">
                  <span className="eta-emoji">{grp.emoji}</span>
                  <span className="eta-resp-label">{grp.label}</span>
                </div>

                {/* Unit sub-rows */}
                {grp.units.map((unit, i) => (
                  <div key={unit.key} className="eta-unit-row">
                    {/* Color swatch = line color for this unit */}
                    <span
                      className="eta-unit-swatch"
                      style={{ background: unit.color, boxShadow: `0 0 5px ${unit.color}80` }}
                    />
                    <span className="eta-unit-label">
                      Unit {i + 1}
                      <span className="eta-dest-name"> → {unit.destLabel}</span>
                    </span>
                    <span className="eta-right">
                      {unit.loading && <span className="eta-loading">…</span>}
                      {unit.error && <span className="eta-error" title={unit.error}>✗</span>}
                      {unit.route && (
                        <>
                          {unit.route.hasDanger && <span className="eta-danger" title="Passes through danger zone">⚠️</span>}
                          <span className="eta-km">{unit.route.distanceKm} km</span>
                          <span className="eta-time">{unit.route.etaMinutes} min</span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
