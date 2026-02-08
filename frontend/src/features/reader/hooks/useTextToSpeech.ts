import { useState, useRef, useEffect, useCallback } from "react";
import { useSettings } from "@shared/contexts/SettingsContext";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";

export function useTextToSpeech(contentRef: React.RefObject<HTMLDivElement | null>) {
  const { settings } = useSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsRate, setTtsRate] = useState(settings?.ttsSpeed || 1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaSessionSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

  const ttsRateRef = useRef(ttsRate);
  useEffect(() => {
    ttsRateRef.current = ttsRate;
  }, [ttsRate]);

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
            (fallbackHighlightElRef.current.firstChild as Node),
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
      appLog.warn('Unable to highlight range', err);
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
    }, 300 / ttsRateRef.current);
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
        appLog.warn('[tts] Boundary detection failed:', err);
        boundarySupportedRef.current = false;
        resolved = true;
        resolve(false);
      }
    });
  };

  const updatePlaybackState = useCallback(() => {
    if (!mediaSessionSupported) return;
    (navigator as any).mediaSession.playbackState = isSpeaking
      ? isPaused
        ? 'paused'
        : 'playing'
      : 'none';
  }, [isSpeaking, isPaused, mediaSessionSupported]);

  const speakFromIndex = useCallback((index: number) => {
    if (!contentRef.current) return;
    const text = contentTextRef.current.slice(index);
    const utter = new SpeechSynthesisUtterance(text);
    const voice = selectVoiceForText(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    utter.rate = ttsRateRef.current;
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
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
      clearHighlight();
      stopFallbackHighlighting();
      updatePlaybackState();
    };
    speechSynthesis.speak(utter);
    utteranceRef.current = utter;
    setIsSpeaking(true);
    if (isPaused) setIsPaused(false);
    updatePlaybackState();
  }, [contentRef, updatePlaybackState]);

  const speakCurrentChapter = useCallback(async () => {
    if (isSpeaking) return;
    const el = contentRef.current;
    if (!el) return;
    const text = el.textContent || '';
    if (!text.trim()) return;
    if (!('speechSynthesis' in window)) {
      notifyError("Text-to-speech is not supported in this browser.");
      return;
    }
    textNodeMapRef.current = buildIndexMap(el);
    contentTextRef.current = text;
    currentIndexRef.current = 0;
    await detectBoundaryEventSupport();
    speakFromIndex(0);
  }, [isSpeaking, contentRef, speakFromIndex]);

  const stopSpeaking = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
      clearHighlight();
      stopFallbackHighlighting();
      updatePlaybackState();
    }
  }, [isSpeaking, updatePlaybackState]);

  const pauseSpeaking = useCallback(() => {
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      stopFallbackHighlighting();
      updatePlaybackState();
    }
  }, [isSpeaking, isPaused, updatePlaybackState]);

  const resumeSpeaking = useCallback(() => {
    if (isSpeaking && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      if (!boundarySupportedRef.current) {
        startFallbackHighlighting(currentIndexRef.current);
      }
      updatePlaybackState();
    }
  }, [isSpeaking, isPaused, updatePlaybackState]);

  const adjustRate = useCallback((delta: number) => {
    const newRate = Math.min(3, Math.max(0.5, ttsRate + delta));
    setTtsRate(newRate);
    if (isSpeaking && utteranceRef.current) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
      speakFromIndex(currentIndexRef.current);
    }
  }, [ttsRate, isSpeaking, speakFromIndex]);

  const setupMediaSession = useCallback(() => {
    if (!mediaSessionSupported) return;
    (navigator as any).mediaSession.setActionHandler('play', () => {
      if (isPaused) {
        resumeSpeaking();
      } else if (!isSpeaking) {
        speakCurrentChapter();
      }
    });
    (navigator as any).mediaSession.setActionHandler('pause', () => {
      if (isSpeaking && !isPaused) {
        pauseSpeaking();
      }
    });
    updatePlaybackState();
  }, [mediaSessionSupported, isPaused, isSpeaking, resumeSpeaking, speakCurrentChapter, pauseSpeaking, updatePlaybackState]);

  const toggleTts = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      speakCurrentChapter();
      setIsSpeaking(true);
    }
  }, [isSpeaking, stopSpeaking, speakCurrentChapter]);

  const handleCloseTtsModal = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    if (settings) {
      setTtsRate(settings.ttsSpeed);
    }
  }, [settings]);

  useEffect(() => {
    return () => stopSpeaking();
  }, [stopSpeaking]);

  useEffect(() => {
    setupMediaSession();
  }, [setupMediaSession]);

  useEffect(() => {
    updatePlaybackState();
  }, [updatePlaybackState]);

  return {
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
  };
}
