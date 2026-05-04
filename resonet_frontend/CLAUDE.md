# DACRO Frontend — Claude Code Instructions

## Project Identity
DACRO: Decentralised Autonomous Crisis Resource Orchestrator
This is the **frontend** React dashboard that visualises real-time crisis response data from the DACRO backend.

## Mandate
Build a stunning, real-time crisis command-centre UI in React 18 + Vite + Leaflet + Tailwind.
Every decision must prioritize: working demo > architectural perfection.
The backend is already running at http://localhost:8000 — do NOT touch it.

## Stack
- React 18 + Vite
- Leaflet + react-leaflet (map)
- Tailwind CSS v3 (dark theme)
- No Redux — useState + useEffect + custom hooks only
- WebSocket: native browser WebSocket API (wrapped in useWebSocket.js)

## Code Rules
1. Every component file starts with a JSDoc comment explaining what it does.
2. Custom hooks live in src/hooks/ and are prefixed with "use".
3. All API base URLs and WS URLs live in src/constants/api.js — never inline them.
4. All agent icons and colour maps live in src/constants/agentIcons.js.
5. Zone colour must use CSS transitions (300ms ease) — never instant swap.
6. WebSocket must auto-reconnect every 3 seconds on disconnect.
7. On reset: clear zone colours to grey, clear routing lines, clear negotiation feed.
8. Decision-to-XAI matching uses a Map<decision_id, {...}> — never lose an XAI event.

## File Update Discipline
After completing each task (component, hook, bug fix, refactor), update:
- `Context.md` — append to Build Log: what was built, key decisions, issues found
- `CLAUDE.md` — update if any stack/rules/folder structure changed

THIS IS MANDATORY. Do it after every single prompt without being asked.

## Folder Structure
```
resonet_frontend/
├── CLAUDE.md              ← this file
├── Context.md             ← living build log
├── index.html
├── vite.config.js
├── tailwind.config.js
└── src/
    ├── App.jsx
    ├── index.css
    ├── constants/
    │   ├── api.js         ← BASE_URL, WS_URL
    │   └── agentIcons.js  ← agent_type → emoji + colour
    ├── hooks/
    │   ├── useWebSocket.js
    │   └── useSimulation.js
    └── components/
        ├── Map/
        │   ├── CityMap.jsx
        │   ├── ZoneCircle.jsx
        │   └── DispatchLine.jsx
        ├── Sidebar/
        │   ├── Controls.jsx
        │   ├── GiniMeter.jsx
        │   ├── AgentCard.jsx
        │   └── EventLog.jsx
        └── BottomPanel/
            └── XAIPanel.jsx
```
