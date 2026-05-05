/**
 * Controls.jsx
 * Trigger Earthquake, Trigger Fire, and Reset System buttons.
 * Earthquake button pulses red while simulation is active.
 * Fire button has an orange theme.
 * All buttons are disabled during an active simulation.
 */

export default function Controls({ isSimulating, onTrigger, onTriggerFire, onReset }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Controls</p>

      <button
        onClick={onTrigger}
        disabled={isSimulating}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${isSimulating
            ? 'bg-red-700/80 text-red-200 cursor-not-allowed sim-pulse'
            : 'bg-red-600 hover:bg-red-500 active:scale-95 text-white shadow-lg shadow-red-900/40'
          }`}
      >
        <span className="text-lg">🌋</span>
        {isSimulating ? 'Simulating…' : 'Trigger Earthquake'}
      </button>

      <button
        onClick={onTriggerFire}
        disabled={isSimulating}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${isSimulating
            ? 'bg-orange-700/80 text-orange-200 cursor-not-allowed sim-pulse'
            : 'bg-orange-600 hover:bg-orange-500 active:scale-95 text-white shadow-lg shadow-orange-900/40'
          }`}
      >
        <span className="text-lg">🔥</span>
        {isSimulating ? 'Simulating…' : 'Simulate Fire (Zone-I)'}
      </button>

      <button
        onClick={onReset}
        disabled={isSimulating}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${isSimulating
            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            : 'bg-panel-surface hover:bg-panel-border border border-panel-border text-gray-300 hover:text-white active:scale-95'
          }`}
      >
        <span className="text-lg">⟳</span>
        Reset System
      </button>
    </div>
  );
}

