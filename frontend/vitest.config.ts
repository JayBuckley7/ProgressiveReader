import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@features': path.resolve(__dirname, './src/features'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@integrations': path.resolve(__dirname, './src/integrations'),
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


