import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { useTranslation as useReaderTranslation } from '@features/reader/hooks/useTranslation';

vi.mock('@integrations/backend/translation', () => ({
  translateChapterStream: async function* (_req: any, onChunk?: (chunk: string) => void, onComplete?: (complete: string) => void) {
    const html = '<p>Mock Translation</p>';
    onChunk?.(html);
    onComplete?.(html);
    yield html;
  },
}));

describe('Reader integration: translation', () => {
  it('clicking Translate shows mock translated HTML', async () => {
    const user = userEvent.setup();

    function Harness() {
      const { translateCurrent, translatedContent } = useReaderTranslation('demo-1', 0, '<p>Chapter 1</p>');
      return (
        <div>
          <button onClick={() => void translateCurrent(false)}>Translate</button>
          <div>{translatedContent}</div>
        </div>
      );
    }

    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(screen.getByText(/Mock Translation/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('Show original text suppresses autoloading a cached translation (user override)', async () => {
    localStorage.clear();
    localStorage.setItem('autoloadTranslations', 'true');
    localStorage.setItem('cefrLevel', '3');
    localStorage.setItem(
      'translation_demo-2_0',
      JSON.stringify({
        content: '<p>Cached Translation</p>',
        timestamp: Date.now(),
        useCefr: false,
        targetLanguage: 'English',
        cefrLevel: '3',
      })
    );

    const user = userEvent.setup();

    function Harness() {
      const { isTranslated, translatedContent, clearTranslation } = useReaderTranslation('demo-2', 0, '<p>Chapter 1</p>');
      return (
        <div>
          <button onClick={() => clearTranslation({ suppressAutoload: true })}>Original</button>
          <div>{isTranslated ? translatedContent : 'ORIGINAL'}</div>
        </div>
      );
    }

    renderWithProviders(<Harness />);

    // Autoload applies on initial render (setting enabled + cache hit)
    await waitFor(() => expect(screen.getByText(/Cached Translation/)).toBeInTheDocument(), { timeout: 2000 });

    // User explicitly switches to original; it should stick and not get auto-reapplied.
    await user.click(screen.getByRole('button', { name: 'Original' }));
    await waitFor(() => expect(screen.getByText('ORIGINAL')).toBeInTheDocument(), { timeout: 2000 });

    // Regression check: allow effects to re-run; translation should not come back.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('ORIGINAL')).toBeInTheDocument();
  });
});
