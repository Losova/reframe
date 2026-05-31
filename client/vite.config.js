import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '..',
  plugins: [react()],
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) {
            return 'runtime';
          }

          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('react-router')) {
            return 'router';
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }

          if (id.includes('@supabase')) {
            return 'supabase';
          }

          if (id.includes('/fabric/')) {
            return 'fabric';
          }

          if (id.includes('/jspdf/')) {
            return 'pdf';
          }

          if (id.includes('html2canvas') || id.includes('dompurify')) {
            return 'pdf';
          }

          return 'vendor';
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js'
  }
});
