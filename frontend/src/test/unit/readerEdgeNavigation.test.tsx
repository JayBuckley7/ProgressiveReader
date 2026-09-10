import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReaderEdgeNavigation } from '@features/reader/components/ReaderEdgeNavigation';
afterEach(cleanup);
it('advances on the left and goes back on the right', () => {
  const next = vi.fn(), previous = vi.fn();
  render(<ReaderEdgeNavigation onNext={next} onPrevious={previous} canNext canPrevious />);
  fireEvent.click(screen.getByRole('button', { name: 'Next page (left edge)' }));
  expect(next).toHaveBeenCalledOnce(); expect(previous).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page (right edge)' }));
  expect(previous).toHaveBeenCalledOnce();
});
it('omits unavailable page turns at either end of a book', () => {
  const { rerender } = render(<ReaderEdgeNavigation onNext={vi.fn()} onPrevious={vi.fn()} canNext canPrevious={false} />);
  expect(screen.queryByRole('button', { name: 'Previous page (right edge)' })).toBeNull();
  rerender(<ReaderEdgeNavigation onNext={vi.fn()} onPrevious={vi.fn()} canNext={false} canPrevious />);
  expect(screen.queryByRole('button', { name: 'Next page (left edge)' })).toBeNull();
});
