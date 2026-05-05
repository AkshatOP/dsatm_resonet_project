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

/* ── Responder station registry ───────────────────────────────────────────── */
/**
 * Multiple physical stations per responder type, distributed N/S/E/W across
 * the city. MUST mirror config.RESPONDER_LOCATIONS on the backend.
 *
 * For every CRITICAL/HIGH destination we pick the *closest* station of each
 * type, then dispatch up to maxUnits units from there. If a single station is
 * the nearest for multiple destinations, units fan out to those zones.
 */
const RESPONDER_TYPES = [
  { id: 'hospital', label: 'Hospital',     emoji: '🏥', maxUnits: 2 },
  { id: 'ndrf',     label: 'NDRF Base',    emoji: '🪖', maxUnits: 2 },
  { id: 'fire',     label: 'Fire Station', emoji: '🚒', maxUnits: 2 },
  { id: 'police',   label: 'Police HQ',    emoji: '🚓', maxUnits: 2 },
];

const STATIONS = {
  hospital: [
    { id: 'HOSP-E', name: 'Hebbal Medical Centre',          lat: 13.030, lon: 77.660 },
    { id: 'HOSP-W', name: 'Magadi West Medical Centre',     lat: 12.985, lon: 77.460 },
    { id: 'HOSP-N', name: 'Yelahanka District Hospital',    lat: 13.055, lon: 77.530 },
  ],
  fire: [
    { id: 'FIRE-E', name: 'Banaswadi Fire Station',         lat: 12.908, lon: 77.640 },
    { id: 'FIRE-W', name: 'Magadi Road Fire Station',       lat: 12.968, lon: 77.450 },
    { id: 'FIRE-S', name: 'Kanakapura Fire Station',        lat: 12.870, lon: 77.560 },
  ],
  police: [
    { id: 'POL-C',  name: 'Central Police HQ',              lat: 12.971, lon: 77.594 },
    { id: 'POL-W',  name: 'West Bangalore Police HQ',       lat: 13.000, lon: 77.480 },
    { id: 'POL-S',  name: 'South Bangalore Police HQ',      lat: 12.890, lon: 77.530 },
  ],
  ndrf: [
    { id: 'NDRF-E', name: 'Hebbal NDRF Rapid Response',     lat: 12.985, lon: 77.662 },
    { id: 'NDRF-W', name: 'Nelamangala NDRF Base',          lat: 12.945, lon: 77.460 },
    { id: 'NDRF-N', name: 'Yelahanka NDRF Base',            lat: 13.060, lon: 77.580 },
  ],
};

/**
 * Find the closest station of a given responder type to a destination point.
 * Returns the station object — never null because each list has ≥ 1 entry.
 */
function nearestStation(respType, destLat, destLon) {
  const list = STATIONS[respType] ?? [];
  let best = list[0];
  let bestD = Infinity;
  for (const s of list) {
    const d = distM([s.lat, s.lon], [destLat, destLon]);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

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

/* ── Route key — must include station so the same responder type can dispatch
 *    from different stations to different destinations within the same plan. */
const rkey = (rid, stationId, destId) => `${rid}::${stationId}::${destId}`;

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

  // Compute current assignment plan — for each CRITICAL/HIGH destination zone,
  // dispatch one unit per responder type from that responder's *closest* station.
  // Worst zones are served first; remaining unit slots fan out round-robin so the
  // total number of routes per type stays bounded by maxUnits.
  const plan = useMemo(() => {
    if (!epicenter || !active) return [];

    const targets = getTargetZones(zones, epicenter);

    // Fallback: dispatch to the epicenter itself before any zone_update arrives
    const fallback = [{
      id: 'epicenter', name: 'Epicenter',
      lat: epicenter.lat, lon: epicenter.lon,
      classification: null, _eff: null,
    }];
    const pool = targets.length > 0 ? targets : fallback;

    const entries = [];

    RESPONDER_TYPES.forEach((resp, ri) => {
      // Each responder type sends at most `maxUnits` units, fanning out across
      // priority zones in worst-first order. Each unit ALWAYS deploys from the
      // station nearest to its assigned destination.
      for (let di = 0; di < resp.maxUnits; di++) {
        const zone = pool[di % pool.length];
        const clsForColor = zone._eff ?? zone.classification;
        const station = nearestStation(resp.id, zone.lat, zone.lon);

        const dest = {
          id:             zone.id,
          label:          zone.name || zone.label || zone.id,
          lat:            zone.lat,
          lon:            zone.lon,
          classification: clsForColor,
        };

        entries.push({
          key:         rkey(resp.id, station.id, dest.id),
          respId:      resp.id,
          label:       resp.label,
          emoji:       resp.emoji,
          unitIdx:     di,
          color:       clsToColor(clsForColor),
          origin:      { id: station.id, name: station.name, lat: station.lat, lon: station.lon },
          dest,
          startDelay:  ri * 700 + di * 400,
          fetchDelay:  ri * 600 + di * 300,
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
          unitIdx: entry.unitIdx, color: entry.color,
          destLabel: entry.dest.label,
          originName: entry.origin.name,
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
            originName:  entry.origin.name,
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

          {RESPONDER_TYPES.filter((r) => grouped[r.id]).map((r) => {
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
                      <span className="eta-dest-name">
                        {unit.originName ? ` ${unit.originName} →` : ''} {unit.destLabel}
                      </span>
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
