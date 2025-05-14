// PWA functionality
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/js/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
          
          // Set up periodic background sync if supported and needed
          if ('periodicSync' in registration) {
            setupPeriodicSync(registration);
          }
        })
        .catch(error => {
          console.error('ServiceWorker registration failed: ', error);
        });
    });
  }

  // Set up beforeinstallprompt event
  let deferredPrompt;
  
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button or notification if available
    showInstallPromotion();
  });
  
  // Function to show install promotion when appropriate
  function showInstallPromotion() {
    // Check if we have an install button in the DOM
    const installButton = document.getElementById('pwa-install-button');
    
    if (installButton && deferredPrompt) {
      // Make the button visible
      installButton.style.display = 'block';
      
      // Handle the install button click
      installButton.addEventListener('click', (e) => {
        // Hide the install button
        installButton.style.display = 'none';
        
        // Show the prompt
        deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the install prompt');
          }
          // Clear the deferredPrompt variable
          deferredPrompt = null;
        });
      });
    }
  }
  
  // Function to set up periodic sync
  async function setupPeriodicSync(registration) {
    try {
      // Request permission for periodic background sync
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync',
      });
      
      if (status.state === 'granted') {
        // Register for periodic sync
        await registration.periodicSync.register('sync-reading-progress', {
          // Sync every 24 hours
          minInterval: 24 * 60 * 60 * 1000,
        });
        console.log('Periodic background sync registered');
      }
    } catch (error) {
      console.error('Periodic background sync setup failed:', error);
    }
  }
  
  // Handle online/offline events
  window.addEventListener('online', () => {
    console.log('App is online. Triggering sync...');
    // Trigger a sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('sync-reading-progress');
      });
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('App is offline. Reading will continue to work from cache.');
    // Optionally show an offline notification to the user
    showOfflineNotification();
  });
  
  function showOfflineNotification() {
    // Simple notification to inform user they're offline
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.textContent = 'You are currently offline. Some features may be limited.';
    
    // Append to body or a specific container
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
}); 