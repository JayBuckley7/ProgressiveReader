import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/static/',
  build: {
    outDir: '../app/static/dist',
    manifest: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/jp-highlighter': path.resolve(__dirname, '../src/jp-highlighter'),
    },
  },
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
