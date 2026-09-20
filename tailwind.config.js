/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ruhige, hochwertige dunkle Palette + zurückhaltender Gold-Akzent (Kino)
        ink: {
          950: '#08080b',
          900: '#0b0b0f',
          850: '#121218',
          800: '#17171f',
          750: '#1e1e27',
          700: '#282833',
          600: '#3a3a48',
        },
        accent: {
          DEFAULT: '#e6b450',
          soft: '#f0c674',
          dim: '#8a6d2f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        poster: '0 6px 20px -6px rgba(0,0,0,0.7)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
