let cachedId = null;

export async function getUserId() {
  if (cachedId) return cachedId;
  try {
    const resp = await fetch('/auth/me');
    if (resp.ok) {
      const data = await resp.json();
      cachedId = data.id;
      return cachedId;
    }
  } catch (err) {
    console.warn('[userService] Failed to fetch user id:', err);
  }
  return null;
}
