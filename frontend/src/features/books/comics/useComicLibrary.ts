import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import { ComicLibrary } from './comicLibrary';
const stores = new Map<string, ComicLibrary>();
export function useComicLibrary() {
  const deps = useAppDeps();
  const owner = deps.auth.getUserId?.() || 'device';
  const store = useMemo(() => {
    let value = stores.get(owner);
    if (!value) {
      value = new ComicLibrary(owner, (path, init) => deps.backendFetch.request({ path, method: init?.method, headers: init?.headers, body: init?.body, signal: init?.signal || undefined }), () => deps.auth.getUserId?.() || 'device');
      stores.set(owner, value);
      while (stores.size > 2) stores.delete(stores.keys().next().value!);
    }
    return value;
  }, [owner, deps]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.sync();
    const sync = () => { void store.sync(); };
    window.addEventListener('online', sync); window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); void store.sync(); };
  }, [store]);
  return { store, ...snapshot };
}
