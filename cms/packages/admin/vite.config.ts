import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 32003,
    proxy: {
      '/api': {
        target: 'http://localhost:32001',
        rewrite: path => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
  base: '/admin/',
  build: { outDir: 'dist' },
});
