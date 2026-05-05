/**
 * useSimulation.js
 * Handles trigger and reset API calls.
 *
 * triggerEarthquake({ lat, lon, zone_id }) and triggerFire({ lat, lon, zone_id })
 * accept an optional epicenter — when omitted, the backend falls back to its
 * pre-seeded demo coordinates. Pass a zone's coordinates from a popup click to
 * place the disaster anywhere on the map.
 *
 * Returns { triggerEarthquake, triggerFire, resetSystem, isSimulating, lastEvent }
 */

import { useState, useCallback } from 'react';
import { ENDPOINTS } from '../constants/api';

async function postJson(url, body) {
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body && Object.keys(body).length > 0) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

export function useSimulation() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  const triggerEarthquake = useCallback(async (opts = {}) => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      const body = {};
      if (opts.lat     != null) body.lat     = opts.lat;
      if (opts.lon     != null) body.lon     = opts.lon;
      if (opts.zone_id != null) body.zone_id = opts.zone_id;
      const data = await postJson(ENDPOINTS.simulate, body);
      setLastEvent(data);
      console.log('[SIM] Triggered earthquake:', data);
      // Simulation done signal comes via WebSocket events.
      // We auto-clear the loading state after a generous timeout.
      setTimeout(() => setIsSimulating(false), 15000);
      return data;
    } catch (err) {
      console.error('[SIM] Trigger failed:', err);
      setIsSimulating(false);
    }
  }, [isSimulating]);

  const triggerFire = useCallback(async (opts = {}) => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      const body = {};
      if (opts.lat     != null) body.lat     = opts.lat;
      if (opts.lon     != null) body.lon     = opts.lon;
      if (opts.zone_id != null) body.zone_id = opts.zone_id;
      const data = await postJson(ENDPOINTS.simulateFire, body);
      setLastEvent(data);
      console.log('[SIM] Triggered fire:', data);
      setTimeout(() => setIsSimulating(false), 15000);
      return data;
    } catch (err) {
      console.error('[SIM] Fire trigger failed:', err);
      setIsSimulating(false);
    }
  }, [isSimulating]);

  const resetSystem = useCallback(async (onReset) => {
    try {
      const res  = await fetch(ENDPOINTS.reset, { method: 'POST' });
      const data = await res.json();
      console.log('[SIM] Reset:', data);
      setIsSimulating(false);
      setLastEvent(null);
      onReset?.();
      return data;
    } catch (err) {
      console.error('[SIM] Reset failed:', err);
    }
  }, []);

  return { triggerEarthquake, triggerFire, resetSystem, isSimulating, lastEvent };
}
