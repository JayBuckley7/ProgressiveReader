import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

// Load the cloud storage modules before starting React
async function loadCloudStorageModules() {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/js/driveSync.js';
    script.type = 'module';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load cloud storage modules'));
    document.head.appendChild(script);
  });
}

async function startApp() {
  try {
    await loadCloudStorageModules();
    console.log('✅ Cloud storage modules loaded');
  } catch (error) {
    console.warn('⚠️ Failed to load cloud storage modules:', error);
    // Continue anyway - app will work without cloud storage
  }

  // Only use StrictMode in development to avoid excessive loading in production
  const isDevelopment = import.meta.env.MODE === 'development';
  
  const AppComponent = isDevelopment ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  );

  ReactDOM.createRoot(document.getElementById('root')!).render(AppComponent);
}

startApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Service worker registration failed', err));
  });
}
