/** Public reader state shared by navigation, processing, and UI surfaces. */
export interface PaginationState {
  pageIndex: number;
  pageCount: number;
  chapterIndex: number;
  chapterCount: number;
  isLayoutReady: boolean;
  canPrevious: boolean;
  canNext: boolean;
  currentSegmentIds: readonly string[];
  nextSegmentIds: readonly string[];
}
