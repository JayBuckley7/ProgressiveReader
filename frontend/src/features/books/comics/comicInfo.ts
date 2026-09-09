import type { ComicLibrary, Series } from './comicLibrary';
export type ComicInfo = { series: string; title: string; volume: string; number: string; edition: string; pageCount: number };
export function parseComicInfo(xml: string, pageCount: number): ComicInfo | null {
  if (xml.length > 262144 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'ComicInfo') return null;
  const text = (name: string) => doc.documentElement.querySelector(`:scope > ${name}`)?.textContent?.trim() || '';
  return { series: text('Series'), title: text('Title'), volume: text('Volume'), number: text('Number'), edition: [text('Year'), text('Publisher')].filter(Boolean).join(' · '), pageCount };
}
export async function adoptComicInfo(store: ComicLibrary, bookId: string, info: ComicInfo | null, fallback: string) {
  if (store.getSnapshot().state.records[`chapter:${bookId}`] || !info?.series) return;
  const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase();
  const matches = Object.entries(store.getSnapshot().state.records).filter(([id, row]) => {
    const value = row.value as Series | null;
    return id.startsWith('series:') && value && !value.source && normalize(value.title) === normalize(info.series) && normalize(value.edition || '') === normalize(info.edition);
  });
  if (matches.length > 1) return;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${normalize(info.series)}|${normalize(info.edition)}`));
  if (store.getSnapshot().state.records[`chapter:${bookId}`]) return;
  const seriesId = matches[0]?.[0].slice(7) || `import_${Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, '0')).join('').slice(0, 32)}`;
  if (!store.value(`series:${seriesId}`)) store.edit(`series:${seriesId}`, { title: info.series, edition: info.edition });
  store.edit(`chapter:${bookId}`, { seriesId, title: info.title || fallback, volume: info.volume, number: info.number, pageCount: info.pageCount });
}
