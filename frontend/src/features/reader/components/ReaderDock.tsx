import { useTranslation } from "react-i18next";

interface ReaderDockProps {
  currentIndex: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
  rightToLeftPageTurning?: boolean;
  navigationUnit?: "chapter" | "page";
  onShowContents: () => void;
}

export function ReaderDock({
  currentIndex,
  totalItems,
  onPrevious,
  onNext,
  rightToLeftPageTurning = false,
  navigationUnit = "chapter",
  onShowContents,
}: ReaderDockProps) {
  const { t } = useTranslation();
  const safeTotal = Math.max(1, totalItems);
  const currentPosition = Math.min(Math.max(1, currentIndex + 1), safeTotal);
  const progress = Math.min(100, Math.max(0, (currentPosition / safeTotal) * 100));
  const previousLabel = t(
    navigationUnit === "page" ? "reader.controls.prevPage" : "reader.controls.prev"
  );
  const nextLabel = t(
    navigationUnit === "page" ? "reader.controls.nextPage" : "reader.controls.next"
  );
  const previousButton = (
    <button
      type="button"
      onClick={onPrevious}
      disabled={currentIndex <= 0}
      className="flex h-12 min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[color:var(--ui-text)] transition-[background-color,color,transform] hover:bg-[color:var(--ui-surface-alt)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 motion-reduce:transition-none"
      aria-label={previousLabel}
      aria-keyshortcuts={rightToLeftPageTurning ? "ArrowRight" : "ArrowLeft"}
    >
      {!rightToLeftPageTurning && (
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
        </svg>
      )}
      <span className="hidden min-[360px]:inline">{t("reader.dock.previous")}</span>
      {rightToLeftPageTurning && (
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
        </svg>
      )}
    </button>
  );
  const nextButton = (
    <button
      type="button"
      onClick={onNext}
      disabled={currentIndex + 1 >= safeTotal}
      className="flex h-12 min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[color:var(--ui-text)] transition-[background-color,color,transform] hover:bg-[color:var(--ui-surface-alt)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 motion-reduce:transition-none"
      aria-label={nextLabel}
      aria-keyshortcuts={rightToLeftPageTurning ? "ArrowLeft" : "ArrowRight"}
    >
      {rightToLeftPageTurning && (
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
        </svg>
      )}
      <span className="hidden min-[360px]:inline">{t("reader.dock.next")}</span>
      {!rightToLeftPageTurning && (
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
        </svg>
      )}
    </button>
  );

  return (
    <nav
      className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_0.5rem)] left-1/2 z-30 w-[calc(100%_-_1rem)] max-w-[26rem] -translate-x-1/2 sm:bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)]"
      aria-label={t("reader.dock.label")}
      data-page-turn-direction={rightToLeftPageTurning ? "rtl" : "ltr"}
    >
      <div className="relative grid h-14 grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-1 shadow-[0_12px_36px_rgba(15,23,42,0.2)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
        <div
          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[color:var(--ui-border)]"
          aria-hidden="true"
        >
          <span
            className="block h-full bg-[color:var(--ui-accent)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        {rightToLeftPageTurning ? nextButton : previousButton}

        <button
          type="button"
          onClick={onShowContents}
          className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] px-3 text-sm font-semibold tabular-nums text-[color:var(--ui-text)] transition-[background-color,transform] hover:brightness-95 active:scale-[0.97] motion-reduce:transition-none sm:px-4"
          aria-label={`${t("reader.controls.toc")}: ${currentPosition} / ${safeTotal}`}
          aria-live="polite"
        >
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>{currentPosition} / {safeTotal}</span>
        </button>

        {rightToLeftPageTurning ? previousButton : nextButton}
      </div>
    </nav>
  );
}

export default ReaderDock;
