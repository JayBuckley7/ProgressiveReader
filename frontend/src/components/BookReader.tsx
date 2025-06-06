import { useEffect, useState, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { ReaderControls } from "./ReaderControls";
import { TtsControlModal } from "./TtsControlModal";
import { SettingsModal } from "./SettingsModal";
import { useBookContent } from "../hooks/useBookContent";
import { initialize as initializeJpdb, highlightContent } from "~/index";

interface BookReaderProps {
  bookId: string; // Was: Id<"books">
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
  onBack: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  // Use the new useBookContent hook instead of placeholder data
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, currentChapter);

  // TODO: Progress tracking - replace with real API calls
  const progress = { currentChapter: 0, currentPosition: 0 };
  const updateProgress = async (data: any) => { console.log("Update progress (TODO):", data); };

  const { settings } = useSettings();
  
  const [show_settings, set_show_settings] = useState(false);
  const [scroll_position, set_scroll_position] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [is_translating, set_is_translating] = useState(false);
  const [is_translated, set_is_translated] = useState(false); // Track if current content is translated
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [jpdb_highlighted, set_jpdb_highlighted] = useState(false);

  // Swipe control state
  const swipeRef = useRef({
    startX: null as number | null,
    startY: null as number | null,
    startTime: null as number | null,
    isSwiping: false
  });

  // Update reading progress
  useEffect(() => {
    const updateProgressDebounced = setTimeout(() => {
      // updateProgress({
      //   bookId,
      //   currentChapter,
      //   currentPosition: scroll_position,
      // });
      // TODO: Call Flask API to update progress
      console.log("Debounced update progress (TODO):", { bookId, currentChapter, scroll_position });
    }, 1000);

    return () => clearTimeout(updateProgressDebounced);
  }, [bookId, currentChapter, scroll_position, /* updateProgress */]); // Removed updateProgress from dependencies for now

  // Clear translated content when chapter changes
  useEffect(() => {
    if (is_translated) {
      console.log('Chapter changed - clearing translated content');
      set_is_translated(false);
      setTranslatedContent(null);
    }
  }, [currentChapter]);

  // Handle scroll tracking
  useEffect(() => {
    const handle_scroll = () => {
      if (contentRef.current) {
        set_scroll_position(contentRef.current.scrollTop);
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener('scroll', handle_scroll);
      return () => content.removeEventListener('scroll', handle_scroll);
    }
  }, []);

  // Initialize JPDB highlighter
  useEffect(() => {
    if (contentRef.current) {
      initializeJpdb(contentRef.current);
    }
  }, []);

  // Apply JPDB highlighting when user explicitly enables it
  useEffect(() => {
    console.log('🔍 JPDB highlighting effect triggered:', {
      hasContentRef: !!contentRef.current,
      jpdb_highlighted,
      hasChapterContent: !!currentChapterContent,
      hasTranslatedContent: !!translatedContent,
      is_translated,
      is_translating
    });

    // ONLY run highlighting when user explicitly enables it (jpdb_highlighted becomes true)
    // Do NOT run on content changes unless highlighting is already enabled
    if (jpdb_highlighted && contentRef.current && !is_translating) {
      const contentElement = contentRef.current.querySelector('.prose');
      console.log('🔍 Content element found:', !!contentElement);
      console.log('🔍 Current content state:', { 
        hasOriginal: !!currentChapterContent, 
        hasTranslated: !!translatedContent, 
        is_translated 
      });
      
      if (contentElement) {
        console.log('🔍 About to call highlightContent on', is_translated ? 'translated' : 'original', 'content...');
        // Use longer timeout to ensure React has finished all re-renders
        const timeoutId = setTimeout(async () => {
          try {
            // Double-check the element still exists and has content
            const freshElement = contentRef.current?.querySelector('.prose') as HTMLElement;
            if (freshElement && freshElement.textContent && freshElement.textContent.trim()) {
              console.log('🔍 Proceeding with highlighting, element text length:', freshElement.textContent.length);
              
              // CRITICAL: Preserve the current content before highlighting
              // This ensures we don't lose translations when highlighting is applied
              const currentContent = freshElement.innerHTML;
              
              // Store the appropriate original content based on current state
              if (is_translated && translatedContent) {
                // If we're highlighting translated content, store the translated content as "original"
                // so that when highlighting is removed, we get back the translation, not the raw original
                freshElement.setAttribute('data-original-content', translatedContent);
              } else if (currentChapterContent) {
                // If we're highlighting original content, store the original content
                freshElement.setAttribute('data-original-content', currentChapterContent);
              }
              
              await highlightContent(freshElement);
              console.log('✅ highlightContent completed successfully');
            } else {
              console.warn('⚠️ Content element is empty or missing when trying to highlight');
            }
          } catch (error) {
            console.error('❌ Error in highlightContent:', error);
          }
        }, 300); // Increased timeout to ensure React is done rendering
        return () => clearTimeout(timeoutId);
      } else {
        console.warn('⚠️ Could not find .prose element in contentRef');
        console.log('Available elements:', contentRef.current.querySelector('*'));
      }
    }
  }, [jpdb_highlighted]); // ONLY depend on jpdb_highlighted state changes

  // Restore scroll position from progress
  useEffect(() => {
    if (progress && contentRef.current && currentChapter === progress.currentChapter) {
      contentRef.current.scrollTop = progress.currentPosition;
    }
  }, [progress, currentChapter]);

  // Swipe controls implementation
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || !bookContent) return;

    const minLockDistance = 10;
    const minSwipeDistance = 60;
    const minVelocity = 0.3;

    const handle_pointer_down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      
      // Ignore swipes on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      swipeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: e.timeStamp,
        isSwiping: false
      };
    };

    const handle_pointer_move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || swipeRef.current.startX === null) return;

      const dx = e.clientX - swipeRef.current.startX;
      const dy = e.clientY - swipeRef.current.startY!;

      if (!swipeRef.current.isSwiping) {
        if (Math.abs(dx) > minLockDistance && Math.abs(dx) > Math.abs(dy)) {
          swipeRef.current.isSwiping = true;
          if (e.cancelable) e.preventDefault();
        } else if (Math.abs(dy) > minLockDistance && Math.abs(dy) > Math.abs(dx)) {
          swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
        }
      } else {
        if (e.cancelable) e.preventDefault();
      }
    };

    const handle_pointer_up = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || swipeRef.current.startX === null || !swipeRef.current.isSwiping) {
        swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
        return;
      }

      const dx = e.clientX - swipeRef.current.startX;
      const dt = e.timeStamp - swipeRef.current.startTime!;
      const velocity = dt > 0 ? Math.abs(dx) / dt : 0;

      if (Math.abs(dx) > minSwipeDistance && velocity > minVelocity) {
        if (dx < 0) {
          // Swipe left - next chapter
          nextChapter();
        } else {
          // Swipe right - previous chapter
          prevChapter();
        }
      }

      swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
    };

    contentEl.addEventListener('pointerdown', handle_pointer_down);
    contentEl.addEventListener('pointermove', handle_pointer_move);
    contentEl.addEventListener('pointerup', handle_pointer_up);

    return () => {
      contentEl.removeEventListener('pointerdown', handle_pointer_down);
      contentEl.removeEventListener('pointermove', handle_pointer_move);
      contentEl.removeEventListener('pointerup', handle_pointer_up);
    };
  }, [bookContent, currentChapter]);

  /**
   * Translate the current chapter using the backend API.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = async (useCefr: boolean) => {
    if (!currentChapterContent) return;
    set_is_translating(true);

    // Always translate from the original chapter HTML
    const contentToTranslate = currentChapterContent;
    
    const payload: any = {
      content: contentToTranslate,
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
        if (data.translated_text) {
          setTranslatedContent(`
            <div class="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
              <div class="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
                ${data.translated_text}
              </div>
            </div>
          `);
          set_is_translated(true);
          console.log('Content translated and marked as translated');
        }
      }
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      set_is_translating(false);
    }
  };


  // -------------------------------
  // Text-to-Speech functionality
  // -------------------------------

  const [is_speaking, set_is_speaking] = useState(false);
  const [is_paused, set_is_paused] = useState(false);
  const [tts_rate, set_tts_rate] = useState(settings?.ttsSpeed || 1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaSessionSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  const tts_rateRef = useRef(tts_rate);
  useEffect(() => {
    tts_rateRef.current = tts_rate;
  }, [tts_rate]);

  const textNodeMapRef = useRef<{ node: Text; start: number }[]>([]);
  const contentTextRef = useRef('');
  const currentIndexRef = useRef(0);
  const fallbackHighlightElRef = useRef<HTMLElement | null>(null);
  const fallbackIntervalRef = useRef<number | null>(null);
  const boundarySupportedRef = useRef(false);
  const boundaryCheckedRef = useRef(false);

  const selectVoiceForText = (text: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const isJapanese = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(text);
    const isChinese = /[\u4E00-\u9FFF]/.test(text) && !isJapanese;
    const isKorean = /[\uAC00-\uD7AF]/.test(text);

    if (isJapanese) {
      return voices.find(v => v.lang.startsWith('ja')) || null;
    }
    if (isChinese) {
      return voices.find(v => v.lang.startsWith('zh')) || null;
    }
    if (isKorean) {
      return voices.find(v => v.lang.startsWith('ko')) || null;
    }
    return (
      voices.find(v =>
        ['en', 'es', 'fr', 'de', 'it', 'pt', 'da', 'sv', 'nl', 'fi', 'no'].some(prefix =>
          v.lang.toLowerCase().startsWith(prefix)
        )
      ) || voices[0] || null
    );
  };

  const buildIndexMap = (element: HTMLElement) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const map: { node: Text; start: number }[] = [];
    let index = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      map.push({ node, start: index });
      index += node.textContent?.length || 0;
    }
    return map;
  };

  const findNodeOffset = (map: { node: Text; start: number }[], charIndex: number) => {
    for (let i = map.length - 1; i >= 0; i--) {
      if (charIndex >= map[i].start) {
        return { node: map[i].node, offset: charIndex - map[i].start };
      }
    }
    return { node: map[0].node, offset: 0 };
  };

  const clearHighlight = () => {
    const h = (window as any).CSS?.highlights;
    if (h) {
      h.delete('tts-current-word');
    } else if (fallbackHighlightElRef.current) {
      const parent = fallbackHighlightElRef.current.parentNode;
      if (parent) {
        while (fallbackHighlightElRef.current.firstChild) {
          parent.insertBefore(
            fallbackHighlightElRef.current.firstChild,
            fallbackHighlightElRef.current
          );
        }
        parent.removeChild(fallbackHighlightElRef.current);
      }
      fallbackHighlightElRef.current = null;
    }
  };

  const highlightAtIndex = (index: number) => {
    clearHighlight();
    const remaining = contentTextRef.current.slice(index);
    const match = remaining.match(/\S+/);
    if (!match) return;
    const word = match[0];
    const start = index;
    const end = index + word.length;
    const startPos = findNodeOffset(textNodeMapRef.current, start);
    const endPos = findNodeOffset(textNodeMapRef.current, end);
    const range = document.createRange();
    try {
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      const h = (window as any).CSS?.highlights;
      if (h) {
        const hl = new (window as any).Highlight(range);
        h.set('tts-current-word', hl);
      } else {
        const span = document.createElement('span');
        span.className = 'tts-highlight';
        range.surroundContents(span);
        fallbackHighlightElRef.current = span;
      }
    } catch (err) {
      console.warn('Unable to highlight range', err);
    }
  };

  const startFallbackHighlighting = (startIndex: number) => {
    const words = contentTextRef.current.slice(startIndex).match(/\S+\s*/g);
    if (!words) return;
    let offset = startIndex;
    let i = 0;
    currentIndexRef.current = offset;
    highlightAtIndex(offset);
    fallbackIntervalRef.current = window.setInterval(() => {
      i++;
      if (i >= words.length) {
        stopFallbackHighlighting();
        return;
      }
      offset += words[i - 1].length;
      currentIndexRef.current = offset;
      highlightAtIndex(offset);
    }, 300 / tts_rateRef.current);
  };

  const stopFallbackHighlighting = () => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  };

  const detectBoundaryEventSupport = (): Promise<boolean> => {
    if (boundaryCheckedRef.current) {
      return Promise.resolve(boundarySupportedRef.current);
    }
    boundaryCheckedRef.current = true;
    let detected = false;
    let resolved = false;
    return new Promise((resolve) => {
      try {
        const testUtter = new SpeechSynthesisUtterance('test');
        testUtter.volume = 0;
        testUtter.rate = 10;
        testUtter.onboundary = () => {
          detected = true;
        };
        speechSynthesis.speak(testUtter);
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            if (speechSynthesis.speaking) {
              speechSynthesis.cancel();
            }
            boundarySupportedRef.current = detected;
            resolved = true;
            resolve(boundarySupportedRef.current);
          }
        }, 1000);
        testUtter.onend = () => {
          if (!resolved) {
            clearTimeout(timeoutId);
            boundarySupportedRef.current = detected;
            resolved = true;
            resolve(boundarySupportedRef.current);
          }
        };
      } catch (err) {
        console.warn('[tts] Boundary detection failed:', err);
        boundarySupportedRef.current = false;
        resolved = true;
        resolve(false);
      }
    });
  };

  const speakFromIndex = (index: number) => {
    if (!contentRef.current) return;
    const text = contentTextRef.current.slice(index);
    const utter = new SpeechSynthesisUtterance(text);
    const voice = selectVoiceForText(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    utter.rate = tts_rateRef.current;
    if (boundarySupportedRef.current) {
      utter.onboundary = (e) => {
        if (e.name === 'word') {
          currentIndexRef.current = index + e.charIndex;
          highlightAtIndex(currentIndexRef.current);
        }
      };
    } else {
      startFallbackHighlighting(index);
    }
    utter.onend = () => {
      set_is_speaking(false);
      set_is_paused(false);
      utteranceRef.current = null;
      clearHighlight();
      stopFallbackHighlighting();
      updatePlaybackState();
    };
    speechSynthesis.speak(utter);
    utteranceRef.current = utter;
    set_is_speaking(true);
    if (is_paused) set_is_paused(false);
    updatePlaybackState();
  };

  const speakCurrentChapter = async () => {
    if (is_speaking) return;
    const el = contentRef.current;
    if (!el) return;
    const text = el.textContent || '';
    if (!text.trim()) return;
    if (!('speechSynthesis' in window)) {
      alert('Sorry, your browser does not support text-to-speech.');
      return;
    }
    textNodeMapRef.current = buildIndexMap(el);
    contentTextRef.current = text;
    currentIndexRef.current = 0;
    await detectBoundaryEventSupport();
    speakFromIndex(0);
  };

  const stopSpeaking = () => {
    if (is_speaking) {
      window.speechSynthesis.cancel();
      set_is_speaking(false);
      set_is_paused(false);
      utteranceRef.current = null;
      clearHighlight();
      stopFallbackHighlighting();
      updatePlaybackState();
    }
  };

  const pauseSpeaking = () => {
    if (is_speaking && !is_paused) {
      window.speechSynthesis.pause();
      set_is_paused(true);
      stopFallbackHighlighting();
      updatePlaybackState();
    }
  };

  const resumeSpeaking = () => {
    if (is_speaking && is_paused) {
      window.speechSynthesis.resume();
      set_is_paused(false);
      if (!boundarySupportedRef.current) {
        startFallbackHighlighting(currentIndexRef.current);
      }
      updatePlaybackState();
    }
  };

  const adjustRate = (delta: number) => {
    const newRate = Math.min(3, Math.max(0.5, tts_rate + delta));
    set_tts_rate(newRate);
    if (is_speaking && utteranceRef.current) {
      window.speechSynthesis.cancel();
      set_is_speaking(false);
      set_is_paused(false);
      utteranceRef.current = null;
      speakFromIndex(currentIndexRef.current);
    }
  };

  const updatePlaybackState = () => {
    if (!mediaSessionSupported) return;
    navigator.mediaSession.playbackState = is_speaking
      ? is_paused
        ? 'paused'
        : 'playing'
      : 'none';
  };

  const setupMediaSession = () => {
    if (!mediaSessionSupported) return;
    navigator.mediaSession.setActionHandler('play', () => {
      if (is_paused) {
        resumeSpeaking();
      } else if (!is_speaking) {
        speakCurrentChapter();
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (is_speaking && !is_paused) {
        pauseSpeaking();
      }
    });
    updatePlaybackState();
  };

  const toggleTts = () => {
    if (is_speaking) {
      stopSpeaking();
      set_is_speaking(false);
    } else {
      speakCurrentChapter();
      set_is_speaking(true);
    }
  };

  // Function to handle closing the TTS modal without stopping playback
  const handle_close_tts_modal = () => {
    set_is_speaking(false);
  };

  useEffect(() => {
    if (settings) {
      set_tts_rate(settings.ttsSpeed);
    }
  }, [settings]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    setupMediaSession();
  }, []);

  useEffect(() => {
    updatePlaybackState();
  }, [is_speaking, is_paused]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const nextChapter = () => {
    if (bookContent && currentChapter < bookContent.totalChapters - 1) {
      console.log('Moving to next chapter, clearing any translated content');
      set_is_translated(false);
      setTranslatedContent(null);
      setCurrentChapter(currentChapter + 1);
    }
  };

  const prevChapter = () => {
    if (currentChapter > 0) {
      console.log('Moving to previous chapter, clearing any translated content');
      set_is_translated(false);
      setTranslatedContent(null);
      setCurrentChapter(currentChapter - 1);
    }
  };


  const clearTranslation = () => {
    if (is_translated) {
      console.log('Clearing translation, returning to original content');
      setTranslatedContent(null);
      set_is_translated(false);
    }
  };

  const toggleJpdbHighlight = () => {
    console.log('🎯 JPDB highlight button clicked, current state:', jpdb_highlighted);
    console.log('🎯 Available functions:', { 
      initializeJpdb: typeof initializeJpdb, 
      highlightContent: typeof highlightContent 
    });
    
    set_jpdb_highlighted(prev => {
      const newState = !prev;
      console.log('🎯 Setting JPDB highlight state to:', newState);
      return newState;
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Reader Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Back to Library"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline-block ml-1 text-sm">Back to Library</span>
          </button>
          
          <div className="flex-1 min-w-0 border-l pl-3 sm:pl-4 border-gray-200 dark:border-gray-700">
            <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
              {bookContent?.title}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Chapter {currentChapter + 1} of {bookContent?.totalChapters}
              {is_translated && (
                <span className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                  Translated
                </span>
              )}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => set_show_settings(true)}
          className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Settings"
        >
          <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        
        {/* Clear Translation Button - only show when translated */}
        {is_translated && (
          <button
            onClick={clearTranslation}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
            aria-label="Clear Translation"
            title="Show original text"
          >
            <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Reader Content */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto pb-24 px-3 sm:px-4 md:px-8 lg:px-16 touch-pan-y"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
          fontFamily: settings?.fontFamily || 'Inter',
        }}
      >
        {is_translated ? (
          <div className="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
            <div
              className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed"
              dangerouslySetInnerHTML={{ __html: translatedContent || '' }}
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
            {currentChapterContent ? (
              <div
                className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: currentChapterContent }}
              />
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600 dark:text-red-400 mb-4">
                  Error loading book: {error}
                </div>
                <button
                  onClick={onBack}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                >
                  Back to Library
                </button>
              </div>
            ) : (
              <div className="flex justify-center items-center py-8 sm:py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reader Controls */}
      <ReaderControls
        currentChapter={currentChapter}
        totalChapters={bookContent?.totalChapters || 1}
        onPrevChapter={prevChapter}
        onNextChapter={nextChapter}
        bookId={bookId}
        chapterTitles={bookContent?.chapterTitles || []}
        onSelectChapter={setCurrentChapter}
        onToggleTts={toggleTts}
        ttsActive={is_speaking}
        onToggleHighlight={toggleJpdbHighlight}
        jpdb_highlighted={jpdb_highlighted}
      />

      <TtsControlModal
        visible={is_speaking}
        paused={is_paused}
        rate={tts_rate}
        onPauseResume={() => {
          if (is_paused) {
            resumeSpeaking();
          } else {
            pauseSpeaking();
          }
        }}
        onStop={stopSpeaking}
        onAdjustRate={adjustRate}
        onClose={handle_close_tts_modal}
      />

      {/* Settings Modal */}
      {show_settings && (
        <SettingsModal
          onClose={() => set_show_settings(false)}
          onTranslate={(useCefr) => translateCurrent(useCefr)}
          translating={is_translating}
        />
      )}
    </div>
  );
}
