import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { useTranslation as useReaderTranslation } from '@features/reader/hooks/useTranslation';

vi.mock('@features/reader/services/readerApi', () => ({
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
});

