import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SettingsProvider } from './contexts/SettingsContext.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

async function startApp() {

  // Only use StrictMode in development to avoid excessive loading in production
  const isDevelopment = import.meta.env.MODE === 'development';
  
  const AppComponent = isDevelopment ? (
    <React.StrictMode>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </React.StrictMode>
  ) : (
    <SettingsProvider>
      <App />
    </SettingsProvider>
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
