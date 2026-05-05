/**
 * Controls.jsx
 * Compact Reset System button only.
 * Earthquake + Fire triggers removed from sidebar (available via map click).
 */

export default function Controls({ isSimulating, onTrigger, onTriggerFire, onReset }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest shrink-0">Controls</p>
      <button
        onClick={onReset}
        disabled={isSimulating}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-all duration-200
          ${isSimulating
            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            : 'bg-panel-surface hover:bg-panel-border border border-panel-border text-gray-400 hover:text-white active:scale-95'
          }`}
      >
        <span className="text-sm leading-none">⟳</span>
        Reset
      </button>
    </div>
  );
}
