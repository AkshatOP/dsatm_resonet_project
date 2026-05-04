/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'crisis-red':    '#ef4444',
        'crisis-orange': '#f97316',
        'crisis-yellow': '#eab308',
        'crisis-green':  '#22c55e',
        'crisis-grey':   '#6b7280',
        'panel-bg':      '#0f1117',
        'panel-surface': '#161b27',
        'panel-border':  '#1e2535',
        'panel-card':    '#1a2234',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
