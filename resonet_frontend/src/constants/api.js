/** API and WebSocket URL constants — never inline these in components. */

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_URL   = import.meta.env.VITE_WS_URL ||  'ws://localhost:8000/ws';

// CARTO basemap tiles (dark style). CARTO now requires a key: set
// VITE_CARTO_API_KEY in .env (see .env.example). Without a key the tiles
// load but show an "API KEY REQUIRED" watermark.
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
export const MAP_TILE_URL = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_KEY}`
  : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

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
