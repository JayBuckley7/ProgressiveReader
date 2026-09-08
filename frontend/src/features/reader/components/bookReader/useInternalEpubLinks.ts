import { useEffect, useRef } from "react";
import { notifyError } from "@shared/utils/notify";

type LinkableBookContent = {
  totalChapters: number;
  chapterTitles?: Array<{ index: number; href?: string }>;
};

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function useInternalEpubLinks(params: {
  bookId: string;
  isPdf: boolean;
  contentRef: React.RefObject<HTMLElement | null>;
  bookContent: LinkableBookContent | null;
  currentChapter: number;
  renderedChapter: number | null;
  navigateToChapter: (chapterIndex: number, fragmentId?: string) => void;
  revealElement?: (element: HTMLElement) => boolean;
}) {
  const pendingAnchor = useRef<{ bookId: string; chapter: number; id: string } | null>(null);

  // The surface mounts after loading. Rebind after each commit, including that mount.
  useEffect(() => {
    const { bookId, isPdf, contentRef, bookContent, currentChapter, renderedChapter, navigateToChapter } = params;
    const surface = contentRef.current;
    if (!surface || isPdf || !bookContent) return;
    const scrollToAnchor = (id: string) => {
      const anchor = Array.from(surface.querySelectorAll<HTMLElement>("[id], a[name]"))
        .find(el => el.id === id || el.getAttribute("name") === id);
      if (!anchor) return false;
      if (!params.revealElement?.(anchor)) anchor.scrollIntoView({ block: "start", inline: "start" });
      return true;
    };
    const restoreAnchor = () => {
      const pending = pendingAnchor.current;
      if (pending && pending.bookId !== bookId) pendingAnchor.current = null;
      if (pending?.bookId === bookId && pending.chapter === renderedChapter && scrollToAnchor(pending.id)) {
        pendingAnchor.current = null;
      }
    };
    restoreAnchor();
    const observer = new MutationObserver(restoreAnchor);
    observer.observe(surface, { childList: true, subtree: true });
    const handleClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || !surface.contains(link)) return;
      const href = link.getAttribute("href") || "";
      // Publication references are relative. Never intercept web/mail/other external URLs.
      if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return;
      event.preventDefault();
      event.stopPropagation();
      if (window.getSelection()?.toString().trim()) return;
      const [path, fragment = ""] = href.split("#");
      const id = decode(fragment);
      if (!path && scrollToAnchor(id)) return;
      const titles = bookContent.chapterTitles || [];
      const currentHref = titles.find(ch => ch.index === currentChapter)?.href || "";
      const root = "https://epub.invalid/";
      const resolved = decode(new URL(path || currentHref, new URL(currentHref, root)).pathname);
      const matches = titles.filter(ch => ch.href && decode(new URL(ch.href, root).pathname) === resolved);
      // Support parsers that strip directories, but never choose between ambiguous basenames.
      const candidates = matches.length ? matches : titles.filter(ch =>
        path && decode((ch.href || "").split("#")[0].split("/").pop() || "") === decode(path.split("/").pop() || "")
      );
      const match = candidates.find(ch => decode((ch.href || "").split("#")[1] || "") === id) || (candidates.length === 1 ? candidates[0] : undefined);
      if (!match || match.index < 0 || match.index >= bookContent.totalChapters) {
        notifyError("This link could not be found in this book.", { title: "Unable to navigate" });
        return;
      }
      pendingAnchor.current = id ? { bookId, chapter: match.index, id } : null;
      if (params.revealElement) navigateToChapter(match.index, id || undefined);
      else navigateToChapter(match.index);
      if (match.index === renderedChapter) restoreAnchor();
    };
    surface.addEventListener("click", handleClick);
    return () => {
      surface.removeEventListener("click", handleClick);
      observer.disconnect();
    };
  });
}
