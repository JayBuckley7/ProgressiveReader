import { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { useSettings } from "@shared/contexts/SettingsContext";
import { ReaderControls } from "./ReaderControls";
import { TtsControlModal } from "@shared/components/TtsControlModal";
import { SettingsModal } from "@shared/components/SettingsModal";
import { useAppData } from "@shared/contexts/AppDataContext";
import { bookStorageService } from "@features/books/services/bookStorage";
import { useBookContent } from "@features/reader/hooks/useBookContent";
import { initialize as initializeJpdb, highlightContent, removeJpdbHighlighting } from "@features/reader/services/jpdbInitializer";
import { loadConfig as loadJpdbConfig } from "@features/reader/content/api-adapter";
import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";
import { useSwipe } from "@features/reader/hooks/useSwipe";
import { useTranslation } from "@features/reader/hooks/useTranslation";
import { useTextToSpeech } from "@features/reader/hooks/useTextToSpeech";
import { useReadingProgress } from "@features/reader/hooks/useReadingProgress";
import { ReaderHeader } from "./ReaderHeader";
import { BookContent } from "./BookContent";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";
import { PdfViewerHandle } from "@shared/components/PdfViewer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation as useI18n } from "react-i18next";
import { MixSettingsModal } from "./MixSettingsModal";
import { getGlossIndexAsMap, getKnownVocabAsMap, getMirrorMeta } from "@features/jpdbMirror/db";
import type { JpdbKnownVocabRecord, JpdbMirrorMeta } from "@features/jpdbMirror/types";
import { createEnglishSwapHighlighter, type SwapHighlighter } from "@features/reader/utils/englishSwap";
import { getRefineCacheKey, refineAmbiguousSwaps } from "@features/reader/utils/englishSwapRefine";
import { toast } from "sonner";
import { normalizeTranslatedHtml } from "@features/reader/utils/bilingualHtml";
import { useGrammarReadAlong } from "@features/grammar/hooks/useGrammarReadAlong";
import { appLog } from "@shared/appLog";

interface BookReaderProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { books, getReadingProgress, saveBookProgress } = useAppData();
  const bookMetadata = useMemo(() => books.find(b => b.id === bookId), [books, bookId]);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle initial PDF page from URL
  const initialPdfPage = useMemo(() => {
    const pageFromQuery = parseInt(searchParams.get('page') || '1', 10);
    return Math.max(1, pageFromQuery);
  }, [searchParams]);

  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    // The UI label is "Back to Library". In mobile webviews / deep links there may be no
    // meaningful in-app history to navigate back to.
    navigate("/", { replace: true });
  };

  const [localChapter, setLocalChapter] = useState(() => {
    const fromQuery = parseInt(searchParams.get('ch') || '0', 10);
    return currentChapter ?? fromQuery;
  });
   
  const chapter = currentChapter ?? localChapter;

  // Use hooks first - they need to be called before any useEffect that uses their values
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, chapter);
  const { settings } = useSettings();
  
  // PDF page navigation state
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const jpdbInitRef = useRef(false);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [showMixSettings, setShowMixSettings] = useState(false);

  const [mirrorMeta, setMirrorMeta] = useState<JpdbMirrorMeta | null>(null);
  const [mirrorVocabById, setMirrorVocabById] = useState<Map<string, JpdbKnownVocabRecord> | null>(null);
  const [mirrorGlossIndex, setMirrorGlossIndex] = useState<Map<string, string[]> | null>(null);
  const [refinedChoices, setRefinedChoices] = useState<Map<string, string | null>>(() => new Map());
  const swapHighlighterRef = useRef<SwapHighlighter | null>(null);

  // Use extracted hooks
  const {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent,
    clearTranslation,
    applyStoredTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  } = useTranslation(bookId, chapter, currentChapterContent);

  const {
    isSpeaking,
    isPaused,
    ttsRate,
    speakCurrentChapter,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    adjustRate,
    toggleTts,
    handleCloseTtsModal,
  } = useTextToSpeech(contentRef);

  const {
    progressLoaded,
    scrollPositionRef,
    saveProgressTimeoutRef,
  } = useReadingProgress({
    bookId,
    bookMetadata,
    chapter,
    contentRef: contentRef as React.RefObject<HTMLDivElement>,
    getReadingProgress,
    saveBookProgress,
    setLocalChapter,
    setPdfCurrentPage,
    searchParams,
    setSearchParams,
    currentChapter,
    setCurrentChapter,
  });

  useGrammarReadAlong({
    contentRef: contentRef as React.RefObject<HTMLElement>,
    jpdbHighlighted,
    isPdf: bookMetadata?.fileType === "pdf",
    isTranslated,
    contentVersion,
  });

  // Load PDF data when metadata is ready
  useEffect(() => {
    if (!bookMetadata || bookMetadata.fileType !== "pdf" || !progressLoaded) return;

    const load = async () => {
      const blob = await bookStorageService.downloadBook(bookId, bookMetadata);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        setPdfData(arrayBuffer);
        setPdfLoaded(true);
      }
    };

    load();
  }, [bookMetadata, bookId, progressLoaded]);

  useEffect(() => {
    if (pdfLoaded && pdfViewerRef.current && pdfCurrentPage != null) {
      pdfViewerRef.current.goToPage(pdfCurrentPage);
    }
  }, [pdfLoaded, pdfCurrentPage]);

  const updateChapter = useCallback(
    (ch: number) => {
      // Clear any pending progress save before switching chapters
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }

      // If chapter is controlled externally, delegate and exit early
      if (setCurrentChapter) {
        setCurrentChapter(ch);
        return;
      }

      // Update local state and URL
      setLocalChapter(ch);
      const newParams = new URLSearchParams(searchParams);
      newParams.set("ch", String(ch));
      setSearchParams(newParams, { replace: true });

      // Reset scroll position *after* progress for the previous chapter is saved
      setTimeout(() => {
        scrollPositionRef.current = 0;
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }, 0);

      // Save progress for the new chapter starting at position 0
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId,
          ch,
          0,
          undefined,
          undefined,
          bookMetadata.fileType
        );
      }
    },
    [
      setCurrentChapter,
      searchParams,
      setSearchParams,
      setLocalChapter,
      bookId,
      bookMetadata,
      progressLoaded,
      saveBookProgress,
      scrollPositionRef,
      saveProgressTimeoutRef,
    ]
  );


  const killSwitchEnabled = useMemo(() => {
    try {
      return localStorage.getItem("prDisableMix") === "true";
    } catch {
      return false;
    }
  }, []);

	  const mixActive = Boolean(settings?.mixEnabled)
	    && !killSwitchEnabled
	    && !isTranslated
	    && bookMetadata?.fileType !== "pdf"
	    && Boolean(mirrorMeta && mirrorVocabById && mirrorGlossIndex);

	  const normalizedTranslatedHtml = useMemo(() => {
	    if (!translatedContent) return null;
	    try {
	      return normalizeTranslatedHtml(translatedContent);
	    } catch (e) {
	      appLog.warn("[BookReader] Failed to normalize translated HTML; falling back to raw", e);
	      return translatedContent;
	    }
	  }, [translatedContent]);

	  // Translations replace the original content (no bilingual overlay).
	  const activeHtml = isTranslated
	    ? (normalizedTranslatedHtml ?? translatedContent ?? "")
	    : (currentChapterContent ?? "");

	  const rawHtmlNode = useMemo(() => {
	    if (!activeHtml) return null;
	    return <div dangerouslySetInnerHTML={{ __html: activeHtml }} />;
	  }, [activeHtml]);

	  const contentNode = useMemo(() => {
	    if (!activeHtml) return null;

	    // Translations are user/AI-generated HTML and can be malformed. Rendering as raw HTML is
	    // more forgiving than converting into a React element tree, and avoids blank-screen crashes.
	    if (isTranslated) {
	      swapHighlighterRef.current = null;
	      return rawHtmlNode;
	    }

	    if (mixActive && mirrorVocabById && mirrorGlossIndex) {
	      const highlighter = createEnglishSwapHighlighter({
	        bookId,
	        chapter,
	        aggression: settings?.mixAggression ?? 0.25,
        glossIndex: mirrorGlossIndex,
        vocabById: mirrorVocabById,
	        refinedChoices,
	      });
	      swapHighlighterRef.current = highlighter;
	      return parseHtmlToJsx(activeHtml, highlighter.highlightFn);
	    }

	    swapHighlighterRef.current = null;
	    // Always use parseHtmlToJsx without the simple highlighter - let the proper JPDB system handle highlighting
	    return parseHtmlToJsx(activeHtml);
	  }, [
	    bookId,
	    chapter,
	    isTranslated,
	    activeHtml,
	    mixActive,
	    mirrorVocabById,
	    mirrorGlossIndex,
	    refinedChoices,
	    settings?.mixAggression,
	    rawHtmlNode,
	  ]);

	  const jsxContent = useMemo(() => {
	    if (!contentNode) return null;
	    return (
	      <ErrorBoundary
	        resetKeys={[bookId, chapter, isTranslated, contentVersion]}
	        onError={(err) => {
	          appLog.error("[BookReader] Content render error", err);
	        }}
	        fallback={({ error }) => (
	          <div className="text-sm">
	            <div className="mb-3 text-red-600 dark:text-red-400">
	              Render error. Showing raw HTML instead. ({String(error.message || error)})
	            </div>
	            {rawHtmlNode}
	            {isTranslated ? (
	              <div className="mt-4">
	                <button
	                  className="app-button-muted"
	                  onClick={() => clearTranslation({ suppressAutoload: true })}
	                >
	                  Show original
	                </button>
	              </div>
	            ) : null}
	          </div>
	        )}
	      >
	        {contentNode}
	      </ErrorBoundary>
	    );
	  }, [bookId, chapter, clearTranslation, contentNode, contentVersion, isTranslated, rawHtmlNode]);

	  const reloadMirror = useCallback(async () => {
	    try {
	      const meta = await getMirrorMeta();
	      setMirrorMeta(meta);
      if (!meta) {
        setMirrorVocabById(null);
        setMirrorGlossIndex(null);
        return;
      }
      const [vocabById, glossIndex] = await Promise.all([
        getKnownVocabAsMap(),
        getGlossIndexAsMap(),
      ]);
      setMirrorVocabById(vocabById);
      setMirrorGlossIndex(glossIndex);
    } catch (e) {
      appLog.warn("[BookReader] Failed to load JPDB mirror", e);
      setMirrorMeta(null);
      setMirrorVocabById(null);
      setMirrorGlossIndex(null);
    }
  }, []);

  // Refs for current values to avoid effect dependencies
  const bookContentRef = useRef(bookContent);
  const updateChapterRef = useRef(updateChapter);

  // Update refs when values change
  useEffect(() => {
    bookContentRef.current = bookContent;
  }, [bookContent]);

  useEffect(() => {
    updateChapterRef.current = updateChapter;
  }, [updateChapter]);

  // Bump version when content changes so highlighting recalculates
  useEffect(() => {
    setContentVersion(v => v + 1);
  }, [currentChapterContent, translatedContent, settings?.mixEnabled, settings?.mixAggression]);

  // Stamp a render version onto the content node so async highlighter runs can detect staleness.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.dataset.prRenderVersion = String(contentVersion);
  }, [contentVersion]);

  // Load JPDB mirror metadata for mix mode.
  useEffect(() => {
    void reloadMirror();
  }, [reloadMirror]);

  // Load latest refine choices for this book/chapter (if any).
  useEffect(() => {
    try {
      const pointerKey = `prMixRefineLatest:${bookId}:${chapter}`;
      const cacheKey = localStorage.getItem(pointerKey);
      if (!cacheKey) {
        setRefinedChoices(new Map());
        return;
      }
      const raw = localStorage.getItem(cacheKey);
      if (!raw) {
        setRefinedChoices(new Map());
        return;
      }
      const parsed = JSON.parse(raw);
      const choices = parsed?.choices;
      if (!choices || typeof choices !== "object") {
        setRefinedChoices(new Map());
        return;
      }
      const map = new Map<string, string | null>();
      Object.entries(choices as Record<string, any>).forEach(([k, v]) => {
        if (v === null) map.set(k, null);
        else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
      });
      setRefinedChoices(map);
    } catch {
      setRefinedChoices(new Map());
    }
  }, [bookId, chapter]);

  const requestRefine = useCallback(async () => {
    if (!mixActive || !mirrorVocabById || !mirrorGlossIndex) {
      toast.message("Enable mix mode to refine swaps.");
      return;
    }

    const openAiKey = (localStorage.getItem("openaiKey") || "").trim();
    if (!openAiKey) {
      toast.error("OpenAI key required", { description: "Add it in Settings → General." });
      return;
    }

    const highlighter = swapHighlighterRef.current;
    if (!highlighter) {
      toast.message("No ambiguous swaps detected yet.");
      return;
    }

    const ambiguousKeys = highlighter.getAmbiguousGlosses().slice(0, 30);
    if (ambiguousKeys.length === 0) {
      toast.message("No ambiguous swaps detected.");
      return;
    }

    const candidatesByKey: Record<string, Array<{ id: string; spelling: string; reading?: string; meaning?: string }>> = {};
    for (const k of ambiguousKeys) {
      const ids = (mirrorGlossIndex.get(k) || []).slice(0, 3);
      const rows = ids
        .map((id) => {
          const rec = mirrorVocabById.get(id);
          if (!rec) return null;
          return {
            id,
            spelling: rec.spelling,
            reading: rec.reading,
            meaning: rec.meanings?.[0],
          };
        })
        .filter(Boolean) as Array<{ id: string; spelling: string; reading?: string; meaning?: string }>;
      if (rows.length > 0) candidatesByKey[k] = rows;
    }

    const html = currentChapterContent || "";
    const textSample = (() => {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      } catch {
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    })();

    const model = (localStorage.getItem("openaiModel") || "gpt-4o-mini").trim() || "gpt-4o-mini";
    const cacheKey = getRefineCacheKey({
      bookId,
      chapter,
      model,
      textSample,
      ambiguousKeys,
      candidatesByKey: Object.fromEntries(
        Object.entries(candidatesByKey).map(([k, v]) => [k, v.map((x) => ({ id: x.id }))])
      ),
    });

    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const cachedChoices = cached?.choices;
        if (cachedChoices && typeof cachedChoices === "object") {
          const map = new Map<string, string | null>();
          Object.entries(cachedChoices as Record<string, any>).forEach(([k, v]) => {
            if (v === null) map.set(k, null);
            else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
          });
          localStorage.setItem(`prMixRefineLatest:${bookId}:${chapter}`, cacheKey);
          setRefinedChoices(map);
          setContentVersion((v) => v + 1);
          toast.success("Loaded refined swaps (cached)");
          return;
        }
      }

      const toastId = toast.loading("Refining swaps…", { duration: Infinity });
      const choices = await refineAmbiguousSwaps({
        openAiKey,
        model,
        textSample,
        ambiguousKeys,
        candidatesByKey,
      });

      localStorage.setItem(cacheKey, JSON.stringify({ choices, createdAtMs: Date.now() }));
      localStorage.setItem(`prMixRefineLatest:${bookId}:${chapter}`, cacheKey);

      const map = new Map<string, string | null>();
      Object.entries(choices).forEach(([k, v]) => {
        if (v === null) map.set(k, null);
        else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
      });
      setRefinedChoices(map);
      setContentVersion((v) => v + 1);
      toast.success("Refined ambiguous swaps", { id: toastId });
    } catch (e: any) {
      const msg = String(e?.message || e || "Refine failed");
      toast.error("Refine failed", { description: msg });
    }
  }, [
    bookId,
    chapter,
    currentChapterContent,
    mixActive,
    mirrorGlossIndex,
    mirrorVocabById,
  ]);

  const hasOpenAiKey = useMemo(() => {
    try {
      return Boolean((localStorage.getItem("openaiKey") || "").trim());
    } catch {
      return false;
    }
  }, [showMixSettings]);

  // Stable link click handler that doesn't change with chapter updates
  const handleLinkClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    
    if (!link || !link.href) return;

    // If the user is selecting text, don't treat this as a link click.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Check if this is an internal EPUB link
    const href = link.getAttribute('href') || '';
    const isInternalLink = href.startsWith('#') || 
                         href.endsWith('.xhtml') || 
                         href.endsWith('.html') ||
                         href.includes('.xhtml#') ||
                         href.includes('.html#');
    
    if (!isInternalLink) {
      return; // Let external links work normally
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const currentBookContent = bookContentRef.current;
    const contentEl = contentRef.current;
    
    if (!currentBookContent || !contentEl) return;
    
    // Try to find the target chapter
    let targetChapter = -1;
    
    // Method 1: Look for chapter by href in chapterTitles
    if (currentBookContent.chapterTitles) {
      const chapterMatch = currentBookContent.chapterTitles.find(ch => {
        const chapterHref = ch.href || '';
        // Compare the base file name
        const linkBase = href.split('#')[0].split('/').pop() || '';
        const chapterBase = chapterHref.split('#')[0].split('/').pop() || '';
        return linkBase && chapterBase && linkBase === chapterBase;
      });
      
      if (chapterMatch) {
        targetChapter = chapterMatch.index;
      }
    }
    
    // Method 2: Try to parse chapter number from href
    if (targetChapter === -1) {
      const chapterMatch = href.match(/chapter[_-]?(\d+)/i) || 
                         href.match(/ch[_-]?(\d+)/i) ||
                         href.match(/(\d+)\.x?html/i);
      if (chapterMatch) {
        const chapterNum = parseInt(chapterMatch[1], 10);
        if (chapterNum >= 1 && chapterNum <= currentBookContent.totalChapters) {
          targetChapter = chapterNum - 1; // Convert to 0-based index
        }
      }
    }
    
    // Method 3: Look for anchor in current or nearby chapters
    if (targetChapter === -1 && href.startsWith('#')) {
      const anchorId = href.substring(1);
      
      // Check current chapter first
      const currentContent = contentEl.innerHTML;
      if (currentContent.includes(`id="${anchorId}"`)) {
        const anchorEl = contentEl.querySelector(`#${anchorId}`);
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      
      // TODO: Search other chapters if needed (more complex implementation)
    }
    
    // Navigate to the target chapter if found
    if (targetChapter >= 0 && targetChapter < currentBookContent.totalChapters) {
      updateChapterRef.current(targetChapter);
    } else {
      // Show a helpful message to the user
      alert(`Unable to navigate to: ${link.textContent || href}\n\nThis link could not be mapped to a chapter in the current book structure.`);
    }
  }, []); // No dependencies - stable handler

  // Handle internal EPUB links (bind once per book, not per chapter)
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || bookMetadata?.fileType === 'pdf') return;

    // Add click event listener to the content area
    contentEl.addEventListener('click', handleLinkClick);
    
    return () => {
      contentEl.removeEventListener('click', handleLinkClick);
    };
  }, [bookId, bookMetadata?.fileType, handleLinkClick]); // Only rebind when book changes

  // Initialize JPDB highlighter once on mount
  useEffect(() => {
    if (jpdbInitRef.current) return;
    jpdbInitRef.current = true;
    if (contentRef.current) {
      initializeJpdb(contentRef.current);
    }
  }, []);

  // Apply JPDB highlighting when enabled or when content changes while enabled
  // Use useLayoutEffect to coordinate with React's rendering cycle and avoid DOM conflicts
  useLayoutEffect(() => {
    const el = contentRef.current;
    const hasContent = Boolean(el && (el.textContent || "").trim());

    if (jpdbHighlighted && el && hasContent && !isTranslating) {
      // Use requestAnimationFrame to ensure React has finished updating the DOM
      const frameId = requestAnimationFrame(() => {
        if (!el) return;
        highlightContent(el).catch((error) => {
          appLog.error("[BookReader] highlightContent failed", error);
        });
      });
      
      return () => cancelAnimationFrame(frameId);
    } else if (!jpdbHighlighted && el) {
      // Clear highlighting when disabled
      removeJpdbHighlighting(el);
    }
  }, [jpdbHighlighted, currentChapterContent, translatedContent, isTranslated, isTranslating, contentVersion]);

  // Auto-enable JPDB highlighting when mix mode is enabled (one-way).
  useEffect(() => {
    if (!settings?.mixEnabled) return;
    if (!settings.mixAutoEnableHighlight) return;
    setJpdbHighlighted(true);
  }, [settings?.mixEnabled, settings?.mixAutoEnableHighlight]);

  const nextChapter = useCallback(() => {
    if (bookContent && chapter < bookContent.totalChapters - 1) {
      clearTranslation();
      updateChapter(chapter + 1);
    }
  }, [bookContent, chapter, updateChapter, clearTranslation]);

  const prevChapter = useCallback(() => {
    if (chapter > 0) {
      clearTranslation();
      updateChapter(chapter - 1);
    }
  }, [chapter, updateChapter, clearTranslation]);

  // PDF page navigation handlers
  const nextPdfPage = useCallback(() => {
    if (pdfPageCount && pdfCurrentPage < pdfPageCount) {
      const newPage = pdfCurrentPage + 1;
      setPdfCurrentPage(newPage);
      pdfViewerRef.current?.goToPage(newPage);
      
      // Save progress when PDF page changes
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId, 
          newPage - 1, // Use 0-based chapter for consistency
          0, 
          newPage,
          pdfPageCount,
          'pdf'
        );
      }

    }
  }, [pdfPageCount, pdfCurrentPage, bookMetadata, progressLoaded, saveBookProgress, bookId]);

  const prevPdfPage = useCallback(() => {
    if (pdfCurrentPage > 1) {
      const newPage = pdfCurrentPage - 1;
      setPdfCurrentPage(newPage);
      pdfViewerRef.current?.goToPage(newPage);
      
      // Save progress when PDF page changes
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId, 
          newPage - 1, // Use 0-based chapter for consistency
          0, 
          newPage,
          pdfPageCount,
          'pdf'
        );
      }
    }
  }, [pdfCurrentPage, pdfPageCount, bookMetadata, progressLoaded, saveBookProgress, bookId]);



  const toggleJpdbHighlight = useCallback(() => {
    setJpdbHighlighted(prev => {
      const newState = !prev;
      
      // If enabling highlighting, ensure JPDB config is reloaded to get latest settings
      // No need to re-initialize - just reload config since initialization already happened
      if (newState) {
        loadJpdbConfig(); // Just reload config, don't re-initialize
      }
      
      return newState;
    });
  }, [jpdbHighlighted]);

  useSwipe(
    contentRef as React.RefObject<HTMLElement>,
    bookMetadata?.fileType === 'pdf' ? nextPdfPage : nextChapter,
    bookMetadata?.fileType === 'pdf' ? prevPdfPage : prevChapter
  );

  // ✅ ALL HOOKS ARE NOW CALLED - Conditional rendering can happen after this point
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ReaderHeader
        bookContent={bookContent}
        chapter={chapter}
        bookId={bookId}
        isTranslated={isTranslated}
        isAutoloaded={isAutoloaded}
        onBack={handleBack}
        onClearTranslation={() => clearTranslation({ suppressAutoload: true })}
        onShowSettings={() => setShowSettings(true)}
        onToggleTranslation={applyStoredTranslation}
      />

      <BookContent
        bookMetadata={bookMetadata}
        contentRef={contentRef as React.RefObject<HTMLDivElement>}
        jsxContent={jsxContent}
        error={error}
        isLoading={isLoading}
        pdfData={pdfData}
        pdfViewerRef={pdfViewerRef as React.RefObject<PdfViewerHandle>}
        setPdfPageCount={setPdfPageCount}
        settings={settings || undefined}
      />

      {/* Reader Controls */}
      <ReaderControls
          currentChapter={bookMetadata?.fileType === 'pdf' ? pdfCurrentPage - 1 : chapter}
          totalChapters={bookMetadata?.fileType === 'pdf' ? pdfPageCount : bookContent?.totalChapters || 1}
          onPrevChapter={bookMetadata?.fileType === 'pdf' ? prevPdfPage : prevChapter}
          onNextChapter={bookMetadata?.fileType === 'pdf' ? nextPdfPage : nextChapter}
          bookId={bookId}
          chapterTitles={bookMetadata?.fileType === 'pdf' ?
            Array.from({ length: pdfPageCount }, (_, i) => ({ index: i, title: `Page ${i + 1}`, href: '' })) :
            bookContent?.chapterTitles || []}
          onSelectChapter={bookMetadata?.fileType === 'pdf' ? (idx => {
            setPdfCurrentPage(idx + 1);
            pdfViewerRef.current?.goToPage(idx + 1);
          }) : updateChapter}
          onToggleTts={toggleTts}
          ttsActive={isSpeaking}
          onToggleHighlight={toggleJpdbHighlight}
          jpdbHighlighted={jpdbHighlighted}
          onTranslate={() => translateCurrent(lastUseCefr)}
          translating={isTranslating}
          mixEnabled={Boolean(settings?.mixEnabled)}
          onShowMixSettings={() => setShowMixSettings(true)}
      />

      <TtsControlModal
        visible={isSpeaking}
        paused={isPaused}
        rate={ttsRate}
        onPauseResume={() => {
          if (isPaused) {
            resumeSpeaking();
          } else {
            pauseSpeaking();
          }
        }}
        onStop={stopSpeaking}
        onAdjustRate={adjustRate}
        onClose={handleCloseTtsModal}
      />

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={(useCefr) => {
            setLastUseCefr(useCefr);
            translateCurrent(useCefr);
          }}
          translating={isTranslating}
        />
      )}

      <MixSettingsModal
        visible={showMixSettings}
        onClose={() => setShowMixSettings(false)}
        mirrorMeta={mirrorMeta}
        isPdf={bookMetadata?.fileType === "pdf"}
        isTranslated={isTranslated}
        onReloadMirror={reloadMirror}
        onRequestRefine={hasOpenAiKey ? requestRefine : undefined}
      />
    </div>
  );
}

export default BookReader;
