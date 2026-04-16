/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#04070d',
        cyanGlow: '#67e8f9',
        amberGlow: '#fb923c',
        steel: '#94a3b8'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(2, 6, 23, 0.55)'
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(148, 163, 184, 0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.09) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};
