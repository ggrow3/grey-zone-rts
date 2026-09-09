import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Dev: the API and the SignalR hub live on the C# server at 5080; production: the server hosts client/dist itself.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5080', changeOrigin: true },
      '/hubs': { target: 'http://localhost:5080', changeOrigin: true, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
