import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useSettings } from "@shared/contexts/SettingsContext";
import type { TranslateRequest } from "~/types/api";
import { translateChapterStream } from "@integrations/backend/translation";
import { appLog } from '@shared/appLog'
import { notifyError } from "@shared/utils/notify";
import { browserOpenAiChatPort } from "@integrations/openai/browserChat";
import { translateChapterHtmlWithLlm } from "@core/translation/translateChapterHtml";
import { stripMarkdownCodeFences } from "@core/utils/markdown";

// Helper functions for translation storage
const getTranslationStorageKey = (bookId: string, chapter: number) => {
  return `translation_${bookId}_${chapter}`;
};

const saveTranslationToStorage = (bookId: string, chapter: number, translatedContent: string, useCefr: boolean, settings?: any) => {
  if (settings && settings.cacheTranslations === false) return;
  const key = getTranslationStorageKey(bookId, chapter);
  const translationData = {
    content: translatedContent,
    timestamp: Date.now(),
    useCefr,
    targetLanguage: settings?.targetLanguage || "English",
    cefrLevel: localStorage.getItem("cefrLevel") || "3"
  };
  localStorage.setItem(key, JSON.stringify(translationData));
  appLog.debug('Translation saved to storage:', key, 'with settings:', {
    targetLanguage: translationData.targetLanguage,
    cefrLevel: translationData.cefrLevel,
    useCefr
  });
};

export const loadTranslationFromStorage = (bookId: string, chapter: number) => {
  const key = getTranslationStorageKey(bookId, chapter);
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      const translationData = JSON.parse(stored);
      appLog.debug('Translation loaded from storage:', key);
      return translationData;
    } catch (error) {
      appLog.warn('[useTranslation] Error parsing stored translation', error);
      localStorage.removeItem(key); // Remove corrupted data
    }
  }
  return null;
};

