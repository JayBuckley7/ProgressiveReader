export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}

const BASE = '/drive';

async function listFiles(folderId?: string): Promise<DriveFile[]> {
  const url = folderId ? `${BASE}/files?folderId=${encodeURIComponent(folderId)}` : `${BASE}/files`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list files');
  return res.json();
}

async function uploadFile(file: Blob, fileName: string, mimeType?: string, folderId?: string): Promise<DriveFile> {
  const form = new FormData();
  form.append('file', file, fileName);
  if (folderId) form.append('folderId', folderId);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form, credentials: 'include' });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

async function downloadFile(fileId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/download/${fileId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

async function deleteFile(fileId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/files/${fileId}`, { method: 'DELETE', credentials: 'include' });
  return res.ok;
}

export const driveApiService = { listFiles, uploadFile, downloadFile, deleteFile };
