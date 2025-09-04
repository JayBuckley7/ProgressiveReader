import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseHtmlToJsx } from "../utils/htmlToJsx";
import { toast } from "sonner";
import { initialize as initializeJpdb, highlightContent } from "~/index.ts";
import { useSettings } from "../contexts/SettingsContext";
import { useAppData } from "../contexts/AppDataContext";

// Simple sanitizer to wrap plain text in paragraphs
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  return `<p>${escaped}</p>`;
}

// Strip HTML-like tags from plain text while preserving inner content
function sanitizeClipboardText(input: string): string {
  if (!input) return "";
  let out = input;
  // Normalize NBSPs and full-width spaces
  out = out.replace(/\u00A0/g, ' ').replace(/[\u3000]/g, ' ');
  // Remove simple HTML/XML-like tags such as <color=#fff>...</color>, <b>, </i>, etc.
  out = out.replace(/<[^>]*>/g, '');
  // Collapse runs of spaces/tabs (preserve newlines)
  out = out.replace(/[\t ]{2,}/g, ' ');
  // Trim per-line
  out = out.split('\n').map(line => line.trimEnd()).join('\n');
  return out.trim();
}

export function ClipboardReader() {
  const [rawText, setRawText] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [entries, setEntries] = useState<Array<{ id: string; html: string; raw: string }>>([]);
  const [appendMode, setAppendMode] = useState<boolean>(true);
  const [sortAscending, setSortAscending] = useState<boolean>(false);
  const [contentRevision, setContentRevision] = useState<number>(0);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [pollMs, setPollMs] = useState<number>(2000);
  const [jpdbHighlighted, setJpdbHighlighted] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const contentRef = useRef<HTMLDivElement>(null);
  const jpdbInitRef = useRef(false);
  const lastClipboardRef = useRef<string>("");
  const intervalRef = useRef<number | null>(null);
  const { settings } = useSettings();
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const { uploadBook, isAuthenticated, signIn } = useAppData();

  const jsx = useMemo(() => {
    if (!html) return null;
    return parseHtmlToJsx(html);
  }, [html]);

  const renderedEntries = useMemo(() => {
    if (!appendMode) return null;
    const displayEntries = sortAscending ? [...entries].reverse() : entries;
    return displayEntries.map(entry => (
      <div key={entry.id} className="mb-6 last:mb-0">
        <div className="flex items-center justify-between mb-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Entry</span>
          <button
            className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={() => handleRemoveEntry(entry.id)}
            title="Remove this entry"
          >
            Remove
          </button>
        </div>
        <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
          {parseHtmlToJsx(entry.html)}
        </div>
      </div>
    ));
  }, [appendMode, entries, sortAscending]);

  const hasAnyContent = appendMode ? entries.length > 0 : !!html;

  const ingestText = useCallback((text: string): boolean => {
    const cleaned = sanitizeClipboardText(text);
    if (cleaned === lastClipboardRef.current) {
      return false;
    }
    lastClipboardRef.current = cleaned;
    setRawText(cleaned);
    if (appendMode) {
      setEntries(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, html: textToHtml(cleaned), raw: cleaned }, ...prev].slice(0, 100));
    } else {
      setHtml(textToHtml(cleaned));
    }
    setContentRevision(r => r + 1);
    return true;
  }, [appendMode]);

  const readClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === "string") {
        ingestText(text);
      }
    } catch (err: any) {
      // Permission or focus errors are common; only surface once
      console.warn("Clipboard read failed:", err);
    }
  }, [ingestText]);

  // Track clipboard-read permission status when supported
  useEffect(() => {
    let mounted = true;
    const perms: any = (navigator as any).permissions;
    if (perms && perms.query) {
      perms.query({ name: 'clipboard-read' as any }).then((status: any) => {
        if (!mounted) return;
        setPermissionState(status.state as any);
        status.onchange = () => setPermissionState(status.state as any);
      }).catch(() => {
        if (!mounted) return;
        setPermissionState('unknown');
      });
    }
    return () => { mounted = false; };
  }, []);

  const canAutoRefresh = isSecure && permissionState === 'granted';

  useEffect(() => {
    if (!enabled || !canAutoRefresh) return;
    // Attempt initial read immediately
    readClipboard();
    // Set up polling to detect external changes to clipboard
    const id = window.setInterval(readClipboard, pollMs) as unknown as number;
    intervalRef.current = id;
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollMs, readClipboard, canAutoRefresh]);

  // One-time JPDB init
  useEffect(() => {
    if (jpdbInitRef.current) return;
    if (contentRef.current) {
      jpdbInitRef.current = true;
      initializeJpdb(contentRef.current);
    }
  }, []);

  // Apply JPDB highlighting when toggled and content exists
  useEffect(() => {
    if (jpdbHighlighted) {
      if (!contentRef.current || !hasAnyContent) return;
      const el = contentRef.current;
      const frame = requestAnimationFrame(() => {
        highlightContent(el).catch((e) => console.error("highlightContent error", e));
      });
      return () => cancelAnimationFrame(frame);
    } else if (contentRef.current) {
      // Remove highlighting wrappers
      const el = contentRef.current;
      const jpdbElements = el.querySelectorAll('.jpdb-word');
      jpdbElements.forEach(node => {
        const parent = node.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(node.textContent || ''), node);
        }
      });
      if (el.normalize) el.normalize();
    }
  }, [jpdbHighlighted, hasAnyContent, contentRevision]);

  // Support Ctrl+V paste events as a fallback when readText is blocked
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || '';
      if (text) {
        const changed = ingestText(text);
        if (changed) {
          toast.success("Pasted from clipboard");
        }
      }
    };
    window.addEventListener('paste', handlePaste as unknown as EventListener);
    return () => window.removeEventListener('paste', handlePaste as unknown as EventListener);
  }, [ingestText]);

  const enableClipboardSync = async () => {
    // Trigger a permission prompt (when possible) by reading in direct response to a user gesture
    try {
      const text = await navigator.clipboard.readText();
      const changed = ingestText(text);
      toast.success(changed ? 'Clipboard permission granted' : 'Clipboard already up to date');
    } catch (e: any) {
      // Fallback to manual paste area
      pasteAreaRef.current?.focus();
      toast.error('Clipboard blocked. Press Ctrl+V to paste into the box below.');
    }
  };

  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const changed = ingestText(text);
      if (changed) {
        toast.success("Pasted from clipboard");
      }
    } catch (e) {
      toast.error("Clipboard access denied. Click the page and try again.");
    }
  };

  const handleToggleAppend = (checked: boolean) => {
    setAppendMode(checked);
    // Move current content into list when enabling
    if (checked) {
      setEntries(prev => (html ? [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, html, raw: rawText }, ...prev] : prev));
      setHtml("");
    } else {
      // When disabling, keep the newest entry as the single view if present
      setHtml(entries[0]?.html || "");
    }
    setContentRevision(r => r + 1);
  };

  const handleClearContent = () => {
    setEntries([]);
    setHtml("");
    setRawText("");
    setContentRevision(r => r + 1);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setContentRevision(r => r + 1);
  };

  const buildTitleFromText = (text: string): string => {
    const firstLine = (text.split('\n').find(l => l.trim().length > 0) || 'Clipboard Paste').trim();
    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, '0');
    const d = String(ts.getDate()).padStart(2, '0');
    const titleBase = firstLine.slice(0, 80);
    return `${titleBase} (${y}-${m}-${d})`;
  };

  const saveToLibrary = async () => {
    try {
      const text = appendMode ? (sortAscending ? [...entries].reverse() : entries).map(e => e.raw).join('\n\n') : rawText;
      const cleaned = sanitizeClipboardText(text);
      if (!cleaned) {
        toast.error('Nothing to save');
        return;
      }
      if (!isAuthenticated) {
        try { await signIn(); } catch { toast.error('Please sign in to upload books'); return; }
      }
      const title = buildTitleFromText(cleaned);
      const fileName = `${title}.txt`;
      const file = new File([cleaned], fileName, { type: 'text/plain;charset=utf-8' });
      const meta = { title, fileType: 'txt' } as any;
      const result = await uploadBook(file, meta);
      if (result) {
        toast.success('Saved to your library');
      }
    } catch (e: any) {
      console.error('Save to library failed:', e);
      toast.error('Failed to save to library');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="bg-white dark:bg-gray-800 border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
            Clipboard Reader
          </h1>
          <span className="text-xs text-gray-500 ml-2 truncate">
            {rawText ? `${rawText.length} chars` : "No clipboard text yet"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isSecure && (
            <span className="text-xs text-red-600 dark:text-red-400" title="Clipboard requires HTTPS or localhost">
              Insecure context
            </span>
          )}
          {(permissionState === 'denied' || permissionState === 'unknown') && isSecure && (
            <button
              onClick={enableClipboardSync}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Enable Clipboard
            </button>
          )}
          <button
            onClick={handlePasteClick}
            className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Paste Now
          </button>
          <button
            onClick={saveToLibrary}
            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
            title="Save current clipboard text as a .txt book in your library"
          >
            Save to Library
          </button>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300" title={!canAutoRefresh ? 'Grant clipboard permission to enable auto-refresh' : ''}>
            <input
              type="checkbox"
              checked={enabled && canAutoRefresh}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canAutoRefresh}
            />
            Auto-refresh
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
            Interval
            <select
              value={pollMs}
              onChange={(e) => setPollMs(Number(e.target.value))}
              disabled={!canAutoRefresh}
              className="text-xs bg-transparent border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-60"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300" title="Prepend new pastes at the top">
            <input
              type="checkbox"
              checked={appendMode}
              onChange={(e) => handleToggleAppend(e.target.checked)}
            />
            Stack pastes
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300" title="Display oldest entries first">
            <input
              type="checkbox"
              checked={sortAscending}
              onChange={(e) => setSortAscending(e.target.checked)}
              disabled={!appendMode}
            />
            Oldest first
          </label>
          <button
            onClick={handleClearContent}
            className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Clear
          </button>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={jpdbHighlighted}
              onChange={(e) => setJpdbHighlighted(e.target.checked)}
            />
            JPDB highlight
          </label>
        </div>
      </div>
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto pb-24 px-3 sm:px-4 md:px-8 lg:px-16 touch-pan-y"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
          fontFamily: settings?.fontFamily || 'Inter',
        }}
      >
        <div className="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
          {hasAnyContent ? (
            appendMode ? (
              <div>
                {renderedEntries}
              </div>
            ) : (
              <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
                {jsx}
              </div>
            )
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 py-8">
              {(permissionState === 'denied' || !isSecure || permissionState === 'unknown') ? (
                <>
                  <div className="mb-2">Browser blocked clipboard access.</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Ensure you're on HTTPS or localhost.</li>
                    {isSecure && <li>Click "Enable Clipboard" and allow the prompt.</li>}
                    <li>Or click the area below and press Ctrl+V.</li>
                  </ol>
                </>
              ) : (
                <>Click "Paste Now" to load clipboard text, or press Ctrl+V.</>
              )}
            </div>
          )}
          <textarea
            ref={pasteAreaRef}
            className="w-full mt-4 p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            rows={3}
            placeholder="Or focus here and press Ctrl+V..."
            onPaste={(e) => {
              const text = e.clipboardData?.getData('text') || '';
              if (text) {
                ingestText(text);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default ClipboardReader;


