import { useTranslation } from "react-i18next";
import type { BookMetadata, ReadingProgress } from "~/types";

type ContinueReadingItem = {
  book: BookMetadata;
  progress: ReadingProgress;
  ratio: number | null;
};

export function ContinueReading({
  items,
  onResume,
  collapsed,
  onCollapsedChange,
  onDismiss,
}: {
  items: ContinueReadingItem[];
  onResume: (book: BookMetadata, progress: ReadingProgress) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismiss: (progress: ReadingProgress) => void;
}) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return null;

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    day: "numeric",
  });

  if (collapsed) {
    return (
      <section className="mb-4 border-y app-border">
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-11 w-full items-center justify-between gap-3 px-1 text-left text-sm transition-colors hover:text-[color:var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-accent)]"
          aria-label={t("bookLibrary.continueReading.show", { count: items.length })}
        >
          <span className="font-medium">{t("bookLibrary.continueReading.title")}</span>
          <span className="flex items-center gap-2 text-xs app-muted">
            <span>{t("bookLibrary.continueReading.show", { count: items.length })}</span>
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="mb-6" aria-labelledby="continue-reading-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 id="continue-reading-title" className="text-sm font-semibold">
            {t("bookLibrary.continueReading.title")}
          </h2>
          <span className="hidden text-xs app-muted sm:inline">
            {t("bookLibrary.continueReading.subtitle")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md app-muted transition-colors hover:bg-[var(--ui-surface-alt)] hover:text-[color:var(--ui-text)]"
          aria-label={t("bookLibrary.continueReading.hide")}
          title={t("bookLibrary.continueReading.hide")}
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ book, progress, ratio }) => {
          const percentage = ratio === null ? null : Math.round(ratio * 100);
          return (
            <div key={book.id} className="relative min-w-0">
              <button
                type="button"
                onClick={() => onResume(book, progress)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-[var(--ui-surface-alt)] p-2.5 pr-9 text-left transition-colors hover:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]"
                aria-label={`${t("bookLibrary.continueReading.resume")} ${book.title}`}
              >
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md book-cover-placeholder">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-1 text-center text-sm font-semibold">
                      {book.title.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{book.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] app-muted">
                    <span>{dateFormatter.format(new Date(progress.lastUpdated))}</span>
                    {percentage !== null && <span>{percentage}%</span>}
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ui-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-300"
                      style={{ width: `${Math.max(percentage ?? 8, 4)}%` }}
                    />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDismiss(progress)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md app-muted opacity-75 transition-colors hover:bg-[var(--ui-surface)] hover:text-[color:var(--ui-text)] hover:opacity-100 focus-visible:opacity-100"
                aria-label={t("bookLibrary.continueReading.remove", { title: book.title })}
                title={t("bookLibrary.continueReading.remove", { title: book.title })}
              >
                <span aria-hidden="true" className="text-base leading-none">×</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
