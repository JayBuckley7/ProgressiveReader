import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

async function startApp() {

  // StrictMode disabled to prevent double/triple firing of effects during development
  const app = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  const AppComponent = app;

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