export function useTranslation(bookId: string, chapter: number, currentChapterContent: string | null) {
  const { settings } = useSettings();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isAutoloaded, setIsAutoloaded] = useState(false);
  const [lastUseCefr, setLastUseCefr] = useState(false);
  const suppressAutoloadKeyRef = useRef<string | null>(null);

  // Translate using the user's personal OpenAI key entirely in the browser.
  // This is required for the app's privacy promise: the backend must not see book content when the user brings their own key.
  const translateWithOpenAI = useCallback(
    async (html: string, useCefr: boolean, apiKey: string): Promise<string> => {
      const targetLang = settings?.targetLanguage || "English";
      const model = (localStorage.getItem("openaiModel") || "gpt-4o-mini").trim() || "gpt-4o-mini";
      const cefrLevel = localStorage.getItem("cefrLevel") || "B2";
      return translateChapterHtmlWithLlm({
        llm: browserOpenAiChatPort,
        apiKey,
        html,
        targetLanguage: targetLang,
        model,
        useCefr,
        cefrLevel,
      });
    },
    [settings?.targetLanguage]
  );

  /**
   * Translate the current chapter.
   * If the user has a personal OpenAI key configured, call OpenAI directly from the browser.
   * Otherwise, fall back to the backend OpenAI pool.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = useCallback(async (useCefr: boolean) => {
    if (!currentChapterContent) return;
    // User explicitly requested a translation; don't keep any "show original" override.
    suppressAutoloadKeyRef.current = null;
    setIsTranslating(true);
    const toastId = toast.loading("Translating...", {
      id: "translating",
      duration: Infinity,
      style: { backgroundColor: "#4b8dff", color: "white" },
    });

    // Always translate from the original chapter HTML
    const contentToTranslate = currentChapterContent;

    const personalKey = (localStorage.getItem("openaiKey") || "").trim();
    if (personalKey) {
      try {
        const cleaned = await translateWithOpenAI(contentToTranslate, useCefr, personalKey);
        setTranslatedContent(cleaned);
        setIsTranslated(true);
        setIsAutoloaded(false);
        saveTranslationToStorage(bookId, chapter, cleaned, useCefr, settings);
        toast.success("Translation complete!", { id: toastId });
      } catch (err) {
        appLog.error("[useTranslation] Translation error", err);
        notifyError(err, { title: "Translation error" });
      } finally {
        setIsTranslating(false);
        toast.dismiss(toastId);
      }
      return;
    }

    const payload: TranslateRequest = {
      content: contentToTranslate,
      targetLang: settings?.targetLanguage || "English",
      model: localStorage.getItem("openaiModel") || "gpt-4o-mini",
      useCefr: useCefr,
      stream: true,
    };
    if (useCefr) {
      payload.cefrLevel = localStorage.getItem("cefrLevel") || "B2";
    }
    
    try {
      let accumulated = "";
      let firstChunk = true;
      const stream = translateChapterStream(payload, (chunk) => {
        if (firstChunk) {
          setIsTranslated(true);
          firstChunk = false;
        }
        accumulated += chunk;
        setTranslatedContent(accumulated);
      }, (complete) => {
        const cleaned = stripMarkdownCodeFences(complete);
        setTranslatedContent(cleaned);
        setIsTranslated(true);
        setIsAutoloaded(false);
        saveTranslationToStorage(bookId, chapter, cleaned, useCefr, settings);
        toast.success("Translation complete!", { id: toastId });
      });
      
      // Consume the stream
      for await (const _ of stream) {
        // Stream is handled by callbacks
      }
    } catch (error) {
      appLog.error("[useTranslation] Translation error", error);
      notifyError(error, { title: "Translation error" });
    } finally {
      setIsTranslating(false);
      toast.dismiss(toastId);
    }
  }, [bookId, chapter, currentChapterContent, settings, translateWithOpenAI]);

  const clearTranslation = useCallback((options?: { suppressAutoload?: boolean }) => {
    if (isTranslated) {
      appLog.debug('Clearing translation, returning to original content');
      if (options?.suppressAutoload) {
        // Prevent the autoload effect from immediately re-applying the cached translation.
        suppressAutoloadKeyRef.current = getTranslationStorageKey(bookId, chapter);
      }
      setTranslatedContent(null);
      setIsTranslated(false);
      setIsAutoloaded(false);
    }
  }, [isTranslated, bookId, chapter]);

  const applyStoredTranslation = useCallback((translation: { content: string; useCefr?: boolean } | null) => {
    if (!translation?.content) return;
    suppressAutoloadKeyRef.current = null;
    setTranslatedContent(translation.content);
    setIsTranslated(true);
    setIsAutoloaded(true);
    if (typeof translation.useCefr === "boolean") {
      setLastUseCefr(translation.useCefr);
    }
  }, []);

  // Clear translated content when chapter changes, but check for autoload first
  useEffect(() => {
    if (isTranslated) {
      appLog.debug('Chapter changed - clearing translated content');
      setIsTranslated(false);
      setTranslatedContent(null);
      setIsAutoloaded(false);
    }
  }, [chapter]);

  // Reset any "show original" override when navigating chapters/books.
  // Important: this must be declared before the autoload effect so it runs first after navigation.
  useEffect(() => {
    suppressAutoloadKeyRef.current = null;
  }, [bookId, chapter]);

  // Autoload translations when chapter changes if setting is enabled (one-time per chapter load)
  useEffect(() => {
    const autoloadEnabled = localStorage.getItem("autoloadTranslations") === "true";
    const cachingEnabled = settings?.cacheTranslations !== false;
    
    // Only autoload on initial chapter load, not when user has already interacted with translations
    if (autoloadEnabled && cachingEnabled && currentChapterContent && !isTranslating && !isTranslated) {
      appLog.debug('Checking for stored translation for autoload...');
      const storedTranslation = loadTranslationFromStorage(bookId, chapter);
      
      if (storedTranslation) {
        // Check if stored translation is still valid (same settings)
        const currentTargetLanguage = settings?.targetLanguage || "English";
        const currentCefrLevel = localStorage.getItem("cefrLevel") || "3";
        
        const isValid = storedTranslation.targetLanguage === currentTargetLanguage &&
                       storedTranslation.cefrLevel === currentCefrLevel;
        
        if (isValid) {
          const currentKey = getTranslationStorageKey(bookId, chapter);
          const isSuppressed = suppressAutoloadKeyRef.current === currentKey;

          if (isSuppressed) {
            appLog.debug('[useTranslation] Autoload suppressed (user chose original)', { chapter });
            return;
          }

          appLog.debug('[useTranslation] Autoloading stored translation', { chapter });
          setTranslatedContent(storedTranslation.content);
          setIsTranslated(true);
          setIsAutoloaded(true);
          if (typeof storedTranslation.useCefr === "boolean") {
            setLastUseCefr(storedTranslation.useCefr);
          }
        } else {
          appLog.debug('[useTranslation] Stored translation is outdated; removing from storage');
          const key = getTranslationStorageKey(bookId, chapter);
          localStorage.removeItem(key);
        }
      }
    }
  }, [chapter, currentChapterContent, bookId, settings?.targetLanguage, isTranslating, isTranslated]);

  return {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent,
    clearTranslation,
    applyStoredTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  };
}
