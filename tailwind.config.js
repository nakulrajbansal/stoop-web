/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#F0EBE1', 2: '#E8E2D8' },
        card: '#FDFAF6',
        ink: { DEFAULT: '#14110D', 2: '#4A4540' },
        muted: '#6A635A',
        accent: { DEFAULT: '#2F6B3F', 2: '#3B7F4E' },
        // gold is for display type (large-text 3:1). gold-2 is the body-size
        // mustard that clears 4.5:1 on cream, cream-2 and the badge fill.
        gold: { DEFAULT: '#8A681E', 2: '#6F5312' },
        danger: '#B3402A',
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
