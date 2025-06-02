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
      // Register new service worker (or update existing)
      // Register the service worker using the Flask route
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          
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
          } else {
            // Optionally, set cookie here too if browser prompt is dismissed
            // setCookie('pwaInstallDismissed', 'true', 365);
          }
          // Clear the deferredPrompt variable
          deferredPrompt = null;
        });
      });

      // Handle the dismiss button click
      dismissButton.addEventListener('click', (e) => {
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
        // Periodic background sync disabled
      }
    } catch (error) {
      console.error('Periodic background sync setup failed:', error);
    }
  }
  
  // Handle online/offline events
  window.addEventListener('online', () => {
  });
  
  window.addEventListener('offline', () => {
    // Optionally show an offline notification to the user
    showOfflineNotification();
  });
  
  function showOfflineNotification() {
    const notification = document.createElement('div');
    notification.className =
      'fixed bottom-5 left-1/2 -translate-x-1/2 transform bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50';
    notification.textContent = 'You are currently offline. Some features may be limited.';
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
}); 