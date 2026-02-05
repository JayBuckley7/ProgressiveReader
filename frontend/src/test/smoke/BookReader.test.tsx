import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { BookReader } from '@features/reader/components/BookReader';

vi.mock('@features/reader/hooks/useBookContent', () => ({
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
  it('renders translate control', () => {
    renderWithProviders(
      <BookReader bookId="demo-1" currentChapter={0} setCurrentChapter={() => {}} onBack={() => {}} />
    );
    // The button has aria-label from i18n key reader.controls.translate
    const translateBtn = screen.getAllByLabelText(/Translate current chapter|この章を翻訳/i)[0];
    expect(translateBtn).toBeInTheDocument();
  });
});

