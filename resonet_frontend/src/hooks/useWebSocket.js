/**
 * useWebSocket.js
 * Manages a persistent WebSocket connection to the DACRO backend.
 * Auto-reconnects every 3 seconds on disconnect.
 * Dispatches parsed events to caller-provided handler callbacks.
 */

import { useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../constants/api';

const RECONNECT_DELAY = 3000;

/**
 * @param {Object} handlers - { onZoneUpdate, onNegotiation, onXai, onAgentState, onDispatch }
 */
export function useWebSocket(handlers) {
  const wsRef       = useRef(null);
  const handlersRef = useRef(handlers);
  const timerRef    = useRef(null);
  const mountedRef  = useRef(true);

  // Keep handlers ref fresh without triggering re-connects
  useEffect(() => { handlersRef.current = handlers; });

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to', WS_URL);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const { event_type, payload, timestamp } = msg;
        const h = handlersRef.current;

        switch (event_type) {
          case 'zone_update':   h.onZoneUpdate?.(payload, timestamp);  break;
          case 'negotiation':   h.onNegotiation?.(payload, timestamp); break;
          case 'xai':           h.onXai?.(payload, timestamp);         break;
          case 'agent_state':   h.onAgentState?.(payload, timestamp);  break;
          case 'dispatch':      h.onDispatch?.(payload, timestamp);    break;
          default:
            console.log('[WS] Unknown event_type:', event_type, payload);
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected — reconnecting in', RECONNECT_DELAY, 'ms');
      if (mountedRef.current) {
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };
  }, []); // stable — uses refs internally

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
