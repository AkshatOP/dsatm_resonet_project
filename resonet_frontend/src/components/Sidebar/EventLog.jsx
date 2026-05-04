/**
 * EventLog.jsx
 * Scrolling live event log, newest at top, max 50 entries.
 * Displays zone_update, negotiation, xai, and dispatch events.
 */

import { useRef, useEffect } from 'react';

const TYPE_META = {
  NEGOTIATION: { label: 'NEGOTIATION', color: '#60a5fa', bg: 'bg-blue-950/60'   },
  XAI:         { label: 'XAI',         color: '#c084fc', bg: 'bg-purple-950/60' },
  ZONE:        { label: 'ZONE',         color: '#f97316', bg: 'bg-orange-950/60' },
  DISPATCH:    { label: 'DISPATCH',     color: '#4ade80', bg: 'bg-green-950/60'  },
};

function classIcon(cls) {
  return { CRITICAL: '🔴', HIGH: '🟠', LOW: '🟡', SAFE: '🟢' }[cls] ?? '⚪';
}

function LogEntry({ entry }) {
  const m = TYPE_META[entry.type] ?? TYPE_META.ZONE;
  return (
    <div className={`log-entry flex gap-2 p-2 rounded-lg text-xs border border-transparent hover:border-gray-700 ${m.bg}`}>
      <span className="text-gray-600 font-mono shrink-0 mt-0.5">{entry.time}</span>
      <span className="font-semibold shrink-0" style={{ color: m.color, minWidth: 80 }}>
        {m.label}
      </span>
      <span className="text-gray-300 leading-relaxed">{entry.text}</span>
    </div>
  );
}

export default function EventLog({ entries }) {
  const scrollRef = useRef(null);

  // Scroll to top when new entry arrives (newest at top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Live Event Log</p>
      <div
        ref={scrollRef}
        className="space-y-1 overflow-y-auto"
        style={{ maxHeight: 240 }}
      >
        {entries.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">Waiting for events…</p>
        ) : (
          entries.map((e) => <LogEntry key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}

/** Helper to build a log entry from a WebSocket event. */
export function buildLogEntry(type, text, timestamp) {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-IN', { hour12: false })
    : new Date().toLocaleTimeString('en-IN', { hour12: false });
  return { id: `${Date.now()}-${Math.random()}`, type, text, time };
}
