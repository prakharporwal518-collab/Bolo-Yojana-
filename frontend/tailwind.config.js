/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        saffron: { 50: '#FFF7ED', 100: '#FFEDD5', 400: '#FFA94D', 500: '#FF9933', 600: '#EA7A12', 700: '#C2410C' },
        leaf: { 50: '#ECFDF3', 100: '#D1FAE0', 500: '#138808', 600: '#0F6E06', 700: '#0B5205' },
        chakra: { 500: '#1E3A8A', 600: '#000080' },
        wa: { bg: '#ECE5DD', dark: '#075E54', green: '#25D366', bubble: '#DCF8C6' },
        cream: '#FFFBF5',
      },
      fontFamily: {
        sans: ['"Noto Sans Devanagari"', 'Mukta', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulsering: { '0%': { transform: 'scale(1)', opacity: '0.6' }, '100%': { transform: 'scale(1.8)', opacity: '0' } },
        wave: { '0%,100%': { transform: 'scaleY(0.3)' }, '50%': { transform: 'scaleY(1)' } },
        fadeup: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        pulsering: 'pulsering 1.6s ease-out infinite',
        wave: 'wave 1s ease-in-out infinite',
        fadeup: 'fadeup .35s ease-out both',
      },
    },
  },
  plugins: [],
};
