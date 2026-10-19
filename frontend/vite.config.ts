import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEV_API_ORIGIN = process.env.VITE_DEV_API_ORIGIN ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: DEV_API_ORIGIN, changeOrigin: true, timeout: 120_000 },
      '/webhooks': { target: DEV_API_ORIGIN, changeOrigin: true },
    },
  },
});
