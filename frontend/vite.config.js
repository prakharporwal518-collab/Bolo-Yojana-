import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Keep heavy, rarely-used libs in their own chunks (lazy-loaded on demand).
        manualChunks: { pdf: ['jspdf'], ocr: ['tesseract.js'] },
      },
    },
  },
});
