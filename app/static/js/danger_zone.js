import driveSync from './driveSync.js';
import * as dbService from './dbService.js';

const modal = document.getElementById('danger-modal');
const dangerLink = document.getElementById('danger-link');
const btnClose = document.getElementById('btn-close-danger');
const btnLogout = document.getElementById('btn-logout-google');
const btnClearCache = document.getElementById('btn-clear-cache');
const btnRemoveBooks = document.getElementById('btn-remove-books');

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

