import { useTranslation } from "react-i18next";

import { useAppDeps } from "@app/deps/AppDepsProvider";
import { isTranslationCacheValid } from "@core/translation/cache";
import { useSettings } from "@shared/contexts/SettingsContext";

interface ReaderHeaderProps {
  bookContent: { title?: string; chapterTitles?: Array<{ title: string }>; totalChapters?: number } | null;
  chapter: number;
  progressLabel?: string;
  bookId: string;
  isTranslated: boolean;
  isAutoloaded: boolean;
  onBack: () => void;
  onClearTranslation: () => void;
  onShowSettings: () => void;
  onShowReaderControls?: () => void;
  readerControlsVisible?: boolean;
  onToggleTranslation: (translation: { content: string }) => void;
}

export function ReaderHeader({
  bookContent,
  chapter,
  progressLabel,
  bookId,
  isTranslated,
  isAutoloaded,
  onBack,
  onClearTranslation,
  onShowSettings,
  onShowReaderControls,
  readerControlsVisible,
  onToggleTranslation,
}: ReaderHeaderProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const deps = useAppDeps();
  const chapterTitle =
    bookContent?.chapterTitles?.[chapter]?.title ||
    t("reader.chapterNumber", { number: chapter + 1 });
  const chapterProgressLabel =
    progressLabel || `${chapterTitle} / ${Math.max(1, bookContent?.totalChapters || 1)}`;
  const storedTranslation =
    settings?.cacheTranslations !== false ? deps.translationCache.get(bookId, chapter) : null;
  const hasValidStoredTranslation = storedTranslation
    ? isTranslationCacheValid(storedTranslation, {
        targetLanguage: settings?.targetLanguage || "English",
        cefrLevel: deps.prefs.getCefrLevel(),
      })
    : false;

  return (
    <header className="relative z-20 flex min-h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-2 py-1.5 sm:min-h-[3.75rem] sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-[color:var(--ui-muted)] transition-[background-color,color,transform] hover:bg-[color:var(--ui-surface-alt)] hover:text-[color:var(--ui-text)] active:scale-[0.97] motion-reduce:transition-none sm:px-3"
          aria-label={t("reader.header.back")}
          title={t("reader.header.back")}
        >
          <svg
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden whitespace-nowrap text-sm font-medium md:inline">
            {t("reader.header.back")}
          </span>
        </button>

        <div className="h-7 w-px shrink-0 bg-[color:var(--ui-border)]" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-5 text-[color:var(--ui-text)] sm:text-base">
            {bookContent?.title}
          </h1>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-xs leading-4 text-[color:var(--ui-muted)] sm:text-sm">
              {chapterProgressLabel}
            </p>
            {isTranslated && (
              <button
                type="button"
                onClick={onClearTranslation}
                className="h-7 shrink-0 rounded-full bg-[color:var(--ui-surface-alt)] px-2.5 text-xs font-medium text-[color:var(--ui-text)] transition-opacity hover:opacity-75"
                title={`${
                  isAutoloaded ? t("reader.badges.autoloaded") : t("reader.badges.translated")
                } · ${t("reader.header.clearTranslationTitle")}`}
              >
                {t("reader.badges.native")}
              </button>
            )}
            {!isTranslated && hasValidStoredTranslation && storedTranslation && (
              <button
                type="button"
                onClick={() => onToggleTranslation(storedTranslation)}
                className="h-7 shrink-0 rounded-full bg-[color:var(--ui-surface-alt)] px-2.5 text-xs font-medium text-[color:var(--ui-text)] transition-opacity hover:opacity-75"
                title={t("reader.badges.translated")}
              >
                {t("reader.badges.translated")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5" aria-label={t("reader.header.tools")}>
        {onShowReaderControls && (
          <button
            type="button"
            onClick={onShowReaderControls}
            data-reader-controls-trigger="true"
            aria-haspopup="dialog"
            aria-expanded={readerControlsVisible ?? false}
            className={`flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-[color:var(--ui-muted)] transition-[background-color,color,transform] hover:bg-[color:var(--ui-surface-alt)] hover:text-[color:var(--ui-text)] active:scale-[0.97] motion-reduce:transition-none ${
              readerControlsVisible
                ? "bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]"
                : ""
            }`}
            aria-label={t("reader.header.controls")}
            title={t("reader.header.controls")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onShowSettings}
          className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-[color:var(--ui-muted)] transition-[background-color,color,transform] hover:bg-[color:var(--ui-surface-alt)] hover:text-[color:var(--ui-text)] active:scale-[0.97] motion-reduce:transition-none"
          aria-label={t("reader.header.settings")}
          title={t("reader.header.settings")}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756.426-1.756 2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
