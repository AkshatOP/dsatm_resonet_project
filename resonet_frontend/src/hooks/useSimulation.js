/**
 * useSimulation.js
 * Handles trigger and reset API calls.
 * Returns { triggerEarthquake, resetSystem, isSimulating }
 */

import { useState, useCallback } from 'react';
import { ENDPOINTS } from '../constants/api';

export function useSimulation() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  const triggerEarthquake = useCallback(async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      const res  = await fetch(ENDPOINTS.simulate, { method: 'POST' });
      const data = await res.json();
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

  return { triggerEarthquake, resetSystem, isSimulating, lastEvent };
}
