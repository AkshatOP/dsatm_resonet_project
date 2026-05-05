/**
 * AgentChat.jsx
 * Terminal-style agent communication feed — dark glass panel with green accents.
 *
 * Message types:
 *   request    → agent asking for resources
 *   award      → winning bidder responding (with zone deployment breakdown)
 *   xai        → XAI explanation bot
 *   zone_group → grouped zone status alert with per-zone stagger animation
 *   dispatch   → NDRF deployment announcement
 */

import { useRef, useEffect, useState } from 'react';
import { AGENT_ICONS } from '../../constants/agentIcons';

/* ── Typewriter Effect ────────────────────────────────────────── */
function Typewriter({ text, fastForward = false, onComplete, mono = false }) {
  const [displayed, setDisplayed] = useState(fastForward ? text : '');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (fastForward) {
      setDisplayed(text);
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

    let i = 0;
    let timeout;
    const typeNext = () => {
      setDisplayed(text.substring(0, i + 1));
      i++;
      if (i < text.length) {
        const nextSpeed = Math.random() * 18 + 8;
        timeout = setTimeout(typeNext, nextSpeed);
      } else {
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };
    timeout = setTimeout(typeNext, 10);
    return () => clearTimeout(timeout);
  }, [text, fastForward]);

  return (
    <>
      <span className={mono ? 'font-mono' : ''}>{displayed}</span>
      {!fastForward && displayed.length < text.length && (
        <span className="inline-block w-[6px] h-[13px] ml-[2px] align-middle bg-[#39ff14] opacity-90 animate-pulse" />
      )}
    </>
  );
}

/* ── Agent meta lookup ────────────────────────────────────────── */
function agentMeta(agentId) {
  if (!agentId) return { emoji: '🤖', color: '#94a3b8', label: 'Agent' };
  const stripped = agentId.replace(/_agent$/, '');
  const found = AGENT_ICONS[stripped] ?? AGENT_ICONS[agentId];
  if (found) return found;
  const extras = {
    zone_monitor:  { emoji: '🌍', color: '#f97316', label: 'Zone Monitor'     },
    ndrf_dispatch: { emoji: '🪖', color: '#4ade80', label: 'NDRF'             },
    system:        { emoji: '⚙️', color: '#94a3b8', label: 'System'           },
  };
  return extras[agentId] ?? { emoji: '🤖', color: '#94a3b8', label: agentId };
}

/* ── Relative timestamp ───────────────────────────────────────── */
function relTime(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - new Date(date)) / 1000);
  if (s < 5)    return 'Just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return new Date(date).toLocaleTimeString('en-IN', { hour12: false });
}

/* ── Classification colours ───────────────────────────────────── */
const CLS_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', LOW: '#eab308', SAFE: '#22c55e' };
const CLS_ICON  = { CRITICAL: '🔴', HIGH: '🟠', LOW: '🟡', SAFE: '🟢' };

/* ── Message type → accent colour ────────────────────────────── */
const TYPE_COLOR = {
  request:    '#38bdf8',   // sky blue
  award:      '#39ff14',   // neon green
  xai:        '#c084fc',   // purple
  dispatch:   '#fbbf24',   // amber
  zone_group: '#f97316',   // orange
};

/* ── Agent colour label ───────────────────────────────────────── */
const AGENT_COLOR = {
  power_agent:    '#fbbf24',
  hospital_agent: '#f472b6',
  fire_agent:     '#f97316',
  police_agent:   '#60a5fa',
  ndrf_agent:     '#4ade80',
  xai_agent:      '#c084fc',
  zone_monitor:   '#f97316',
};

function getAgentColor(agentId) {
  return AGENT_COLOR[agentId] ?? agentMeta(agentId).color ?? '#39ff14';
}

