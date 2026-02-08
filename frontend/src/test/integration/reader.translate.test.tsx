import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { useTranslation as useReaderTranslation } from '@features/reader/hooks/useTranslation';

describe('Reader integration: translation', () => {
  it('clicking Translate shows mock translated HTML', async () => {
    const user = userEvent.setup();
    const translateChapterStream = vi.fn(async function* (
      _req: any,
      onChunk?: (chunk: string) => void,
      onComplete?: (complete: string) => void
    ) {
      const html = '<p>Mock Translation</p>';
      onChunk?.(html);
      onComplete?.(html);
      yield html;
    });

    function Harness() {
      const { translateCurrent, translatedContent } = useReaderTranslation('demo-1', 0, '<p>Chapter 1</p>');
      return (
        <div>
          <button onClick={() => void translateCurrent(false)}>Translate</button>
          <div>{translatedContent}</div>
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        backend: {
          translation: {
            translateChapterStream,
          } as any,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(screen.getByText(/Mock Translation/)).toBeInTheDocument(), { timeout: 2000 });
    expect(translateChapterStream).toHaveBeenCalledTimes(1);
  });

  it('Show original text suppresses autoloading a cached translation (user override)', async () => {
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

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: {
          getOpenAiKey: () => null,
          setOpenAiKey: () => {},
          getOpenAiModel: () => 'gpt-4o-mini',
          setOpenAiModel: () => {},
          getCefrLevel: () => 'B2',
          setCefrLevel: () => {},
          getAutoloadTranslations: () => true,
          setAutoloadTranslations: () => {},
          getDisableMix: () => false,
          setDisableMix: () => {},
          getGrammarMiningEnabled: () => null,
          setGrammarMiningEnabled: () => {},
          getGrammarUnderlinesEnabled: () => null,
          setGrammarUnderlinesEnabled: () => {},
          getString: () => null,
          setString: () => {},
          remove: () => {},
          getBool: () => null,
          setBool: () => {},
        },
        translationCache: {
          get: (bookId: string, chapter: number) => {
            if (bookId !== 'demo-2' || chapter !== 0) return null;
            return {
              content: '<p>Cached Translation</p>',
              timestamp: Date.now(),
              useCefr: false,
              targetLanguage: 'English',
              cefrLevel: 'B2',
            };
          },
          set: () => {},
          remove: () => {},
        },
      },
    });

    // Autoload applies on initial render (setting enabled + cache hit)
    await waitFor(() => expect(screen.getByText(/Cached Translation/)).toBeInTheDocument(), { timeout: 2000 });

    // User explicitly switches to original; it should stick and not get auto-reapplied.
    await user.click(screen.getByRole('button', { name: 'Original' }));
    await waitFor(() => expect(screen.getByText('ORIGINAL')).toBeInTheDocument(), { timeout: 2000 });

    // Regression check: allow effects to re-run; translation should not come back.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('ORIGINAL')).toBeInTheDocument();
  });

  it('BYOK uses browser OpenAI (llmChat) and does not call backend translation', async () => {
    const user = userEvent.setup();

    const translateChapterStream = vi.fn(async function* () {
      yield '<p>Should not be called</p>';
    });

    const createChatCompletion = vi.fn(async () => ({ content: '<p>BYOK Translation</p>' }));

    function Harness() {
      const { translateCurrent, translatedContent } = useReaderTranslation('demo-3', 0, '<p>Chapter 1</p>');
      return (
        <div>
          <button onClick={() => void translateCurrent(false)}>Translate</button>
          <div>{translatedContent}</div>
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: {
          getOpenAiKey: () => 'sk-test',
          setOpenAiKey: () => {},
          getOpenAiModel: () => 'gpt-4o-mini',
          setOpenAiModel: () => {},
          getCefrLevel: () => 'B2',
          setCefrLevel: () => {},
          getAutoloadTranslations: () => false,
          setAutoloadTranslations: () => {},
          getDisableMix: () => false,
          setDisableMix: () => {},
          getGrammarMiningEnabled: () => null,
          setGrammarMiningEnabled: () => {},
          getGrammarUnderlinesEnabled: () => null,
          setGrammarUnderlinesEnabled: () => {},
          getString: () => null,
          setString: () => {},
          remove: () => {},
          getBool: () => null,
          setBool: () => {},
        },
        llmChat: {
          createChatCompletion,
        },
        backend: {
          translation: {
            translateChapterStream,
          } as any,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(screen.getByText(/BYOK Translation/)).toBeInTheDocument(), { timeout: 2000 });
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(translateChapterStream).toHaveBeenCalledTimes(0);
  });
});
