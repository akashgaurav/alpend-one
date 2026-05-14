/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        one: {
          bg:      '#060f0f',
          surface: '#0b1f1f',
          raised:  '#0f2626',
          border:  '#163535',
          teal:    '#14b8a6',
          cyan:    '#22d3ee',
          muted:   '#5a9090',
          faint:   '#1e4040',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.4' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.35s ease-out forwards',
        pulse:  'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
