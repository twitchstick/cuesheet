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
        // Tally lights, as in a gallery: red is on air, amber wants attention.
        live: '#ff3b6f',
        tally: { on: '#ff3b52', hold: '#f5a524', idle: '#5d6478' },
        // The two media servers' own colours, used to tint their streams.
        plex: '#e5a00d',
        jellyfin: '#aa5cc3',
        // The signal trace's own deep links, tinted to the app each one
        // opens: Radarr's gold (radarr.github.io/css/theme.less), Sonarr's
        // blue (its own brand cyan), Seerr's indigo (Overseerr's own
        // tailwind.config.js, which uses Tailwind's stock indigo-500).
        radarr: '#ecd65d',
        sonarr: '#35c5f4',
        seerr: '#6366f1',
      },
      fontFamily: {
        // Archivo is a grotesque built for signage and dense display — the
        // lineage of broadcast lower-thirds rather than another product sans.
        sans: ['Archivo Variable', 'Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Every number on this page is a measurement. Timecode is always mono.
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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
