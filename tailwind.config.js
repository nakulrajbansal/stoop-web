/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#F0EBE1', 2: '#E8E2D8' },
        card: '#FDFAF6',
        ink: { DEFAULT: '#14110D', 2: '#4A4540' },
        muted: '#6E675E',
        accent: { DEFAULT: '#C8472A', 2: '#E05535' },
        sage: '#2A4232'
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Fraunces', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'DM Mono', 'monospace']
      }
    }
  },
  plugins: []
};
