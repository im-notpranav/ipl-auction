import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Backend: Express + WebSocket on port 3000.
// Dev: Vite on port 5173 proxies /api/* (HTTP) and /auction-ws (WebSocket) to 3000.
// Prod: `npm start` → server.ts serves dist/ statically + handles API/WS on 3000.
const BACKEND_PORT = 3000;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
    server: {
      port: 5173,
      proxy: {
        // REST API proxy
        '/api': {
          target: `http://localhost:${BACKEND_PORT}`,
          changeOrigin: true,
        },
        // WebSocket proxy: browser connects to ws://localhost:5173/auction-ws
        // Vite forwards WS upgrades on this path to ws://localhost:3000.
        // Regular HTTP requests to /auction-ws are not expected and will be 404.
        '/auction-ws': {
          target: `ws://localhost:${BACKEND_PORT}`,
          ws: true,
          changeOrigin: true,
        },
      },
      // HMR / watch (AI Studio compatibility)
      hmr: process.env.DISABLE_HMR !== 'true',
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              // The API server rewrites its state file on every bid/sale, and the photo
              // sync writes reports here. Vite reloads every open page when a root file
              // changes, which made the projector and phones reload on each action.
              ignored: [
                '**/.auction_rooms_state.json',
                '**/player-image-report.json',
                '**/player-image-review.html',
                '**/player-photos/**',
              ],
            },
    },
  };
});
