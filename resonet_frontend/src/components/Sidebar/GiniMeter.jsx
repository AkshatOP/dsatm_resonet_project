/**
 * GiniMeter.jsx
 * Displays the current Gini fairness coefficient.
 * Updates on every negotiation WebSocket event.
 * Shows before/after delta and a progress bar.
 */

export default function GiniMeter({ gini }) {
  const { current = null, before = null, after = null, policyActive = false } = gini ?? {};

  const displayValue = current ?? after ?? 0;
  const delta = (before != null && after != null) ? (after - before) : null;

  const barWidth = Math.min(100, Math.max(0, displayValue * 100));

  // Colour the bar: low Gini (equal) = green, high (unequal) = red
  const barColor = displayValue < 0.4 ? '#22c55e'
    : displayValue < 0.6 ? '#eab308'
    : '#ef4444';

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Gini Fairness Monitor</p>

      <div className="bg-panel-card rounded-xl p-4 border border-panel-border space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums" style={{ color: barColor }}>
            {current != null ? displayValue.toFixed(3) : '—'}
          </span>
          {delta != null && (
            <span className={`text-sm font-mono ${delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(3)}
            </span>
          )}
        </div>

        {/* Bar */}
        <div className="bg-gray-800 rounded-full h-2">
          <div
            className="gini-bar-fill h-2 rounded-full"
            style={{ width: `${barWidth}%`, backgroundColor: barColor }}
          />
        </div>

        {/* Before / after */}
        {before != null && after != null && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Before: <span className="text-gray-300">{before.toFixed(3)}</span></span>
            <span>After: <span className="text-gray-300">{after.toFixed(3)}</span></span>
          </div>
        )}

        {/* Policy status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${policyActive ? 'bg-green-400 status-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-400">
            Policy intervention: <span className={policyActive ? 'text-green-400' : 'text-gray-500'}>
              {policyActive ? 'active' : 'inactive'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
