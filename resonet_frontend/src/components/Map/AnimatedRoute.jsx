/**
 * AnimatedRoute.jsx
 *
 * Progressive polyline animation for a single route (one unit, one destination).
 *   • lineColor  — hex color for this specific unit/route
 *   • startDelay — ms to wait before animation begins (creates stagger effect)
 *   • active     — teardown when false (system reset)
 *   • replay     — increment to replay
 *
 * Uses raw L.polyline via useMap() for incremental per-frame updates.
 * Safe segments glow in lineColor; danger segments pulse red.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap }                         from 'react-leaflet';
import L                                  from 'leaflet';

/* ── Easing ────────────────────────────────────────────────────────────────── */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const ANIMATION_MS = 5500;   // ms for full path draw — slow enough to follow visually
const DANGER_COLOR = '#ef4444';
const LINE_WEIGHT  = 3.5;
const GLOW_WEIGHT  = 9;

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function sliceCoords(coords, progress) {
  if (progress <= 0) return [];
  if (progress >= 1) return coords;
  const targetIdx = progress * (coords.length - 1);
  const floor     = Math.floor(targetIdx);
  const frac      = targetIdx - floor;
  const sliced    = coords.slice(0, floor + 1);
  if (frac > 0 && floor + 1 < coords.length) {
    const a = coords[floor];
    const b = coords[floor + 1];
    sliced.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
  }
  return sliced;
}

function segmentProgress(overall, start, end) {
  if (overall <= start) return 0;
  if (overall >= end)   return 1;
  return (overall - start) / (end - start);
}

/* ── Component ─────────────────────────────────────────────────────────────── */
/**
 * @param {object} props
 * @param {object} props.route      — { segments, etaMinutes, distanceKm, hasDanger }
 * @param {string} props.lineColor  — hex color for safe segments of this unit
 * @param {number} props.startDelay — ms delay before animation begins
 * @param {boolean} props.active    — false = teardown
 * @param {number}  props.replay    — increment to replay
 */
export default function AnimatedRoute({
  route,
  lineColor = '#39ff14',
  startDelay = 0,
  active = true,
  replay = 0,
}) {
  const map      = useMap();
  const layerRef = useRef(null);
  const rafRef   = useRef(null);
  const delayRef = useRef(null);

  /* ── Teardown ────────────────────────────────────────────────────── */
  const teardown = useCallback(() => {
    clearTimeout(delayRef.current);
    cancelAnimationFrame(rafRef.current);
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
  }, [map]);

  /* ── Animation effect ────────────────────────────────────────────── */
  useEffect(() => {
    if (!route || !active) { teardown(); return; }
    teardown();

    delayRef.current = setTimeout(() => {
      const group = L.layerGroup().addTo(map);
      layerRef.current = group;

      const { segments } = route;
      const totalPts = segments.reduce((s, seg) => s + seg.points.length, 0);
      let cursor = 0;
      const segMeta = segments.map((seg) => {
        const start = cursor / totalPts;
        cursor += seg.points.length;
        return { ...seg, start, end: cursor / totalPts };
      });

      // Create polyline pairs — entire path uses a single lineColor
      // (color is determined by destination zone classification, set by EmergencyRoutes)
      const polylines = segMeta.map(() => {
        const glow = L.polyline([], { color: lineColor, weight: GLOW_WEIGHT, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }).addTo(group);
        const line = L.polyline([], { color: lineColor, weight: LINE_WEIGHT, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }).addTo(group);
        return { line, glow };
      });

      // ── RAF loop ─────────────────────────────────────────────────
      // Phase 1: progressive draw over ANIMATION_MS
      // Phase 2: smooth sine-wave "breathing" pulse on the whole path
      //   — distinguishes departments visually after drawing is complete
      const PULSE_MS = 2800;   // one full breath cycle (in → dim → in)
      const t0 = performance.now();
      let pulseRef = null;

      // Phase 2: breathing pulse via sin wave on ALL segments
      function breathe(now) {
        const t        = ((now - t0 - ANIMATION_MS) % PULSE_MS) / PULSE_MS;
        // sin oscillates 0→1→0 over the cycle (starts bright)
        const sineVal  = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI - Math.PI / 2);
        const lineAlpha = 0.30 + 0.65 * sineVal;   // 0.30 → 0.95
        const glowAlpha = 0.04 + 0.22 * sineVal;   // 0.04 → 0.26

        polylines.forEach(({ line, glow, isDanger }) => {
          const col = isDanger ? DANGER_COLOR : lineColor;
          line.setStyle({ color: col, opacity: lineAlpha });
          glow.setStyle({ color: col, opacity: glowAlpha });
        });
        pulseRef = requestAnimationFrame(breathe);
      }

      // Phase 1: progressive draw
      function frame(now) {
        const raw      = Math.min((now - t0) / ANIMATION_MS, 1);
        const progress = easeInOut(raw);
        segMeta.forEach((seg, i) => {
          const sp  = segmentProgress(progress, seg.start, seg.end);
          const pts = sliceCoords(seg.points, sp);
          polylines[i].line.setLatLngs(pts);
          polylines[i].glow.setLatLngs(pts);
        });
        if (raw < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          // Draw done — start breathing
          pulseRef = requestAnimationFrame(breathe);
        }
      }
      rafRef.current = requestAnimationFrame(frame);

      // Store cleanup
      group._cleanup = () => {
        cancelAnimationFrame(rafRef.current);
        if (pulseRef) cancelAnimationFrame(pulseRef);
      };
    }, startDelay);

    return () => {
      if (layerRef.current?._cleanup) layerRef.current._cleanup();
      teardown();
    };
  }, [route, active, replay, lineColor, startDelay, map, teardown]);

  useEffect(() => { if (!active) teardown(); }, [active, teardown]);

  return null;
}
