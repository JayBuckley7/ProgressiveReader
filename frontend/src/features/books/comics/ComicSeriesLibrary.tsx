import { useState, useEffect } from 'react';
import type { BookMetadata, Folder } from '~/types';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import { useComicLibrary } from './useComicLibrary';
import { compareChapters, nextComic, type Chapter, type ComicProgress, type ComicState, type Series } from './comicLibrary';

export const comicId = (book: BookMetadata) => book.driveFileId || (book.cloudProvider === 'google' ? book.id : `local_${book.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
export function collapseComicSeries(books: BookMetadata[], state: ComicState): BookMetadata[] {
  const seen = new Set<string>();
  return books.flatMap(book => {
    if (book.fileType !== 'cbz') return [book];
    const chapter = state.records[`chapter:${comicId(book)}`]?.value as Chapter | undefined;
    const series = chapter?.seriesId ? state.records[`series:${chapter.seriesId}`]?.value as Series | undefined : undefined;
    if (!series || !chapter?.seriesId) return [book];
    if (seen.has(chapter.seriesId)) return [];
    seen.add(chapter.seriesId);
    const cover = books.find(item => comicId(item) === series.coverBookId) || book;
    return [{ ...book, id: `comic-series:${chapter.seriesId}`, title: series.title, coverUrl: cover.coverUrl, folderId: series.folderId || undefined }];
  });
}

export function ComicSeriesLibrary({ books, folders, selected, onSelect, onOpen, onDelete }: {
  books: BookMetadata[]; folders: Folder[]; selected: string | null; onSelect: (id: string | null) => void; onOpen: (id: string) => void; onDelete: (id: string) => void;
}) {
  const { store, state, message, pending } = useComicLibrary();
  const { driveCache } = useAppDeps();
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const found = new Set<string>();
      for (const book of books.filter(b => b.fileType === 'cbz')) {
        if (!book.driveFileId || await driveCache.findCachedFileByPrefix(book.driveFileId)) found.add(book.id);
      }
      if (!stopped) setCachedIds(found);
    })().catch(() => { if (!stopped) setCachedIds(new Set()); });
    return () => { stopped = true; };
  }, [books, driveCache, store]);
  const [editing, setEditing] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [title, setTitle] = useState('');
  const [volume, setVolume] = useState('');
  const [number, setNumber] = useState('');
  const [rename, setRename] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  useEffect(() => { setEditing(null); onSelect(null); }, [store]);
  const describe = (value: unknown) => {
    if (!value) return 'Removed';
    const item = value as Chapter | ComicProgress;
    return 'page' in item ? `${item.status} · page ${item.page} / ${item.pageCount}` : [item.title, item.volume && `Vol. ${item.volume}`, item.number].filter(Boolean).join(' · ');
  };
  const series = Object.entries(state.records).filter(([id, row]) => id.startsWith('series:') && row.value).map(([id, row]) => ({ id: id.slice(7), ...row.value as Series }));
  const chapters = books.filter(book => book.fileType === 'cbz' && store.value<Chapter>(`chapter:${comicId(book)}`)?.seriesId === selected)
    .sort((a, b) => compareChapters(store.value<Chapter>(`chapter:${comicId(a)}`)!, store.value<Chapter>(`chapter:${comicId(b)}`)!));
  const current = series.find(item => item.id === selected);
  const resume = nextComic(chapters.map(comicId), state);
  const open = (id: string) => { const book = books.find(item => comicId(item) === id); if (book) onOpen(book.id); };
  const edit = (book: BookMetadata) => {
    const c = store.value<Chapter>(`chapter:${comicId(book)}`);
    setEditing(comicId(book)); setSeriesId(c?.seriesId || ''); setSeriesTitle(''); setTitle(c?.title || book.title); setVolume(c?.volume || ''); setNumber(c?.number || '');
  };
  const button = 'rounded border app-border px-3 py-2 text-sm';
  return <section className="space-y-3 py-3">
    {books.some(book => book.fileType === 'cbz') && <details><summary className="cursor-pointer">Organize comics</summary><div className="flex flex-wrap gap-2 py-2">{books.filter(book => book.fileType === 'cbz').map(book => <button className={button} key={book.id} onClick={() => edit(book)}>{book.title}</button>)}</div></details>}
    {(pending > 0 || message && message !== 'Synced with Drive') && <p role="status">{message} <button className={button} onClick={() => void store.sync()}>Retry sync</button></p>}
    {Object.entries(state.records).filter(([, row]) => row.conflicts.length).map(([id, row]) => <div role="alert" key={id} className="rounded border p-3">
      <p>Another device changed {id.startsWith('progress:') ? 'this reading position' : 'this comic'}. Choose which version to keep.</p>
      <p className="text-sm">Saved: {describe(row.value)} · Other change: {describe(row.conflicts.at(-1)?.value)}</p>
      <button className={button} onClick={() => store.resolve(id, true)}>Use other change</button> <button className={button} onClick={() => store.resolve(id, false)}>Keep saved version</button>
    </div>)}
    {current && <div className="space-y-4">
      <button className={button} onClick={() => onSelect(null)}>← Library</button>
      <div className="flex gap-5"><div className="w-28 shrink-0">{(chapters.find(b => comicId(b) === current.coverBookId) || chapters[0])?.coverUrl && <img className="w-full rounded" src={(chapters.find(b => comicId(b) === current.coverBookId) || chapters[0]).coverUrl} alt={current.title} />}</div><div><h2 className="text-2xl font-semibold">{current.title}</h2><p>{chapters.length} chapters · {chapters.filter(b => store.value<ComicProgress>(`progress:${comicId(b)}`)?.status === 'read').length} read</p><button className={button} disabled={!resume} onClick={() => resume && open(resume)}>{resume ? 'Continue reading' : 'All chapters read'}</button></div></div>
      <label>Folder <select className="app-surface rounded border p-2" value={current.folderId || ''} onChange={e => { const { id, ...value } = current; store.edit(`series:${id}`, { ...value, folderId: e.target.value || null }); }}><option value="">My Books</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <button className={button} onClick={() => { setNewTitle(current.title); setRename(true); }}>Rename series</button>
      {rename && <form onSubmit={e => { e.preventDefault(); const { id, ...value } = current; store.edit(`series:${id}`, { ...value, title: newTitle.trim() }); setRename(false); }}><label>Series title <input className="app-surface rounded border p-2" required value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label> <button className={button}>Save title</button></form>}
      <label className="block">Cover chapter <select className="app-surface rounded border p-2" value={current.coverBookId || ''} onChange={e => { const { id, ...value } = current; store.edit(`series:${id}`, { ...value, coverBookId: e.target.value || null }); }}><option value="">First chapter</option>{chapters.filter(b => !comicId(b).startsWith('local_')).map(b => <option key={b.id} value={comicId(b)}>{store.value<Chapter>(`chapter:${comicId(b)}`)?.title || b.title}</option>)}</select></label>
      {chapters.map((book, index) => { const id = comicId(book); const c = store.value<Chapter>(`chapter:${id}`)!; const p = store.value<ComicProgress>(`progress:${id}`); return <div className="flex flex-wrap items-center justify-between gap-2 border-b app-border py-3" key={id}>
        <button className="text-left" onClick={() => onOpen(book.id)}><strong>{c.volume ? `Vol. ${c.volume} · ` : ''}{c.number ? `${c.number} · ` : ''}{c.title}</strong><p className="text-sm app-muted">{p?.status || 'unread'}{p?.status === 'reading' ? ` · page ${p.page} / ${p.pageCount}` : ''} · {cachedIds.has(book.id) ? book.driveFileId ? 'On device · In Drive' : 'On device' : 'In Drive'}</p></button>
        <details><summary className={`${button} cursor-pointer`}>Chapter actions</summary><div className="flex flex-wrap gap-2 py-2"><button className={button} onClick={() => edit(book)}>Edit chapter details</button><button className={button} onClick={() => store.edit(`progress:${id}`, { page: p?.page || 1, pageCount: p?.pageCount || c.pageCount || 1, status: p?.status === 'read' ? 'unread' : 'read', updatedAt: Date.now() })}>Mark {p?.status === 'read' ? 'unread' : 'read'}</button>
        <button className={button} disabled={index === 0} onClick={() => { const reordered = [...chapters]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; reordered.forEach((b, i) => store.edit(`chapter:${comicId(b)}`, { ...store.value<Chapter>(`chapter:${comicId(b)}`)!, manualOrder: i })); }}>Move up</button>
        <button className={button} onClick={() => store.edit(`chapter:${id}`, { ...c, seriesId: null })}>Remove from series</button>
        <button className={button} onClick={() => { if (window.confirm(`Delete ${c.title}? Other chapters will stay.`)) onDelete(book.id); }}>Delete chapter</button></div></details>
      </div>; })}
    </div>}
    {editing && <div role="dialog" aria-modal="true" aria-label="Edit chapter details" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form className="app-surface w-full max-w-lg space-y-3 rounded-xl border app-border p-5" onSubmit={e => { e.preventDefault(); let target = seriesId; if (target === 'new' && seriesTitle.trim()) { target = crypto.randomUUID(); store.edit(`series:${target}`, { title: seriesTitle.trim(), coverBookId: editing.startsWith('local_') ? null : editing }); } store.edit(`chapter:${editing}`, { ...store.value<Chapter>(`chapter:${editing}`), seriesId: target && target !== 'new' ? target : null, title: title.trim() || 'Chapter', volume, number }); setEditing(null); }}>
      <h3 className="text-xl">Edit chapter details</h3><label className="block">Series <select className="app-surface w-full rounded border p-2" value={seriesId} onChange={e => setSeriesId(e.target.value)}><option value="">No series</option>{series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}<option value="new">Create series…</option></select></label>
      {seriesId === 'new' && <label className="block">Series title<input required className="app-surface w-full rounded border p-2" value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} /></label>}
      {([['Chapter title', title, setTitle], ['Volume', volume, setVolume], ['Chapter number', number, setNumber]] as const).map(([label, value, set]) => <label className="block" key={label}>{label}<input className="app-surface w-full rounded border p-2" value={value} onChange={e => set(e.target.value)} /></label>)}
      <button className={button} type="submit">Save</button> <button className={button} type="button" onClick={() => setEditing(null)}>Cancel</button>
    </form></div>}
  </section>;
}
