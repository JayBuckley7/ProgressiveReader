import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useEffect, useState, useRef } from "react";
import jpHighlighter from "../../../src/jp-highlighter";
import { useSettings } from "../contexts/SettingsContext";
import { ReaderControls } from "./ReaderControls";
import { SettingsModal } from "./SettingsModal";

interface BookReaderProps {
  bookId: Id<"books">;
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter }: BookReaderProps) {
  const book = useQuery(api.books.get, { bookId });
  const chapter = useQuery(api.books.getChapter, { bookId, chapterIndex: currentChapter });
  const progress = useQuery(api.reading.getProgress, { bookId });
  const updateProgress = useMutation(api.reading.updateProgress);
  const { settings } = useSettings();
  
  const [showSettings, setShowSettings] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);

  // Update reading progress
  useEffect(() => {
    const updateProgressDebounced = setTimeout(() => {
      updateProgress({
        bookId,
        currentChapter,
        currentPosition: scrollPosition,
      });
    }, 1000);

    return () => clearTimeout(updateProgressDebounced);
  }, [bookId, currentChapter, scrollPosition, updateProgress]);

  // Handle scroll tracking
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setScrollPosition(contentRef.current.scrollTop);
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener('scroll', handleScroll);
      return () => content.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Initialize JPDB highlighter
  useEffect(() => {
    if (contentRef.current) {
      jpHighlighter.initialize(contentRef.current);
    }
  }, []);

  // Restore scroll position from progress
  useEffect(() => {
    if (progress && contentRef.current && currentChapter === progress.currentChapter) {
      contentRef.current.scrollTop = progress.currentPosition;
    }
  }, [progress, currentChapter]);

  /**
   * Translate the current chapter using the backend API.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = async (useCefr: boolean) => {
    if (!contentRef.current || !chapter) return;
    setIsTranslating(true);
    const payload: any = {
      content: contentRef.current.innerHTML,
      target_language: settings?.targetLanguage || "English",
      model: localStorage.getItem("openaiModel") || "gpt-4o-mini",
      api_key: localStorage.getItem("openaiKey") || "",
    };
    if (useCefr) {
      payload.cefr_level = localStorage.getItem("cefrLevel") || "B2";
    }
    try {
      const resp = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.translated_text && contentRef.current) {
          contentRef.current.innerHTML = data.translated_text;
        }
      }
    } finally {
      setIsTranslating(false);
    }
  };

  if (!book) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const nextChapter = () => {
    if (currentChapter < book.totalChapters - 1) {
      setCurrentChapter(currentChapter + 1);
    }
  };

  const prevChapter = () => {
    if (currentChapter > 0) {
      setCurrentChapter(currentChapter - 1);
    }
  };

  const toggleHighlight = async () => {
    if (!contentRef.current) return;
    if (!jpdbHighlighted) {
      await jpHighlighter.highlightContent(contentRef.current);
    } else {
      const saved = contentRef.current.getAttribute('data-original-content');
      if (saved) {
        contentRef.current.innerHTML = saved;
      }
    }
    setJpdbHighlighted(!jpdbHighlighted);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Reader Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex-1">
          <h1 className="font-semibold text-gray-900 dark:text-white truncate">
            {book.title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Chapter {currentChapter + 1} of {book.totalChapters}
          </p>
        </div>
        
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Reader Content */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
          fontFamily: settings?.fontFamily || 'Inter',
        }}
      >
        <div className="max-w-4xl mx-auto py-8">
          {chapter ? (
            <div className="prose prose-lg dark:prose-invert max-w-none">
              <h2 className="text-2xl font-bold mb-6">{chapter.title}</h2>
              <div 
                className="leading-relaxed"
                dangerouslySetInnerHTML={{ __html: chapter.content }}
              />
            </div>
          ) : (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      </div>

      {/* Reader Controls */}
      <ReaderControls
        currentChapter={currentChapter}
        totalChapters={book.totalChapters}
        onPrevChapter={prevChapter}
        onNextChapter={nextChapter}
        bookId={bookId}
        jpdbHighlighted={jpdbHighlighted}
        onToggleHighlight={toggleHighlight}
      />

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={(useCefr) => translateCurrent(useCefr)}
          translating={isTranslating}
        />
      )}
    </div>
  );
}