/* ── Badge pill ───────────────────────────────────────────────── */
const BADGE_CLS = {
  AWARDED: 'bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/30',
  AERIAL:  'bg-sky-500/10   text-sky-300   border border-sky-500/30',
  LAND:    'bg-blue-500/10  text-blue-300  border border-blue-500/30',
  OFFLINE: 'bg-red-900/50   text-red-300   border border-red-800/60',
};
function Badge({ label }) {
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest font-mono ${BADGE_CLS[label] ?? 'bg-gray-700 text-gray-300 border border-gray-600'}`}>
      {label}
    </span>
  );
}

/* ── Terminal separator line ──────────────────────────────────── */
function SepLine() {
  return <div className="border-t border-white/5 my-0" />;
}

/* ── Standard chat bubble (request / award / xai / dispatch) ──── */
function ChatBubble({ msg, fastForward, onComplete }) {
  const meta = agentMeta(msg.agentId);
  const accentColor = TYPE_COLOR[msg.type] ?? '#4b5563';
  const agentColor  = getAgentColor(msg.agentId);
  const [textDone, setTextDone] = useState(fastForward);

  useEffect(() => {
    if (fastForward) setTextDone(true);
  }, [fastForward]);

  const handleTextComplete = () => {
    setTextDone(true);
    if (!msg.subtext && onComplete) onComplete();
  };

  const handleSubtextComplete = () => {
    if (onComplete) onComplete();
  };

  return (
    <div className="chat-bubble animate-fadein">
      {/* Agent name + time row */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-bold tracking-wide" style={{ color: agentColor }}>
          {meta.label}:
        </span>
        {msg.badge && <Badge label={msg.badge} />}
        <span className="ml-auto text-[9px] text-gray-600 font-mono shrink-0">{relTime(msg.time)}</span>
      </div>

      {/* Main text */}
      <p className="text-[12px] text-gray-100 leading-relaxed font-light">
        <Typewriter text={msg.text} fastForward={fastForward} onComplete={handleTextComplete} />
      </p>

      {/* Subtext */}
      {msg.subtext && textDone && (
        <p className="text-[10px] mt-1 font-mono" style={{ color: accentColor, opacity: 0.75 }}>
          <Typewriter text={msg.subtext} fastForward={fastForward} onComplete={handleSubtextComplete} mono />
        </p>
      )}
    </div>
  );
}

/* ── Zone group bubble — staggered per-zone animation ─────────── */
function ZoneGroupBubble({ msg, fastForward, onComplete }) {
  const { groups } = msg;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (!fastForward && onCompleteRef.current) {
      const t = setTimeout(() => {
        if (onCompleteRef.current) onCompleteRef.current();
      }, 400);
      return () => clearTimeout(t);
    } else if (fastForward && onCompleteRef.current) {
      onCompleteRef.current();
    }
  }, [fastForward]);

  let lineIdx = 0;

  return (
    <div className="chat-bubble animate-fadein">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold tracking-wide text-[#f97316]">Zone Monitor:</span>
        <span className="ml-auto text-[9px] text-gray-600 font-mono shrink-0">{relTime(msg.time)}</span>
      </div>

      <div className="space-y-2">
        {groups.map(({ cls, zones }) => {
          const anyPowerLost    = zones.some((z) => !z.power_status);
          const anyRoadsBlocked = zones.some((z) => z.road_blocked);
          const anyCritInfra    = zones.some((z) => z.has_critical_infra);
          const conditions = [
            anyPowerLost    && 'power lost',
            anyRoadsBlocked && 'roads blocked',
            anyCritInfra    && 'critical infra',
          ].filter(Boolean);

          return (
            <div key={cls}>
              <p className="text-[10px] text-gray-500 mb-0.5 font-mono">
                <span className="font-bold" style={{ color: CLS_COLOR[cls] }}>
                  {CLS_ICON[cls]} {cls}
                </span>
                {conditions.length > 0 && (
                  <span className="text-gray-600"> · {conditions.join(' · ')}</span>
                )}
              </p>
              {zones.map((z) => {
                const delay = `${0.1 + (lineIdx++) * 0.22}s`;
                return (
                  <p
                    key={z.zone_id}
                    className="zone-line text-[12px] font-semibold pl-3"
                    style={{ color: CLS_COLOR[cls], animationDelay: delay }}
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
  const [typingIndex, setTypingIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Tick every 30s to refresh relative timestamps
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Reset sequence when messages clear
  useEffect(() => {
    if (messages.length === 0) setTypingIndex(0);
  }, [messages.length]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const visibleMessages = messages.slice(0, typingIndex + 1);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080d14]">
      {/* ── Terminal Header ── */}
      <div className="shrink-0 px-4 py-2.5 flex items-center justify-between border-b border-white/5 bg-[#060a10]">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[#39ff14]" />
            <div className="absolute w-2 h-2 rounded-full bg-[#39ff14] animate-ping opacity-50" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#39ff14]"
               style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
              Agent Network
            </p>
            <p className="text-[8px] text-gray-600 uppercase tracking-[0.12em]">Real-time node comms</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-600">{messages.length}</span>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1 chat-scroll">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4">
            <div className="text-2xl mb-3 opacity-30">📡</div>
            <p className="text-[11px] text-gray-600 font-mono tracking-wide">AWAITING NETWORK ACTIVITY</p>
            <p className="text-[9px] text-gray-700 mt-1 font-mono">Click a zone on the map to simulate</p>
          </div>
        ) : (
          <>
            {visibleMessages.map((msg, idx) => {
              const isCurrent = idx === typingIndex;
              const isFastForward = idx < typingIndex;

              const handleComplete = () => {
                if (isCurrent && typingIndex < messages.length - 1) {
                  setTypingIndex(prev => prev + 1);
                }
              };

              return (
                <div key={msg.id}>
                  {msg.type === 'zone_group'
                    ? <ZoneGroupBubble msg={msg} fastForward={isFastForward} onComplete={handleComplete} />
                    : <ChatBubble msg={msg} fastForward={isFastForward} onComplete={handleComplete} />}
                  <SepLine />
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
