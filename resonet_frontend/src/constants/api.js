/** API and WebSocket URL constants — never inline these in components. */

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_URL   = import.meta.env.VITE_WS_URL ||  'ws://localhost:8000/ws';

export const ENDPOINTS = {
  health:       `${BASE_URL}/health`,
  zones:        `${BASE_URL}/zones`,
  state:        `${BASE_URL}/state`,
  decisions:    (limit = 20) => `${BASE_URL}/decisions?limit=${limit}`,
  simulate:     `${BASE_URL}/simulate/scenario/hospital-earthquake`,
  simulateFire: `${BASE_URL}/simulate/scenario/fire`,
  reset:        `${BASE_URL}/simulate/reset`,
  agentPrio:    (id) => `${BASE_URL}/agents/${id}/priority`,
};
