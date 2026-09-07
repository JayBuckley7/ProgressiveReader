import { useCallback, useEffect, useRef } from "react";
import { notifyError } from "@shared/utils/notify";

type LinkableBookContent = {
  totalChapters: number;
  chapterTitles?: Array<{ index: number; href?: string }>;
};

export function useInternalEpubLinks(params: {
  bookId: string;
  isPdf: boolean;
  contentRef: React.RefObject<HTMLElement>;
  bookContent: LinkableBookContent | null;
  navigateToChapter: (chapterIndex: number, fragmentId?: string) => void;
  revealElement?: (element: HTMLElement) => boolean;
}) {
  const { bookId, isPdf, contentRef, bookContent, navigateToChapter, revealElement } = params;

  // Refs for current values to avoid effect dependencies.
  const bookContentRef = useRef(bookContent);
  const navigateRef = useRef(navigateToChapter);
  const revealElementRef = useRef(revealElement);

  useEffect(() => {
    bookContentRef.current = bookContent;
  }, [bookContent]);

  useEffect(() => {
    navigateRef.current = navigateToChapter;
  }, [navigateToChapter]);

  useEffect(() => {
    revealElementRef.current = revealElement;
  }, [revealElement]);

  // Stable link click handler that doesn't change with chapter updates.
  const handleLinkClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    const link = target.closest("a");
    if (!link || !link.href) return;

    // If the user is selecting text, don't treat this as a link click.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Check if this is an internal EPUB link.
    const href = link.getAttribute("href") || "";
    const isInternalLink =
      href.startsWith("#") ||
      href.endsWith(".xhtml") ||
      href.endsWith(".html") ||
      href.includes(".xhtml#") ||
      href.includes(".html#");

    if (!isInternalLink) {
      return; // Let external links work normally.
    }

    e.preventDefault();
    e.stopPropagation();

    const currentBookContent = bookContentRef.current;
    const contentEl = contentRef.current;
    if (!currentBookContent || !contentEl) return;

    // Try to find the target chapter.
    let targetChapter = -1;
    const rawFragment = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    let fragmentId = rawFragment;
    try {
      fragmentId = decodeURIComponent(rawFragment);
    } catch {
      // Keep a malformed-but-literal fragment usable when possible.
    }

    // Method 1: Look for chapter by href in chapterTitles.
    if (currentBookContent.chapterTitles) {
      const chapterMatch = currentBookContent.chapterTitles.find((ch) => {
        const chapterHref = ch.href || "";
        const linkBase = href.split("#")[0].split("/").pop() || "";
        const chapterBase = chapterHref.split("#")[0].split("/").pop() || "";
        return linkBase && chapterBase && linkBase === chapterBase;
      });

      if (chapterMatch) {
        targetChapter = chapterMatch.index;
      }
    }

    // Method 2: Try to parse chapter number from href.
    if (targetChapter === -1) {
      const chapterMatch =
        href.match(/chapter[_-]?(\d+)/i) ||
        href.match(/ch[_-]?(\d+)/i) ||
        href.match(/(\d+)\.x?html/i);
      if (chapterMatch) {
        const chapterNum = parseInt(chapterMatch[1], 10);
        if (chapterNum >= 1 && chapterNum <= currentBookContent.totalChapters) {
          targetChapter = chapterNum - 1; // Convert to 0-based index.
        }
      }
    }

    // Method 3: Look for anchor in current chapter.
    if (targetChapter === -1 && href.startsWith("#")) {
      const anchorId = fragmentId;
      const anchorEl = Array.from(contentEl.querySelectorAll<HTMLElement>("[id]"))
        .find((element) => element.id === anchorId);
      if (anchorEl) {
        if (!revealElementRef.current?.(anchorEl)) {
          anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
    }

    // Navigate to the target chapter if found.
    if (targetChapter >= 0 && targetChapter < currentBookContent.totalChapters) {
      navigateRef.current(targetChapter, fragmentId || undefined);
    } else {
      notifyError(String(link.textContent || href), {
        title: "Unable to navigate",
        description: "This link could not be mapped to a chapter in the current book structure.",
      });
    }
  }, [contentRef]);

  // Handle internal EPUB links (bind once per book, not per chapter).
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || isPdf) return;

    contentEl.addEventListener("click", handleLinkClick);
    return () => contentEl.removeEventListener("click", handleLinkClick);
  }, [bookId, contentRef, handleLinkClick, isPdf]);
}
