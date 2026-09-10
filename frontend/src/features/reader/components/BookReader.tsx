import { ReaderEdgeNavigation } from "./ReaderEdgeNavigation";
import { useEffect, useState, type RefObject } from "react";

import { SettingsModal } from "@shared/components/SettingsModal";
import { TtsControlModal } from "@shared/components/TtsControlModal";

import { BookContent } from "./BookContent";
import { MixSettingsModal } from "./MixSettingsModal";
import { ReaderControls } from "./ReaderControls";
import { ReaderDock } from "./ReaderDock";
import { ReaderHeader } from "./ReaderHeader";
import { useBookReaderController } from "./bookReader/useBookReaderController";

interface BookReaderProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  const [headerNavigation, setHeaderNavigation] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const update = () => setHeaderNavigation(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  const [ocrToolsHost, setOcrToolsHost] = useState<HTMLDivElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMixSettings, setShowMixSettings] = useState(false);
  const [showReaderControls, setShowReaderControls] = useState(false);
  const [showContents, setShowContents] = useState(false);

  const c = useBookReaderController({
    bookId,
    currentChapter,
    setCurrentChapter,
    onBack,
    openAiKeyRefreshSignal: showMixSettings,
    keyboardNavigationEnabled:
      !showSettings && !showMixSettings && !showReaderControls && !showContents,
  });
  const readerIndex = c.isFixedLayout ? c.pdf.currentPage - 1 : c.pagination.pageIndex;
  const readerTotal = c.isFixedLayout ? c.pdf.pageCount : c.pagination.pageCount;
  const previous = c.nav.previousPage;
  const next = c.nav.nextPage;
  const canPrevious = c.nav.canPrevious;
  const canNext = c.nav.canNext;
  const rightToLeftPageTurning = Boolean(c.settings?.verticalWriting && !c.isFixedLayout);
  const chapterTitles = c.isFixedLayout
    ? Array.from({ length: c.pdf.pageCount }, (_, i) => ({ index: i, title: `Page ${i + 1}`, href: "" }))
    : c.bookContent?.chapterTitles || [];
  const selectChapter = c.isFixedLayout
    ? (index: number) => c.pdf.setCurrentPage(index + 1)
    : c.nav.updateChapter;
  const chapterTitle = c.bookContent?.chapterTitles?.find(
    (item) => item.index === c.chapter
  )?.title;
  const pageStatus = c.isFixedLayout
    ? `Page ${c.pdf.currentPage} of ${Math.max(1, c.pdf.pageCount)}`
    : c.pagination.isLayoutReady
      ? `${chapterTitle || `Chapter ${c.chapter + 1}`} · Page ${c.pagination.pageIndex + 1} of ${Math.max(1, c.pagination.pageCount)}`
      : `${chapterTitle || `Chapter ${c.chapter + 1}`} · Laying out pages…`;

  const navigation = (
    <ReaderDock
        inline={headerNavigation}
        currentIndex={readerIndex}
        totalItems={readerTotal}
        onPrevious={previous}
        onNext={next}
        canPrevious={canPrevious}
        canNext={canNext}
        rightToLeftPageTurning={rightToLeftPageTurning}
        navigationUnit="page"
        statusLabel={pageStatus}
        onShowContents={() => {
          setShowReaderControls(false);
          setShowContents(true);
        }}
      />
  );

  if (c.isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ReaderHeader
        navigation={headerNavigation ? navigation : undefined}
        ocrToolsRef={setOcrToolsHost}
        bookContent={c.bookContent}
        chapter={c.chapter}
        progressLabel={pageStatus}
        bookId={bookId}
        isTranslated={c.translation.isTranslated}
        isAutoloaded={c.translation.isAutoloaded}
        onBack={c.handleBack}
        onClearTranslation={() => c.translation.clearTranslation({ suppressAutoload: true })}
        onShowSettings={() => setShowSettings(true)}
        onShowReaderControls={() => {
          setShowContents(false);
          setShowReaderControls((visible) => !visible);
        }}
        readerControlsVisible={showReaderControls}
        onToggleTranslation={c.translation.applyStoredTranslation}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
      <BookContent
        ocrToolsHost={ocrToolsHost}
        bookMetadata={c.bookMetadata}
        contentRef={c.contentRef as RefObject<HTMLDivElement>}
        flowRef={c.flowRef as RefObject<HTMLDivElement>}
        jsxContent={c.mix.jsxContent}
        error={c.error}
        isLoading={c.isLoading}
        pdfData={c.pdf.data}
        pdfLoadError={c.pdf.loadError}
        onRetryPdfLoad={c.pdf.retryLoad}
        pdfViewerRef={c.pdf.viewerRef}
        pdfCurrentPage={c.pdf.currentPage}
        setPdfCurrentPage={c.pdf.setCurrentPage}
        setPdfPageCount={c.pdf.setPageCount}
        settings={c.settings || undefined}
        showPdfTokenHighlights={c.isFixedLayout && c.highlighting.jpdbHighlighted}
      />
      {c.bookMetadata?.fileType === 'cbz' && !showSettings && !showMixSettings && !showReaderControls && !showContents && (
        <ReaderEdgeNavigation onNext={next} onPrevious={previous} canNext={canNext} canPrevious={canPrevious} />
      )}
      </div>

      {!c.isFixedLayout && c.translation.pageTranslationError && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300/70 bg-[color:var(--ui-surface)] px-4 py-2 text-sm text-[color:var(--ui-text)] shadow-lg dark:border-amber-700/70"
        >
          <span className="truncate">Translation failed for this page.</span>
          <button
            type="button"
            className="shrink-0 font-semibold text-[color:var(--ui-accent)] hover:underline disabled:opacity-50"
            onClick={c.translation.retryPageTranslation}
            disabled={c.translation.isTranslating}
          >
            Retry
          </button>
        </div>
      )}

      {!headerNavigation && navigation}


      <ReaderControls
        visible={showReaderControls}
        onClose={() => setShowReaderControls(false)}
        contentsVisible={showContents}
        onShowContents={() => {
          setShowReaderControls(false);
          setShowContents(true);
        }}
        onCloseContents={() => setShowContents(false)}
        currentChapter={c.isFixedLayout ? readerIndex : c.chapter}
        totalChapters={c.isFixedLayout ? Math.max(1, readerTotal) : c.bookContent?.totalChapters || 1}
        navigationIndex={readerIndex}
        navigationTotal={readerTotal}
        navigationStatus={pageStatus}
        canPrevious={canPrevious}
        canNext={canNext}
        onPrevChapter={previous}
        onNextChapter={next}
        rightToLeftPageTurning={rightToLeftPageTurning}
        navigationUnit="page"
        bookId={bookId}
        chapterTitles={chapterTitles}
        onSelectChapter={selectChapter}
        onSelectBookmark={(bookmark) =>
          c.nav.navigateToBookmark(bookmark.chapterIndex, bookmark.position, bookmark.locator)
        }
        getBookmarkPosition={c.nav.getCurrentReadingPosition}
        getBookmarkLocator={c.nav.getCurrentReadingLocator}
        onToggleTts={c.tts.toggleTts}
        ttsActive={c.tts.isSpeaking}
        onToggleHighlight={c.highlighting.toggleJpdbHighlight}
        jpdbHighlighted={c.highlighting.jpdbHighlighted}
        onTranslate={() => c.translation.translateCurrent(c.translation.lastUseCefr)}
        translationAvailable={!c.isFixedLayout}
        translating={c.translation.isTranslating}
        ttsAvailable={!c.isFixedLayout}
        mixEnabled={Boolean(c.settings?.mixEnabled)}
        onShowMixSettings={() => setShowMixSettings(true)}
      />

      <TtsControlModal
        visible={c.tts.isSpeaking}
        paused={c.tts.isPaused}
        rate={c.tts.ttsRate}
        onPauseResume={() => {
          if (c.tts.isPaused) {
            c.tts.resumeSpeaking();
          } else {
            c.tts.pauseSpeaking();
          }
        }}
        onStop={c.tts.stopSpeaking}
        onAdjustRate={c.tts.adjustRate}
        onClose={c.tts.handleCloseTtsModal}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={c.isFixedLayout ? undefined : (useCefr) => {
            setShowSettings(false);
            c.translation.setLastUseCefr(useCefr);
            void c.translation.translateCurrent(useCefr);
          }}
          translating={c.translation.isTranslating}
        />
      )}

      <MixSettingsModal
        visible={showMixSettings}
        onClose={() => setShowMixSettings(false)}
        mirrorMeta={c.mix.mirrorMeta}
        isPdf={c.isFixedLayout}
        isTranslated={c.translation.isTranslated}
        onReloadMirror={c.mix.reloadMirror}
        onRequestRefine={c.mix.hasOpenAiKey ? c.mix.requestRefine : undefined}
      />
    </div>
  );
}

export default BookReader;

