import { useState, type RefObject } from "react";

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
  const readerIndex = c.isPdf ? c.pdf.currentPage - 1 : c.chapter;
  const readerTotal = c.isPdf ? c.pdf.pageCount : c.bookContent?.totalChapters || 1;
  const previous = c.isPdf ? c.pdf.prevPage : c.nav.prevChapter;
  const next = c.isPdf ? c.pdf.nextPage : c.nav.nextChapter;
  const rightToLeftPageTurning = Boolean(c.settings?.verticalWriting && !c.isPdf);
  const chapterTitles = c.isPdf
    ? Array.from({ length: c.pdf.pageCount }, (_, i) => ({ index: i, title: `Page ${i + 1}`, href: "" }))
    : c.bookContent?.chapterTitles || [];
  const selectChapter = c.isPdf
    ? (index: number) => c.pdf.setCurrentPage(index + 1)
    : c.nav.updateChapter;

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
        bookContent={c.bookContent}
        chapter={c.chapter}
        progressLabel={c.isPdf ? `Page ${c.pdf.currentPage} / ${Math.max(1, c.pdf.pageCount)}` : undefined}
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

      <BookContent
        bookMetadata={c.bookMetadata}
        contentRef={c.contentRef as RefObject<HTMLDivElement>}
        jsxContent={c.mix.jsxContent}
        error={c.error}
        isLoading={c.isLoading}
        pdfData={c.pdf.data}
        pdfViewerRef={c.pdf.viewerRef}
        pdfCurrentPage={c.pdf.currentPage}
        setPdfCurrentPage={c.pdf.setCurrentPage}
        setPdfPageCount={c.pdf.setPageCount}
        settings={c.settings || undefined}
        showPdfTokenHighlights={c.isPdf && c.highlighting.jpdbHighlighted}
      />

      <ReaderDock
        currentIndex={readerIndex}
        totalItems={readerTotal}
        onPrevious={previous}
        onNext={next}
        rightToLeftPageTurning={rightToLeftPageTurning}
        navigationUnit={c.isPdf ? "page" : "chapter"}
        onShowContents={() => {
          setShowReaderControls(false);
          setShowContents(true);
        }}
      />

      <ReaderControls
        visible={showReaderControls}
        onClose={() => setShowReaderControls(false)}
        contentsVisible={showContents}
        onShowContents={() => {
          setShowReaderControls(false);
          setShowContents(true);
        }}
        onCloseContents={() => setShowContents(false)}
        currentChapter={readerIndex}
        totalChapters={readerTotal}
        onPrevChapter={previous}
        onNextChapter={next}
        rightToLeftPageTurning={rightToLeftPageTurning}
        navigationUnit={c.isPdf ? "page" : "chapter"}
        bookId={bookId}
        chapterTitles={chapterTitles}
        onSelectChapter={selectChapter}
        onSelectBookmark={(bookmark) =>
          c.nav.navigateToBookmark(bookmark.chapterIndex, bookmark.position)
        }
        getBookmarkPosition={c.nav.getCurrentReadingPosition}
        onToggleTts={c.tts.toggleTts}
        ttsActive={c.tts.isSpeaking}
        onToggleHighlight={c.highlighting.toggleJpdbHighlight}
        jpdbHighlighted={c.highlighting.jpdbHighlighted}
        onTranslate={() => c.translation.translateCurrent(c.translation.lastUseCefr)}
        translating={c.translation.isTranslating}
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
        />
      )}

      <MixSettingsModal
        visible={showMixSettings}
        onClose={() => setShowMixSettings(false)}
        mirrorMeta={c.mix.mirrorMeta}
        isPdf={c.isPdf}
        isTranslated={c.translation.isTranslated}
        onReloadMirror={c.mix.reloadMirror}
        onRequestRefine={c.mix.hasOpenAiKey ? c.mix.requestRefine : undefined}
      />
    </div>
  );
}

export default BookReader;

