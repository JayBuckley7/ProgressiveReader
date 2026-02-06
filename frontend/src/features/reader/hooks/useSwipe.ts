import { RefObject, useEffect } from 'react';

export function useSwipe(
  ref: RefObject<HTMLElement>,
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold: number = 72
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ratio = 1.3; // avoid accidental triggers while vertically scrolling
    let startX = 0;
    let startY = 0;
    let activePointerId: number | null = null;
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
        // Ignore multi-touch. (Second finger -> do nothing.)
        if (activePointerId !== null) return;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        suppressClick = false;
      };

      const handlePointerUp = (e: PointerEvent) => {
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
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      suppressClick = false;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return;
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
  }, [ref, onSwipeLeft, onSwipeRight, threshold]);
}
