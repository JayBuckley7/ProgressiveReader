/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { BookReader } from '@features/reader/components/BookReader';
import userEvent from '@testing-library/user-event';

vi.mock('../../hooks/useBookContent', () => ({
  useBookContent: () => ({
    bookContent: {
      title: 'Demo Book',
      totalChapters: 1,
      chapters: ['<p>Chapter 1</p>'],
      chapterTitles: [{ index: 0, label: 'Chapter 1' }],
    },
    currentChapterContent: '<p>Chapter 1</p>',
    isLoading: false,
    error: null,
  }),
}));

vi.mock('~/index.ts', () => ({
  initialize: () => {},
  highlightContent: async () => {},
}));

vi.mock('~/features/reader/content/api-adapter.ts', () => ({
  loadConfig: () => ({ apiKey: '' }),
}));

vi.mock('../../utils/htmlToJsx', () => ({
  parseHtmlToJsx: (html: string) => html,
}));

describe('Reader integration: translation', () => {
  it('clicking Translate shows mock translated HTML', async () => {
    renderWithProviders(
      <BookReader bookId="demo-1" currentChapter={0} setCurrentChapter={() => {}} onBack={() => {}} />
    );

    const translateBtn = screen.getAllByLabelText(/Translate current chapter|この章を翻訳/i)[0];
    await userEvent.click(translateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Mock Translation/)).toBeInTheDocument();
    });
  });
});


