/**
 * XAIPanel.jsx
 * Bottom panel showing the latest XAI explanation.
 * Displays rationale and counterfactual with a typewriter reveal effect.
 * Collapsible.
 */

import { useState, useEffect, useRef } from 'react';

function TypewriterText({ text, speed = 18 }) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    setDisplayed('');
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {displayed.length < (text?.length ?? 0) && (
        <span className="typewriter-cursor" />
      )}
    </span>
  );
}

export default function XAIPanel({ xai, isOpen, onToggle }) {
  const { rationale, counterfactual, decision_id } = xai ?? {};

  return (
    <div className="bg-panel-surface border-t border-panel-border">
      {/* Header / toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-panel-card transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-purple-400 text-sm">🤖</span>
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-widest">
            Latest Decision Explanation
          </span>
          {decision_id && (
            <span className="text-xs text-gray-600 font-mono ml-2">
              #{decision_id.slice(-8)}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs select-none">
          {isOpen ? '▼' : '▲'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4 slide-up">
          {/* Rationale */}
          <div className="bg-panel-card border border-panel-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Rationale</p>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {rationale
                ? <TypewriterText text={rationale} />
                : <span className="text-gray-600 italic">Waiting for XAI explanation…</span>
              }
            </p>
          </div>

          {/* Counterfactual */}
          <div className="bg-panel-card border border-panel-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-4 bg-purple-500 rounded-full" />
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Counterfactual</p>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {counterfactual
                ? <TypewriterText text={counterfactual} speed={14} />
                : <span className="text-gray-600 italic">No counterfactual yet…</span>
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
