import { RefObject, useEffect } from 'react';

const LOCAL_SCROLL_SELECTOR = 'pre, table, [data-reader-local-scroll]';

/**
 * Oversized publication content owns gestures that begin inside its local
 * scroll container. Without this exemption the bubbled pointer/touch end is
 * also interpreted as a reader page turn.
 */
export function isReaderLocalScrollTarget(
  target: EventTarget | null,
  readerSurface: HTMLElement
): boolean {
  if (!(target instanceof Element)) return false;
  const localScroller = target.closest<HTMLElement>(LOCAL_SCROLL_SELECTOR);
  if (!localScroller || !readerSurface.contains(localScroller)) return false;

  return (
    localScroller.scrollWidth > localScroller.clientWidth ||
    localScroller.scrollHeight > localScroller.clientHeight
  );
}

export function useSwipe(
  ref: RefObject<HTMLElement>,
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold: number = 72,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const ratio = 1.3; // avoid accidental triggers while vertically scrolling
    let startX = 0;
    let startY = 0;
    let activePointerId: number | null = null;
    const touchPointerIds = new Set<number>();
    let activeTouch = false;
    let suppressClick = false;

    const clickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('click', clickCapture, true);

    // Prefer pointer events (more consistent across modern mobile browsers), but fall back to touch.
    const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    if (hasPointer) {
      const handlePointerDown = (e: PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        touchPointerIds.add(e.pointerId);
        // A second finger invalidates the whole gesture so pinch-zoom can
        // never be mistaken for a page turn when the first finger lifts.
        if (touchPointerIds.size !== 1) {
          activePointerId = null;
          suppressClick = false;
          return;
        }
        if (isReaderLocalScrollTarget(e.target, el)) {
          activePointerId = null;
          suppressClick = false;
          return;
        }
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        suppressClick = false;
      };

      const handlePointerUp = (e: PointerEvent) => {
        touchPointerIds.delete(e.pointerId);
        if (e.pointerId !== activePointerId) return;
        activePointerId = null;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const isHorizontalSwipe = absDx >= threshold && absDx > absDy * ratio;
        if (!isHorizontalSwipe) return;

        suppressClick = true;
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      };

      const handlePointerCancel = (e: PointerEvent) => {
        touchPointerIds.delete(e.pointerId);
        if (e.pointerId !== activePointerId) return;
        activePointerId = null;
        suppressClick = false;
      };

      el.addEventListener('pointerdown', handlePointerDown, { passive: true });
      el.addEventListener('pointerup', handlePointerUp, { passive: true });
      el.addEventListener('pointercancel', handlePointerCancel, { passive: true });

      return () => {
        el.removeEventListener('click', clickCapture, true);
        el.removeEventListener('pointerdown', handlePointerDown);
        el.removeEventListener('pointerup', handlePointerUp);
        el.removeEventListener('pointercancel', handlePointerCancel);
      };
    }

    const handleTouchStart = (e: TouchEvent) => {
      activeTouch = e.touches.length === 1;
      if (!activeTouch) return;
      if (isReaderLocalScrollTarget(e.target, el)) {
        activeTouch = false;
        suppressClick = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      suppressClick = false;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!activeTouch || e.changedTouches.length !== 1) return;
      activeTouch = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isHorizontalSwipe = absDx >= threshold && absDx > absDy * ratio;
      if (!isHorizontalSwipe) return;

      suppressClick = true;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('click', clickCapture, true);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, ref, onSwipeLeft, onSwipeRight, threshold]);
}
