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
  // Show error in UI instead of throwing
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h1>Configuration Error</h1>
        <p>Missing Clerk publishable key. Please check your .env file.</p>
        <pre style="background: #f5f5f5; padding: 10px; margin: 20px 0; text-align: left;">
VITE_CLERK_PUBLISHABLE_KEY should be set in .env file
        </pre>
      </div>
    `
  }
  throw new Error('Missing Publishable Key')
}

console.log('✅ [CLERK DEBUG] Publishable key validation passed')

async function startApp() {
  try {
    const app = (
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nextProvider>
      </React.StrictMode>
    );

    const rootElement = document.getElementById('root')
    if (!rootElement) {
      throw new Error('Root element not found')
    }

    ReactDOM.createRoot(rootElement).render(app);
  } catch (error) {
    console.error('Failed to start app:', error)
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <h1>App Error</h1>
          <p>Failed to start application. Check console for details.</p>
          <pre style="background: #f5f5f5; padding: 10px; margin: 20px 0; text-align: left;">
${error instanceof Error ? error.message : String(error)}
          </pre>
        </div>
      `
    }
  }
}

startApp().catch((error) => {
  console.error('Fatal error starting app:', error)
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Service worker registration failed', err));
  });
}
