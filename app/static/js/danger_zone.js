import driveSync from './driveSync.js';
import * as dbService from './dbService.js';

const modal = document.getElementById('danger-modal');
const dangerLink = document.getElementById('danger-link');
const btnClose = document.getElementById('btn-close-danger');
const btnLogout = document.getElementById('btn-logout-google');
const btnClearCache = document.getElementById('btn-clear-cache');
const btnRemoveBooks = document.getElementById('btn-remove-books');
const btnClearRedis = document.getElementById('btn-clear-redis');

dangerLink.addEventListener('click', (e) => {
  e.preventDefault();
  modal.hidden = false;
});
btnClose.addEventListener('click', () => (modal.hidden = true));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.hidden = true;
});

btnLogout.addEventListener('click', async () => {
  if (!confirm('Disconnect Google Drive and log out?')) return;
  try {
    await driveSync.disconnect();
    alert('Logged out of Google.');
    location.reload();
  } catch (err) {
    alert('Failed to log out: ' + err.message);
  }
});

btnClearCache.addEventListener('click', async () => {
  if (!confirm('Clear browser caches and localStorage? The page will reload.')) return;
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    localStorage.clear();
    alert('Browser cache cleared. Reloading…');
    location.reload();
  } catch (err) {
    alert('Failed to clear caches: ' + err.message);
  }
});

btnRemoveBooks.addEventListener('click', async () => {
  if (!confirm('Delete ALL books and reading progress from this device? This cannot be undone.')) return;
  try {
    await dbService.clearAllData();
    alert('All books removed from local database. Reloading…');
    location.reload();
  } catch (err) {
    alert('Failed to clear local database: ' + err.message);
  }
});

if (btnClearRedis) {
  btnClearRedis.addEventListener('click', async () => {
    const user = driveSync.getUserProfile();
    if (!user || !user.email) {
      alert('Could not identify user. Please ensure you are logged in if you use Google Drive sync.');
      return;
    }
    const userId = user.email;

    if (!confirm(`Are you absolutely sure you want to delete ALL your data from our servers (Redis) for user ${userId}? This includes all book metadata and reading progress synced across devices. This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/metadata/${userId}/clear_all_entries`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully cleared ${result.deleted_count} entries from Redis for user ${userId}. It is recommended to reload the page.`);
        location.reload();
      } else {
        const errorResult = await response.text();
        alert(`Failed to clear Redis data. Server responded with ${response.status}: ${errorResult}`);
      }
    } catch (err) {
      console.error('Error clearing Redis data:', err);
      alert('An error occurred while trying to clear Redis data: ' + err.message);
    }
  });
}

