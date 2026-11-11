import { defineConfig } from 'vite';
export default defineConfig({
  root: 'frontend',
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8765', '/vendor': 'http://127.0.0.1:8765', '/audio': 'http://127.0.0.1:8765' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
