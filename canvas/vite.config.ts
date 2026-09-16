import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', port: 32000, strictPort: true,
    proxy: {
      '/api/models': {target:'http://127.0.0.1:32003',rewrite:path=>path.replace('/api/models','/3d-models')},
      '/api/content': {target:'http://127.0.0.1:32001',rewrite:path=>path.replace('/api/content','')},
    },
  },
  preview: {host:'0.0.0.0',port:32005,strictPort:true},
  test: {environment:'jsdom',include:['tests/**/*.test.ts']},
});
