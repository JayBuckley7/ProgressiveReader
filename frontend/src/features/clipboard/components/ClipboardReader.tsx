import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";
import { toast } from "sonner";
import { initialize as initializeJpdb, highlightContent, removeJpdbHighlighting } from "@features/reader/services/jpdbInitializer";
import { useSettings } from "@shared/contexts/SettingsContext";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useTranslation } from "react-i18next";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";

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

export default function ClipboardReader() {
  const { t } = useTranslation();
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
        <div className="flex items-center justify-between gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{t('clipboard.entry')}</span>
          <button
            className="px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={() => handleRemoveEntry(entry.id)}
            title={t('clipboard.removeEntry')}
          >
            {t('clipboard.remove')}
          </button>
        </div>
        <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed break-words">
          {parseHtmlToJsx(entry.html)}
        </div>
      </div>
    ));
  }, [appendMode, entries, sortAscending, t]);

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
      appLog.warn("[ClipboardReader] Clipboard read failed", err);
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
        highlightContent(el).catch((e) => appLog.error("[ClipboardReader] highlightContent error", e));
      });
      return () => cancelAnimationFrame(frame);
    } else if (contentRef.current) {
      // Remove highlighting wrappers
      const el = contentRef.current;
      removeJpdbHighlighting(el);
    }
  }, [jpdbHighlighted, hasAnyContent, contentRevision]);

  // Support Ctrl+V paste events as a fallback when readText is blocked
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || '';
      if (text) {
        const changed = ingestText(text);
        if (changed) {
          toast.success(t('clipboard.toasts.pasted'));
        }
      }
    };
    window.addEventListener('paste', handlePaste as unknown as EventListener);
    return () => window.removeEventListener('paste', handlePaste as unknown as EventListener);
  }, [ingestText, t]);

	  const enableClipboardSync = async () => {
	    // Trigger a permission prompt (when possible) by reading in direct response to a user gesture
	    try {
	      const text = await navigator.clipboard.readText();
	      const changed = ingestText(text);
	      toast.success(changed ? t('clipboard.toasts.permissionGranted') : t('clipboard.toasts.permissionUpToDate'));
	    } catch (e: any) {
	      // Fallback to manual paste area
	      pasteAreaRef.current?.focus();
	      notifyError(e, { title: t('clipboard.toasts.blocked') });
	    }
	  };

	  const handlePasteClick = async () => {
	    try {
	      const text = await navigator.clipboard.readText();
	      const changed = ingestText(text);
	      if (changed) {
	        toast.success(t('clipboard.toasts.pasted'));
	      }
	    } catch (e) {
	      notifyError(e, { title: t('clipboard.toasts.denied') });
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
        notifyError(t('clipboard.toasts.nothingToSave'));
        return;
      }
      if (!isAuthenticated) {
        try {
          await signIn();
        } catch (error) {
          notifyError(error, { title: t('clipboard.toasts.signInRequired') });
          return;
        }
      }
      const title = buildTitleFromText(cleaned);
      const fileName = `${title}.txt`;
      const file = new File([cleaned], fileName, { type: 'text/plain;charset=utf-8' });
      const meta = { title, fileType: 'txt' } as any;
      const result = await uploadBook(file, meta);
      if (result) {
        toast.success(t('clipboard.toasts.saved'));
      }
    } catch (e: any) {
      appLog.error("[ClipboardReader] Save to library failed", e);
      notifyError(e, { title: t('clipboard.toasts.saveFailed') });
    }
  };

  const buttonBase = "min-h-9 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const secondaryButtonClass = `${buttonBase} bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600`;
  const primaryButtonClass = `${buttonBase} bg-blue-600 text-white hover:bg-blue-700`;
  const saveButtonClass = `${buttonBase} bg-green-600 text-white hover:bg-green-700`;
  const controlClass = "flex min-h-10 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-sm leading-tight text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300";
  const checkboxClass = "h-4 w-4 shrink-0 accent-gray-700 dark:accent-gray-300";
  const selectClass = "ml-auto h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

  const renderOptionControls = () => (
    <>
      <label className={controlClass} title={!canAutoRefresh ? t('clipboard.grantTip') : ''}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={enabled && canAutoRefresh}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canAutoRefresh}
        />
        <span className="min-w-0">{t('clipboard.autoRefresh')}</span>
      </label>

      <label className={controlClass}>
        <span className="min-w-0">{t('clipboard.interval')}</span>
        <select
          value={pollMs}
          onChange={(e) => setPollMs(Number(e.target.value))}
          disabled={!canAutoRefresh}
          className={selectClass}
        >
          <option value={1000}>1s</option>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
        </select>
      </label>

      <label className={controlClass} title={t('clipboard.stack')}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={appendMode}
          onChange={(e) => handleToggleAppend(e.target.checked)}
        />
        <span className="min-w-0">{t('clipboard.stack')}</span>
      </label>

      <label className={controlClass} title={t('clipboard.oldestFirst')}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={sortAscending}
          onChange={(e) => setSortAscending(e.target.checked)}
          disabled={!appendMode}
        />
        <span className="min-w-0">{t('clipboard.oldestFirst')}</span>
      </label>

      <button
        onClick={handleClearContent}
        className={secondaryButtonClass}
      >
        {t('clipboard.clear')}
      </button>

      <label className={controlClass}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={jpdbHighlighted}
          onChange={(e) => setJpdbHighlighted(e.target.checked)}
        />
        <span className="min-w-0">{t('clipboard.highlight')}</span>
      </label>
    </>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="bg-white dark:bg-gray-800 border-b px-3 sm:px-4 py-3 flex-shrink-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
              {t('clipboard.title')}
            </h1>
            <div className="mt-0.5 text-xs text-gray-500 truncate">
              {rawText ? t('clipboard.chars', { count: rawText.length }) : t('clipboard.noText')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          {!isSecure && (
            <span className="col-span-2 text-xs text-red-600 dark:text-red-400 sm:col-span-1" title={t('clipboard.insecureTitle')}>
              {t('clipboard.insecure')}
            </span>
          )}
          {(permissionState === 'denied' || permissionState === 'unknown') && isSecure && (
            <button
              onClick={enableClipboardSync}
              className={primaryButtonClass}
            >
              {t('clipboard.enable')}
            </button>
          )}
          <button
            onClick={handlePasteClick}
            className={secondaryButtonClass}
          >
            {t('clipboard.pasteNow')}
          </button>
          <button
            onClick={saveToLibrary}
            className={saveButtonClass}
            title={t('clipboard.saveTitle')}
          >
            {t('clipboard.save')}
          </button>
          </div>
        </div>

        <details className="mt-3 sm:hidden">
          <summary className="cursor-pointer rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {t('clipboard.options', { defaultValue: 'Options' })}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {renderOptionControls()}
          </div>
        </details>

        <div className="mt-3 hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {renderOptionControls()}
        </div>
      </div>
      <div
        ref={contentRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-24 px-4 sm:px-4 md:px-8 lg:px-16 touch-pan-y"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
          fontFamily: settings?.fontFamily || 'Inter',
        }}
      >
        <div className="w-full max-w-4xl mx-auto py-4 sm:py-6 md:py-8 break-words">
          {hasAnyContent ? (
            appendMode ? (
              <div className="min-w-0">
                {renderedEntries}
              </div>
            ) : (
              <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed break-words">
                {jsx}
              </div>
            )
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 py-8">
              {(permissionState === 'denied' || !isSecure || permissionState === 'unknown') ? (
                <>
                  <div className="mb-2">{t('clipboard.blockedTitle')}</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>{t('clipboard.blockedSteps.https')}</li>
                    {isSecure && <li>{t('clipboard.blockedSteps.enable')}</li>}
                    <li>{t('clipboard.blockedSteps.paste')}</li>
                  </ol>
                </>
              ) : (
                <>{t('clipboard.hint')}</>
              )}
            </div>
          )}
          <textarea
            ref={pasteAreaRef}
            className="w-full mt-4 p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            rows={3}
            placeholder={t('clipboard.blockedSteps.paste')}
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
