/**
 * AgentChat.jsx
 * Chat-style agent communication feed.
 *
 * Message types:
 *   request    → agent asking for resources
 *   award      → winning bidder responding
 *   xai        → XAI explanation bot
 *   zone_group → grouped zone status alert with per-zone stagger animation
 *   dispatch   → NDRF deployment announcement
 *
 * Bubble design matches reference: compact card, emoji avatar, agent name + time on top row.
 */

import { useRef, useEffect } from 'react';
import { AGENT_ICONS } from '../../constants/agentIcons';

/* ── Agent meta lookup ────────────────────────────────────────── */
function agentMeta(agentId) {
  if (!agentId) return { emoji: '🤖', color: '#94a3b8', label: 'Agent' };
  const stripped = agentId.replace(/_agent$/, '');
  const found = AGENT_ICONS[stripped] ?? AGENT_ICONS[agentId];
  if (found) return found;
  const extras = {
    zone_monitor: { emoji: '🌍', color: '#f97316', label: 'Zone Monitor' },
    ndrf_dispatch:{ emoji: '🪖', color: '#4ade80', label: 'NDRF'        },
    system:       { emoji: '⚙️', color: '#94a3b8', label: 'System'      },
  };
  return extras[agentId] ?? { emoji: '🤖', color: '#94a3b8', label: agentId };
}

/* ── Relative timestamp ───────────────────────────────────────── */
function relTime(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - new Date(date)) / 1000);
  if (s < 5)   return 'Just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600)return `${Math.floor(s / 60)}m ago`;
  return new Date(date).toLocaleTimeString('en-IN', { hour12: false });
}

/* ── Classification colours ───────────────────────────────────── */
const CLS_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', LOW: '#eab308', SAFE: '#22c55e' };
const CLS_ICON  = { CRITICAL: '🔴', HIGH: '🟠', LOW: '🟡', SAFE: '🟢' };

/* ── Badge pill ───────────────────────────────────────────────── */
const BADGE_CLS = {
  AWARDED: 'bg-green-800/70 text-green-300',
  AERIAL:  'bg-sky-800/70   text-sky-300',
  LAND:    'bg-blue-800/70  text-blue-300',
};
function Badge({ label }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${BADGE_CLS[label] ?? 'bg-gray-700 text-gray-300'}`}>
      {label}
    </span>
  );
}

/* ── Standard chat bubble (request / award / xai / dispatch) ──── */
function ChatBubble({ msg }) {
  const meta = agentMeta(msg.agentId);

  const leftAccent = {
    request:  '#60a5fa',
    award:    '#4ade80',
    xai:      '#c084fc',
    dispatch: '#38bdf8',
  }[msg.type] ?? '#4b5563';

  return (
    <div
      className="animate-fadein rounded-xl overflow-hidden border border-panel-border bg-panel-card"
      style={{ borderLeftColor: leftAccent, borderLeftWidth: 2 }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: meta.color + '22' }}
        >
          {meta.emoji}
        </div>
        <span className="text-xs font-semibold flex-1 truncate" style={{ color: meta.color }}>
          {meta.label}
        </span>
        {msg.badge && <Badge label={msg.badge} />}
        <span className="text-[10px] text-gray-600 shrink-0">{relTime(msg.time)}</span>
      </div>

      {/* Body */}
      <div className="px-3 pb-2.5 space-y-1">
        <p className="text-xs text-gray-200 leading-relaxed">{msg.text}</p>
        {msg.subtext && (
          <p className="text-[11px] text-gray-500 italic leading-relaxed">{msg.subtext}</p>
        )}
      </div>
    </div>
  );
}

/* ── Zone group bubble — staggered per-zone animation ─────────── */
function ZoneGroupBubble({ msg }) {
  const { groups } = msg;
  const meta = agentMeta('zone_monitor');

  // Build a flat running index for stagger delays across all zone names
  let lineIdx = 0;

  return (
    <div
      className="animate-fadein rounded-xl overflow-hidden border border-panel-border bg-panel-card"
      style={{ borderLeftColor: '#f97316', borderLeftWidth: 2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-sm" style={{ backgroundColor: '#f9731622' }}>
          🌍
        </div>
        <span className="text-xs font-semibold flex-1" style={{ color: meta.color }}>Zone Monitor</span>
        <span className="text-[10px] text-gray-600">{relTime(msg.time)}</span>
      </div>

      {/* Groups */}
      <div className="px-3 pb-3 space-y-3">
        {groups.map(({ cls, zones }) => {
          // Build condition string from union of zone attributes
          const anyPowerLost    = zones.some((z) => !z.power_status);
          const anyRoadsBlocked = zones.some((z) => z.road_blocked);
          const anyCritInfra    = zones.some((z) => z.has_critical_infra);
          const conditions = [
            anyPowerLost    && 'power lost',
            anyRoadsBlocked && 'roads blocked',
            anyCritInfra    && 'critical infrastructure',
          ].filter(Boolean);

          return (
            <div key={cls}>
              {/* Classification label + conditions */}
              <p className="text-[11px] text-gray-400 leading-relaxed mb-1">
                Zone found{' '}
                <span className="font-semibold" style={{ color: CLS_COLOR[cls] }}>
                  {CLS_ICON[cls]} {cls}
                </span>
                {conditions.length > 0 && (
                  <span className="text-gray-500"> ({conditions.join(' · ')})</span>
                )}
                {':'}
              </p>

              {/* Zone names — each animates in with staggered delay */}
              {zones.map((z) => {
                const delay = `${0.1 + (lineIdx++) * 0.22}s`;
                return (
                  <p
                    key={z.zone_id}
                    className="zone-line text-xs font-semibold pl-3 py-0.5"
                    style={{
                      color: CLS_COLOR[cls],
                      animationDelay: delay,
                    }}
                  >
                    › {z.zone_id}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main AgentChat component ─────────────────────────────────── */
export default function AgentChat({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 status-pulse" />
          <div>
            <p className="text-[11px] font-bold text-gray-200 uppercase tracking-widest">Agent Network</p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Real-time node comms</p>
          </div>
        </div>
        <span className="text-[10px] text-gray-700">{messages.length}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1.5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <span className="text-2xl mb-2">📡</span>
            <p className="text-[11px] text-gray-600">Listening for node broadcasts…</p>
            <p className="text-[10px] text-gray-700 mt-1">Trigger an earthquake to start</p>
          </div>
        ) : (
          messages.map((msg) =>
            msg.type === 'zone_group'
              ? <ZoneGroupBubble key={msg.id} msg={msg} />
              : <ChatBubble key={msg.id} msg={msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Decorative input */}
      <div className="shrink-0 px-2 pb-2">
        <div className="flex items-center gap-2 bg-panel-card border border-panel-border rounded-lg px-3 py-1.5">
          <span className="text-[10px] text-gray-700 flex-1 italic">Listening for node broadcasts…</span>
          <div className="w-4 h-4 rounded bg-panel-border flex items-center justify-center">
            <span className="text-gray-600 text-[9px]">▶</span>
          </div>
        </div>
      </div>
    </div>
  );
}
