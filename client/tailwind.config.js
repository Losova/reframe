/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#070706',
        cyanGlow: '#a3a3a3',
        amberGlow: '#d6a15f',
        steel: '#94a3b8'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.42)'
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(148, 163, 184, 0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.09) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};
