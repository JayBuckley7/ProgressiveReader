// PWA functionality

// --- Cookie Helper Functions ---
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}
// --- End Cookie Helper Functions ---

document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      // Unregister existing service workers to force update
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for(let registration of registrations) {
          await registration.unregister();
          console.log('ServiceWorker unregistered to force update');
        }
      } catch (error) {
        console.error('Error unregistering service worker:', error);
      }
      
      // Register new service worker
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
    // Check if user has already dismissed the prompt
    if (getCookie('pwaInstallDismissed') === 'true') {
        console.log('PWA install prompt previously dismissed by user.');
        return;
    }

    // Check if we have an install button and container in the DOM
    const installButton = document.getElementById('pwa-install-button');
    const dismissButton = document.getElementById('pwa-dismiss-button');
    const promptContainer = document.getElementById('pwa-prompt-container');
    
    if (promptContainer && installButton && dismissButton && deferredPrompt) {
      // Make the prompt container visible
      promptContainer.style.display = 'block';
      
      // Handle the install button click
      installButton.addEventListener('click', (e) => {
        // Hide the prompt container
        promptContainer.style.display = 'none';
        
        // Show the prompt
        deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the browser install prompt');
            // Optionally, set cookie here too if browser prompt is dismissed
            // setCookie('pwaInstallDismissed', 'true', 365);
          }
          // Clear the deferredPrompt variable
          deferredPrompt = null;
        });
      });

      // Handle the dismiss button click
      dismissButton.addEventListener('click', (e) => {
        console.log('User clicked PWA dismiss button.');
        promptContainer.style.display = 'none';
        setCookie('pwaInstallDismissed', 'true', 365); // Dismiss for 1 year
        deferredPrompt = null; // Don't show again this session
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