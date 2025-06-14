import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Determine backend URL based on environment
  const getBackendUrl = () => {
    // Check for explicit environment variable first
    if (process.env.VITE_BACKEND_URL) {
      return process.env.VITE_BACKEND_URL;
    }
    
    // Environment-specific defaults
    switch (mode) {
      case 'production':
        // In production, assume API is served from same origin (Cloud Run)
        return '';
      case 'development':
      default:
        // Default to local Flask server
        return 'http://localhost:5000';
    }
  };

  const backendUrl = getBackendUrl();
  const needsProxy = backendUrl && backendUrl !== '';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: '0.0.0.0', // Bind to all network interfaces
      port: 5175,
      strictPort: true,
      ...(needsProxy && {
        proxy: {
          '/api': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/settings': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/drive': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/auth': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/metadata': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          }
        },
      }),
      // Allow various hosts for different environments
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '.ngrok-free.app',
        '.ngrok.io'
      ]
    }
  };
});
