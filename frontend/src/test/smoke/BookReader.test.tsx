import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { BookReader } from '@features/reader/components/BookReader';

vi.mock('@features/reader/hooks/useBookContent', () => ({
  useBookContent: () => ({
    bookContent: {
      title: 'Demo Book',
      totalChapters: 1,
      chapters: ['<p>Chapter 1</p>'],
      chapterTitles: [{ index: 0, title: 'Chapter 1', href: '' }],
    },
    currentChapterContent: '<p>Chapter 1</p>',
    currentChapterContentChapter: 0,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@features/reader/services/jpdbInitializer', () => ({
  initialize: () => {},
  highlightContent: async () => {},
  removeJpdbHighlighting: () => {},
}));

vi.mock('@features/reader/content/api-adapter', () => ({
  loadConfig: () => ({ apiKey: '' }),
}));

vi.mock('@features/reader/utils/htmlToJsx', () => ({
  parseHtmlToJsx: (html: string) => html,
}));

describe('BookReader (smoke)', () => {
  it('renders translate control', async () => {
    renderWithProviders(
      <BookReader bookId="demo-1" currentChapter={0} setCurrentChapter={() => {}} onBack={() => {}} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reader controls' }));
    });
    const translateBtn = screen.getByRole('button', { name: /Translate current page|このページを翻訳/i });
    expect(translateBtn).toBeInTheDocument();
    expect(translateBtn).toHaveTextContent(/Translate/i);
    expect(screen.getByRole('button', { name: /Enable JPDB highlight/i })).toHaveTextContent(/JPDB highlight/i);
    expect(screen.getByRole('button', { name: /^(Table of contents and bookmarks|目次としおり)$/i })).toHaveTextContent(/Contents/i);
  });

  it('keeps page navigation reachable and opens chapter contents from the dock', async () => {
    renderWithProviders(
      <BookReader bookId="demo-1" currentChapter={0} setCurrentChapter={() => {}} onBack={() => {}} />
    );

    expect(screen.getByRole('navigation', { name: 'Reader navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Table of contents and bookmarks:/ })
      );
    });

    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chapter 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close reader controls' })).toBeInTheDocument();
  });
});

