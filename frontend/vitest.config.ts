import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
    globals: true,
    css: true,
    pool: 'threads',
    maxThreads: 1,
    minThreads: 1,
    isolate: false,
    restoreMocks: true,
    clearMocks: true,
  },
});


