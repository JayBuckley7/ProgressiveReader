import type { GrammarScanBoundary } from "@features/grammar/types";

export function toUniqueSorted(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

export function boundaryAdvances(prev: GrammarScanBoundary | undefined, next: GrammarScanBoundary): boolean {
  if (!prev) return true;
  if (next.uptoChapter > prev.uptoChapter) return true;
  if (next.uptoChapter < prev.uptoChapter) return false;
  const prevP = typeof prev.uptoPercent === "number" ? prev.uptoPercent : 1;
  const nextP = typeof next.uptoPercent === "number" ? next.uptoPercent : 1;
  return nextP > prevP + 1e-6;
}

type ProgressLike = {
  currentChapter?: number;
  currentPosition?: number;
  scrollHeight?: number;
  viewportHeight?: number;
};

function isProgressLike(value: unknown): value is ProgressLike {
  return typeof value === "object" && value !== null;
}

export function boundaryFromProgress(progress: unknown): GrammarScanBoundary {
  if (!isProgressLike(progress)) return { uptoChapter: 0, uptoPercent: 0.05 };

  const ch = typeof progress.currentChapter === "number" ? progress.currentChapter : 0;
  const scrollTop = typeof progress.currentPosition === "number" ? progress.currentPosition : 0;
  const scrollHeight = typeof progress.scrollHeight === "number" ? progress.scrollHeight : null;
  const viewportHeight = typeof progress.viewportHeight === "number" ? progress.viewportHeight : null;

  let percent = 0.1;
  if (scrollHeight && viewportHeight) {
    const denom = Math.max(1, scrollHeight - viewportHeight);
    percent = Math.max(0, Math.min(1, scrollTop / denom));
  }
  return { uptoChapter: Math.max(0, ch), uptoPercent: percent > 0 ? percent : 0.1 };
}

