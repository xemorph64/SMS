/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Paper-first tokens (channel vars so opacity modifiers work: bg-signal/10)
        carbon: 'rgb(var(--s-carbon) / <alpha-value>)',
        'carbon-2': 'rgb(var(--s-carbon-2) / <alpha-value>)',
        'carbon-3': 'rgb(var(--s-carbon-3) / <alpha-value>)',
        'carbon-4': 'rgb(var(--s-carbon-4) / <alpha-value>)',
        hair: 'rgb(var(--s-hair) / <alpha-value>)',
        'hair-2': 'rgb(var(--s-hair-2) / <alpha-value>)',
        bone: 'rgb(var(--s-bone) / <alpha-value>)',
        ash: 'rgb(var(--s-ash) / <alpha-value>)',
        smoke: 'rgb(var(--s-smoke) / <alpha-value>)',
        signal: 'rgb(var(--s-signal) / <alpha-value>)',
        heat: 'rgb(var(--s-heat) / <alpha-value>)',
        mid: 'rgb(var(--s-mid) / <alpha-value>)',
        ice: 'rgb(var(--s-ice) / <alpha-value>)',
        go: 'rgb(var(--s-go) / <alpha-value>)',
      },
      fontFamily: {
        ui: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        code: ['"Atkinson Hyperlegible Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
