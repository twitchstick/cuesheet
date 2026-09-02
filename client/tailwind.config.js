/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#090b12',
          900: '#0c0f17',
          800: '#11141d',
          700: '#161a26',
          600: '#1e2331',
        },
        line: '#212636',
        fog: {
          100: '#f3f4f8',
          300: '#c3c7d3',
          500: '#8b91a5',
          700: '#5d6478',
        },
        accent: {
          300: '#b3a2ff',
          400: '#9b84ff',
          500: '#7c5cff',
          600: '#6a4bf0',
        },
        glow: '#22d3ee',
        live: '#ff3b6f',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'ui-sans-serif', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 32px -18px rgba(0,0,0,0.7)',
        poster: '0 14px 36px -16px rgba(0,0,0,0.85)',
        accent: '0 8px 24px -10px rgba(124,92,255,0.7)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 260ms ease-out both',
      },
    },
  },
  plugins: [],
};
