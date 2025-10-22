import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import App from './App.tsx'
import './index.css'
import i18n from './i18n'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

console.log('🔑 [CLERK DEBUG] Loaded publishable key:', PUBLISHABLE_KEY ? `${PUBLISHABLE_KEY.substring(0, 10)}...${PUBLISHABLE_KEY.substring(PUBLISHABLE_KEY.length - 5)}` : 'UNDEFINED')
console.log('🔑 [CLERK DEBUG] Key length:', PUBLISHABLE_KEY?.length || 'N/A')
console.log('🔑 [CLERK DEBUG] Key starts with pk_:', PUBLISHABLE_KEY?.startsWith('pk_') || false)
console.log('🔑 [CLERK DEBUG] All env vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')))

if (!PUBLISHABLE_KEY) {
  console.error('❌ [CLERK DEBUG] Missing Publishable Key!')
  throw new Error('Missing Publishable Key')
}

console.log('✅ [CLERK DEBUG] Publishable key validation passed')

async function startApp() {
  const app = (
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nextProvider>
    </React.StrictMode>
  );

  ReactDOM.createRoot(document.getElementById('root')!).render(app);
}

startApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Service worker registration failed', err));
  });
}
