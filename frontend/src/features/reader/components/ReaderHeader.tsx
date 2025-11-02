import { useTranslation } from "react-i18next";
import { useSettings } from "@shared/contexts/SettingsContext";
import { loadTranslationFromStorage } from "@features/reader/hooks/useTranslation";

interface ReaderHeaderProps {
  bookContent: { title?: string; chapterTitles?: Array<{ title: string }>; totalChapters?: number } | null;
  chapter: number;
  bookId: string;
  isTranslated: boolean;
  isAutoloaded: boolean;
  onBack: () => void;
  onClearTranslation: () => void;
  onShowSettings: () => void;
  onToggleTranslation: (translation: { content: string }) => void;
}

export function ReaderHeader({
  bookContent,
  chapter,
  bookId,
  isTranslated,
  isAutoloaded,
  onBack,
  onClearTranslation,
  onShowSettings,
  onToggleTranslation,
}: ReaderHeaderProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();

  return (
    <div className="bg-white dark:bg-gray-800 border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          onClick={onBack}
          className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label={t('reader.header.back')}
          title={t('reader.header.back')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline-block ml-1 text-sm">{t('reader.header.back')}</span>
        </button>
        
        <div className="flex-1 min-w-0 border-l pl-3 sm:pl-4 border-gray-200 dark:border-gray-700">
          <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
            {bookContent?.title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            {bookContent?.chapterTitles?.[chapter]?.title || t('reader.chapterNumber', { number: chapter + 1 })} / {bookContent?.totalChapters}
            <span className="ml-2 space-x-2">
              {isTranslated && (
                <>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    isAutoloaded 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  }`}>
                    {isAutoloaded ? t('reader.badges.autoloaded') : t('reader.badges.translated')}
                  </span>
                  <button
                    onClick={onClearTranslation}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs cursor-pointer transition-colors"
                    title={t('reader.header.clearTranslationTitle')}
                  >
                    {t('reader.badges.native')}
                  </button>
                </>
              )}
              {!isTranslated && (() => {
                const storedTranslation = settings?.cacheTranslations !== false ? loadTranslationFromStorage(bookId, chapter) : null;
                const currentTargetLanguage = settings?.targetLanguage || "English";
                const currentCefrLevel = localStorage.getItem("cefrLevel") || "3";
                const hasValidTranslation = storedTranslation && 
                  storedTranslation.targetLanguage === currentTargetLanguage &&
                  storedTranslation.cefrLevel === currentCefrLevel;
                
                return hasValidTranslation ? (
                  <button
                    onClick={() => onToggleTranslation(storedTranslation)}
                    className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded text-xs cursor-pointer transition-colors"
                    title={t('reader.badges.translated')}
                  >
                    {t('reader.badges.translated')}
                  </button>
                ) : null;
              })()}
            </span>
          </p>
        </div>
      </div>
      
      <button
        onClick={onShowSettings}
        className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        aria-label={t('reader.header.settings')}
        title={t('reader.header.settings')}
      >
        <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756.426-1.756 2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      
      {/* Clear Translation Button - only show when translated */}
      {isTranslated && (
        <button
          onClick={onClearTranslation}
          className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
          aria-label={t('reader.header.clearTranslationTitle')}
          title={t('reader.header.clearTranslationTitle')}
        >
          <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

