import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // AI summaries and quiz generation legitimately take 30-120s. Without
        // a raised timeout the proxy can cut the connection first, which the
        // browser then reports as an unexplained failure.
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
});
