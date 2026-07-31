import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const IDLE_FADE_DELAY_MS = 3500;

interface ReaderDockProps {
  currentIndex: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
  onShowContents: () => void;
}

export function ReaderDock({
  currentIndex,
  totalItems,
  onPrevious,
  onNext,
  onShowContents,
}: ReaderDockProps) {
  const { t } = useTranslation();
  const navRef = useRef<HTMLElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const safeTotal = Math.max(1, totalItems);
  const currentPosition = Math.min(Math.max(1, currentIndex + 1), safeTotal);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const scheduleFade = useCallback(() => {
    clearFadeTimer();
    setIsVisible(true);
    fadeTimerRef.current = window.setTimeout(() => {
      const dock = navRef.current;
      if (dock?.matches(":hover") || dock?.contains(document.activeElement)) return;
      setIsVisible(false);
    }, IDLE_FADE_DELAY_MS);
  }, [clearFadeTimer]);

  useEffect(() => {
    const revealDock = () => scheduleFade();
    const eventOptions: AddEventListenerOptions = { passive: true };

    window.addEventListener("pointermove", revealDock, eventOptions);
    window.addEventListener("pointerdown", revealDock, eventOptions);
    window.addEventListener("touchstart", revealDock, eventOptions);
    window.addEventListener("keydown", revealDock);
    document.addEventListener("scroll", revealDock, { capture: true, passive: true });
    scheduleFade();

    return () => {
      clearFadeTimer();
      window.removeEventListener("pointermove", revealDock);
      window.removeEventListener("pointerdown", revealDock);
      window.removeEventListener("touchstart", revealDock);
      window.removeEventListener("keydown", revealDock);
      document.removeEventListener("scroll", revealDock, true);
    };
  }, [clearFadeTimer, scheduleFade]);

  return (
    <nav
      ref={navRef}
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] left-1/2 z-30 w-[calc(100%_-_1.5rem)] max-w-[22rem] -translate-x-1/2 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
        isVisible
          ? "translate-y-0 opacity-95 hover:opacity-100 focus-within:opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
      aria-label={t("reader.dock.label")}
      onPointerEnter={() => {
        clearFadeTimer();
        setIsVisible(true);
      }}
      onPointerLeave={scheduleFade}
      onFocusCapture={() => {
        clearFadeTimer();
        setIsVisible(true);
      }}
      onBlurCapture={scheduleFade}
    >
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center rounded-full border border-gray-200/80 bg-white/95 px-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-gray-600/80 dark:bg-gray-800/95 dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentIndex <= 0}
          className="flex h-11 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t("reader.controls.prev")}
        >
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
          </svg>
          <span className="hidden min-[360px]:inline">{t("reader.dock.previous")}</span>
        </button>

        <button
          type="button"
          onClick={onShowContents}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          aria-label={`${t("reader.controls.toc")}: ${currentPosition} / ${safeTotal}`}
        >
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>{currentPosition} / {safeTotal}</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={currentIndex + 1 >= safeTotal}
          className="flex h-11 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t("reader.controls.next")}
        >
          <span className="hidden min-[360px]:inline">{t("reader.dock.next")}</span>
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

export default ReaderDock;
