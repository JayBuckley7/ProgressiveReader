export interface OfflineData {
  translations: Record<string, any>;
  highlights: Record<string, any>;
}

let fileHandle: FileSystemFileHandle | null = null;
let data: OfflineData = { translations: {}, highlights: {} };
let dirty = false;

export function getOfflineDataHandle(): FileSystemFileHandle | null {
  return fileHandle;
}

export async function setOfflineDataHandle(handle: FileSystemFileHandle): Promise<void> {
  fileHandle = handle;
  const file = await handle.getFile();
  try {
    const text = await file.text();
    data = JSON.parse(text) as OfflineData;
    if (!data.translations) data.translations = {};
    if (!data.highlights) data.highlights = {};
  } catch {
    data = { translations: {}, highlights: {} };
  }
}

async function persist(): Promise<void> {
  if (!fileHandle || !dirty) return;
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
  dirty = false;
}

export async function selectOfflineDataFile(): Promise<FileSystemFileHandle | null> {
  if (!('showOpenFilePicker' in window)) {
    alert('File System Access API not supported');
    return null;
  }
  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
  });
  if (handle) {
    await setOfflineDataHandle(handle);
  }
  return handle;
}

export function saveTranslation(key: string, value: any): void {
  data.translations[key] = value;
  dirty = true;
  void persist();
}

export function loadTranslation(key: string): any | null {
  return data.translations[key] ?? null;
}

export function clearTranslations(prefix: string): void {
  Object.keys(data.translations).forEach(k => {
    if (k.startsWith(prefix)) delete data.translations[k];
  });
  dirty = true;
  void persist();
}

export function saveHighlightsData(key: string, value: any): void {
  data.highlights[key] = value;
  dirty = true;
  void persist();
}

export function loadHighlightsData(key: string): any | null {
  return data.highlights[key] ?? null;
}

export function clearHighlightsData(prefix: string): void {
  Object.keys(data.highlights).forEach(k => {
    if (k.startsWith(prefix)) delete data.highlights[k];
  });
  dirty = true;
  void persist();
}
