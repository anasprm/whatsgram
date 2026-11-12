/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.js'],
  safelist: [
    'from-indigo-600', 'via-fuchsia-600', 'to-rose-500',
    'from-sky-500', 'via-blue-600', 'to-indigo-700',
    'from-emerald-500', 'via-teal-600', 'to-cyan-700',
    'from-amber-500', 'via-orange-600', 'to-rose-600',
    'from-zinc-800', 'via-neutral-900', 'to-black'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      colors: {
        accent: 'rgb(var(--ac-rgb) / <alpha-value>)',
        zinc: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#2e2e36',
          800: '#1c1c22',
          900: '#111115',
          950: '#050507'
        }
      }
    }
  },
  plugins: []
};
