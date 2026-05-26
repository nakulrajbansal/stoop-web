/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#F0EBE1', 2: '#E8E2D8' },
        card: '#FDFAF6',
        ink: { DEFAULT: '#14110D', 2: '#4A4540' },
        muted: '#9C958D',
        accent: { DEFAULT: '#C8472A', 2: '#E05535' },
        sage: '#2A4232',
        'dark-bg': '#0E0C09',
        'dark-s1': '#161310',
        'dark-s2': '#201C18'
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace']
      }
    }
  },
  plugins: []
};
