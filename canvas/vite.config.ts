import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api/content': { target: 'http://127.0.0.1:3001', rewrite: path => path.replace('/api/content', '') } } }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } });
