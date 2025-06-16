import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'


async function startApp() {

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
