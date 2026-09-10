interface Props {
  onNext: () => void;
  onPrevious: () => void;
  canNext: boolean;
  canPrevious: boolean;
}

/** Manga page direction: advance on the left, go back on the right. */
export function ReaderEdgeNavigation({ onNext, onPrevious, canNext, canPrevious }: Props) {
  return <nav aria-label="Manga edge navigation" className="reader-edge-navigation">
    {canNext && <button type="button" className="reader-page-edge reader-page-edge-left" aria-label="Next page (left edge)" onClick={onNext}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6" strokeWidth="1.5" /></svg>
    </button>}
    {canPrevious && <button type="button" className="reader-page-edge reader-page-edge-right" aria-label="Previous page (right edge)" onClick={onPrevious}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6" strokeWidth="1.5" /></svg>
    </button>}
  </nav>;
}
