import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useSettings } from "@shared/contexts/SettingsContext";
import type { TranslateRequest, TranslateResponse } from "~/types/api";
import { translateChapterStream } from "@features/reader/services/readerApi";

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
  console.log('Translation saved to storage:', key, 'with settings:', {
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
      console.log('Translation loaded from storage:', key);
      return translationData;
    } catch (error) {
      console.error('Error parsing stored translation:', error);
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

  // Translate using the user's personal OpenAI key entirely in the browser
  const translateWithOpenAI = async (html: string, useCefr: boolean): Promise<string> => {
    const targetLang = settings?.targetLanguage || "English";
    const model = localStorage.getItem("openaiModel") || "gpt-4o-mini";
    const cefrLevel = localStorage.getItem("cefrLevel") || "B2";
    const apiKey = localStorage.getItem("openaiKey") || "";

    const systemPrompt =
      "You are a helpful translator. You translate the provided HTML content while preserving the HTML structure. ONLY return the translated HTML content, with no introductory text, explanations, or markdown formatting like ```html.";
    let userPrompt = `Translate the following HTML content to ${targetLang}`;
    if (useCefr) {
      userPrompt += `, simplifying for CEFR level ${cefrLevel}. Preserve HTML tags.`;
    } else {
      userPrompt += ". Preserve HTML tags.";
    }

    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${userPrompt}\n\nHTML Content:\n\`\`\`html\n${html}\n\`\`\`` }
      ]
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content?.trim() || "";
    if (text.startsWith("```html")) text = text.slice(7).trim();
    else if (text.startsWith("```")) text = text.slice(3).trim();
    if (text.endsWith("```")) text = text.slice(0, -3).trim();
    return `<div class="max-w-4xl mx-auto py-4 sm:py-6 md:py-8"><div class="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">${text}</div></div>`;
  };

  /**
   * Translate the current chapter using the backend API.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = useCallback(async (useCefr: boolean) => {
    if (!currentChapterContent) return;
    setIsTranslating(true);
    const toastId = toast.loading("Translating...", {
      id: "translating",
      duration: Infinity,
      style: { backgroundColor: "#4b8dff", color: "white" },
    });

    // Always translate from the original chapter HTML
    const contentToTranslate = currentChapterContent;

    const personalKey = localStorage.getItem("openaiKey") || "";
    if (personalKey) {
      try {
        const finalWrapped = await translateWithOpenAI(contentToTranslate, useCefr);
        setTranslatedContent(finalWrapped);
        setIsTranslated(true);
        setIsAutoloaded(false);
        saveTranslationToStorage(bookId, chapter, finalWrapped, useCefr, settings);
      } catch (err) {
        console.error("Translation error:", err);
        toast.error("Translation error");
      } finally {
        setIsTranslating(false);
        toast.dismiss(toastId);
      }
      return;
    }

    const payload: TranslateRequest = {
      content: contentToTranslate,
      target_lang: settings?.targetLanguage || "English",
      model: localStorage.getItem("openaiModel") || "gpt-4o-mini",
      api_key: localStorage.getItem("openaiKey") || "",
      use_cefr: useCefr,
      stream: true,
    };
    if (useCefr) {
      (payload as any).cefr_level = localStorage.getItem("cefrLevel") || "B2";
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
        const wrapped = `
          <div class="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
            <div class="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
              ${accumulated}
            </div>
          </div>
        `;
        setTranslatedContent(wrapped);
      }, (complete) => {
        const wrapped = `
          <div class="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
            <div class="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
              ${complete}
            </div>
          </div>
        `;
        setTranslatedContent(wrapped);
        setIsTranslated(true);
        setIsAutoloaded(false);
        saveTranslationToStorage(bookId, chapter, wrapped, useCefr, settings);
        toast.success("Translation complete!", { id: toastId });
      });
      
      // Consume the stream
      for await (const _ of stream) {
        // Stream is handled by callbacks
      }
    } catch (error) {
      console.error("Translation error:", error);
      toast.error("Translation error");
    } finally {
      setIsTranslating(false);
      toast.dismiss(toastId);
    }
  }, [bookId, chapter, currentChapterContent, settings]);

  const clearTranslation = useCallback(() => {
    if (isTranslated) {
      console.log('Clearing translation, returning to original content');
      setTranslatedContent(null);
      setIsTranslated(false);
      setIsAutoloaded(false);
    }
  }, [isTranslated]);

  // Clear translated content when chapter changes, but check for autoload first
  useEffect(() => {
    if (isTranslated) {
      console.log('Chapter changed - clearing translated content');
      setIsTranslated(false);
      setTranslatedContent(null);
      setIsAutoloaded(false);
    }
  }, [chapter]);

  // Autoload translations when chapter changes if setting is enabled (one-time per chapter load)
  useEffect(() => {
    const autoloadEnabled = localStorage.getItem("autoloadTranslations") === "true";
    const cachingEnabled = settings?.cacheTranslations !== false;
    
    // Only autoload on initial chapter load, not when user has already interacted with translations
    if (autoloadEnabled && cachingEnabled && currentChapterContent && !isTranslating && !isTranslated) {
      console.log('Checking for stored translation for autoload...');
      const storedTranslation = loadTranslationFromStorage(bookId, chapter);
      
      if (storedTranslation) {
        // Check if stored translation is still valid (same settings)
        const currentTargetLanguage = settings?.targetLanguage || "English";
        const currentCefrLevel = localStorage.getItem("cefrLevel") || "3";
        
        const isValid = storedTranslation.targetLanguage === currentTargetLanguage &&
                       storedTranslation.cefrLevel === currentCefrLevel;
        
        if (isValid) {
          console.log('✅ Autoloading stored translation for chapter', chapter);
          setTranslatedContent(storedTranslation.content);
          setIsTranslated(true);
          setIsAutoloaded(true);
        } else {
          console.log('❌ Stored translation is outdated, removing from storage');
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
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  };
}

