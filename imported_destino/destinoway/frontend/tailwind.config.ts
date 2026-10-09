import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { mist: '#EEF3F4', ink: '#12232B', teal: { DEFAULT: '#0D5C63', soft: '#D6E8E9' }, marigold: '#F0A202', slate2: '#5B6B73' },
      fontFamily: { display: ['var(--font-display)', 'system-ui', 'sans-serif'], body: ['var(--font-body)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
