import { useEffect, useState } from "react";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import { type VocabWord } from "../services/vocabBank";

export function ReaderVocabularyPanel() {
  const { drive, driveAuth } = useAppDeps();
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true, version = 0;
    let lastAuth: boolean | undefined;
    const load = (authed: boolean) => {
      if (lastAuth === authed) return;
      lastAuth = authed;
      const request = ++version;
      setWords(null); setError("");
      if (!authed) return;
      void drive.loadVocab().then(result => {
        if (!active || request !== version) return;
        if (!Array.isArray(result)) { setError("Reader vocabulary could not be loaded. Reconnect Drive or retry; existing data is unchanged."); return; }
        setWords(result);
      }).catch(() => { if (active && request === version) setError("Reader vocabulary could not be loaded. Retry when your connection is restored."); });
    };
    const unsubscribe = driveAuth.onAuthStateChange(load);
    if (drive.isSignedIn()) load(true);
    return () => { active = false; version++; unsubscribe(); };
  }, [drive, driveAuth, refresh]);
  const tracked = words?.filter(word => word.saved || word.mastered) || [];
  const matches = tracked.filter(word => `${word.spelling} ${word.reading}`.includes(query.trim()));
  return <section className="app-card p-4 mb-6">
    <h2 className="text-base font-semibold">Reader vocabulary</h2>
    <p className="text-sm app-muted mt-1">Words saved or marked mastered while reading. These are the counts shown in your library.</p>
    {error && <p role="alert" className="mt-2 text-sm text-amber-700">{error}</p>}
    <button className="app-button-muted rounded-md px-3 py-1 text-sm mt-2" onClick={() => setRefresh(value => value + 1)}>Refresh reader vocabulary</button>
    {words === null ? <p className="mt-2 text-sm app-muted">Connect Google Drive to load reader vocabulary.</p> : <>
      <dl aria-label="Reader vocabulary progress" className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div><dt className="text-xs app-muted">Tracked words</dt><dd className="mt-1 text-xl font-semibold">{tracked.length}</dd></div>
        <div><dt className="text-xs app-muted">Mastered</dt><dd className="mt-1 text-xl font-semibold">{tracked.filter(w => w.mastered).length}</dd></div>
        <div><dt className="text-xs app-muted">Saved, not mastered</dt><dd className="mt-1 text-xl font-semibold">{tracked.filter(w => w.saved && !w.mastered).length}</dd></div>
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Browse reader words ({tracked.length})</summary>
        <input className="app-input mt-3 w-full p-2 text-sm" aria-label="Search reader vocabulary" value={query} onChange={e => setQuery(e.target.value)} />
        <ul className="mt-2 max-h-64 overflow-auto divide-y app-border">
          {matches.slice(0, 50).map(word => <li key={`${word.spelling}::${word.reading}`} className="py-2 flex justify-between gap-3 text-sm">
            <span>{word.spelling} <span className="app-muted">{word.reading}</span></span>
            <span className="app-muted">{word.mastered ? "Mastered" : "Saved"}</span>
          </li>)}
        </ul>
        <p className="text-xs app-muted mt-2">{Math.min(50, matches.length)} of {matches.length} words. Search to narrow the list.</p>
      </details>
    </>}
  </section>;
}
