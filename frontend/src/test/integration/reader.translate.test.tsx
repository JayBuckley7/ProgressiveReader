import { useEffect, useMemo, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { useTranslation as useReaderTranslation } from '@features/reader/hooks/useTranslation';

function translationPrefs(autoload: boolean) {
  return {
    getOpenAiKey: () => null,
    setOpenAiKey: () => {},
    getOpenAiModel: () => 'gpt-5.6-luna',
    setOpenAiModel: () => {},
    getCefrLevel: () => 'B2',
    setCefrLevel: () => {},
    getAutoloadTranslations: () => autoload,
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
  };
}

function segmentCacheWithGetMany(
  getMany: (keys: readonly any[]) => Promise<any[]>,
) {
  return {
    get: async () => null,
    getMany,
    put: async () => {},
    putMany: async () => {},
    remove: async () => {},
    removeChapter: async () => {},
    clear: async () => {},
  };
}

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

  it('batches the current page before exactly one lookahead page without duplicate reflow calls', async () => {
    const user = userEvent.setup();
    const segments = [
      { id: 'segment-1', html: '<p>Original one.</p>', sourceHash: 'hash-1' },
      { id: 'segment-2', html: '<p>Original two.</p>', sourceHash: 'hash-2' },
      { id: 'segment-3', html: '<p>Original three.</p>', sourceHash: 'hash-3' },
      { id: 'segment-4', html: '<p>Must remain untouched.</p>', sourceHash: 'hash-4' },
    ] as const;
    const annotatedHtml = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => ({
      segments: request.segments.map((segment: any) => ({
        id: segment.id,
        sourceHash: segment.sourceHash,
        translatedHtml: `<p>Translated ${segment.id}</p>`,
      })),
    }));

    function Harness({ layoutVersion }: { layoutVersion: number }) {
      // A font/viewport reflow changes layoutVersion, but an unchanged page
      // membership keeps the translation request identity stable.
      const pageOptions = useMemo(() => ({
        annotatedHtml,
        segments,
        pageWindow: { current: ['segment-1', 'segment-2'], next: ['segment-3'] },
        layoutVersion,
        getLayoutSnapshot: () => ({ ready: true, version: layoutVersion }),
      }), [layoutVersion]);
      const { translateCurrent, translatedContent, isTranslating } = useReaderTranslation(
        'paged-demo',
        0,
        annotatedHtml,
        pageOptions,
      );
      return (
        <div>
          <button onClick={() => void translateCurrent(false)}>Translate page</button>
          <span data-testid="translation-state">{isTranslating ? 'busy' : 'idle'}</span>
          <div data-testid="translated-page" dangerouslySetInnerHTML={{
            __html: translatedContent ?? annotatedHtml,
          }} />
        </div>
      );
    }

    const rendered = renderWithProviders(<Harness layoutVersion={0} />, {
      depsOverride: {
        backend: { translation: { translateSegments } as any },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate page' }));
    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(2));

    expect(translateSegments.mock.calls[0][0].segments.map((item: any) => item.id)).toEqual([
      'segment-1',
      'segment-2',
    ]);
    expect(translateSegments.mock.calls[1][0].segments.map((item: any) => item.id)).toEqual([
      'segment-3',
    ]);
    expect(translateSegments.mock.calls.flatMap(([request]) =>
      request.segments.map((item: any) => item.id)
    )).not.toContain('segment-4');
    expect(screen.getByTestId('translated-page')).toHaveTextContent(
      'Translated segment-1Translated segment-2Translated segment-3Must remain untouched.'
    );
    await waitFor(() => expect(screen.getByTestId('translation-state')).toHaveTextContent('idle'));

    rendered.rerender(<Harness layoutVersion={1} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(translateSegments).toHaveBeenCalledTimes(2);
  });

  it('waits for settled post-mix geometry before paying for the foreground page', async () => {
    const segments = [
      { id: 'old-page', html: '<p>Old visual page.</p>', sourceHash: 'hash-old' },
      { id: 'settled-page', html: '<p>Settled visual page.</p>', sourceHash: 'hash-settled' },
    ];
    const annotatedHtml = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => ({
      segments: request.segments.map((segment: any) => ({
        id: segment.id,
        sourceHash: segment.sourceHash,
        translatedHtml: `<p>Translated ${segment.id}</p>`,
      })),
    }));

    function Harness(props: {
      currentId: string;
      layoutVersion: number;
      ready: boolean;
    }) {
      const snapshot = useMemo(
        () => ({ ready: props.ready, version: props.layoutVersion }),
        [props.layoutVersion, props.ready]
      );
      const pageOptions = useMemo(() => ({
        annotatedHtml,
        segments,
        pageWindow: { current: [props.currentId], next: [] },
        layoutVersion: props.layoutVersion,
        getLayoutSnapshot: () => snapshot,
      }), [props.currentId, props.layoutVersion, snapshot]);
      const translation = useReaderTranslation('settled-geometry', 0, annotatedHtml, pageOptions);
      return (
        <button onClick={() => void translation.translateCurrent(false)}>
          Translate settled page
        </button>
      );
    }

    const rendered = renderWithProviders(
      <Harness currentId="old-page" layoutVersion={0} ready />,
      {
        depsOverride: {
          prefs: translationPrefs(false),
          backend: { translation: { translateSegments } as any },
        },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Translate settled page' }));
    rendered.rerender(<Harness currentId="old-page" layoutVersion={0} ready={false} />);
    rendered.rerender(<Harness currentId="settled-page" layoutVersion={1} ready />);

    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(translateSegments.mock.calls[0][0].segments.map((segment: any) => segment.id)).toEqual([
      'settled-page',
    ]);
  });

  it('aborts the current batch and never starts lookahead after translation is disabled', async () => {
    const user = userEvent.setup();
    let resolveCurrent!: (value: any) => void;
    const currentResult = new Promise<any>((resolve) => {
      resolveCurrent = resolve;
    });
    const translateSegments = vi.fn((_request: any, options?: { signal?: AbortSignal }) => {
      void options;
      return currentResult;
    });
    const source = [
      '<div data-pr-segment-id="current"><p>Current source.</p></div>',
      '<div data-pr-segment-id="next"><p>Next source.</p></div>',
    ].join('');
    const pageOptions = {
      annotatedHtml: source,
      segments: [
        { id: 'current', html: '<p>Current source.</p>', sourceHash: 'hash-current' },
        { id: 'next', html: '<p>Next source.</p>', sourceHash: 'hash-next' },
      ],
      pageWindow: { current: ['current'], next: ['next'] },
    };

    function Harness() {
      const translation = useReaderTranslation('cancel-demo', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate page</button>
          <button onClick={() => translation.clearTranslation({ suppressAutoload: true })}>
            Original
          </button>
          <div>{translation.isTranslated ? 'TRANSLATED' : 'SOURCE'}</div>
          <div data-testid="cancel-translation-state">
            {translation.isTranslating ? 'busy' : 'idle'}
          </div>
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: { backend: { translation: { translateSegments } as any } },
    });
    await user.click(screen.getByRole('button', { name: 'Translate page' }));
    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(1));
    const requestSignal = translateSegments.mock.calls[0][1]?.signal;

    await user.click(screen.getByRole('button', { name: 'Original' }));
    expect(screen.getByText('SOURCE')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-translation-state')).toHaveTextContent('idle');
    expect(requestSignal?.aborted).toBe(true);

    await act(async () => {
      resolveCurrent({
        segments: [
          { id: 'current', sourceHash: 'hash-current', translatedHtml: '<p>Translated.</p>' },
        ],
      });
      await Promise.resolve();
    });
    expect(translateSegments).toHaveBeenCalledTimes(1);
    expect(screen.getByText('SOURCE')).toBeInTheDocument();
  });

  it('chooses lookahead from the page window recomputed after the foreground commit', async () => {
    const user = userEvent.setup();
    let resolveForeground!: (value: any) => void;
    const foreground = new Promise<any>((resolve) => {
      resolveForeground = resolve;
    });
    const segments = [
      { id: 'a', html: '<p>A source.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>B source.</p>', sourceHash: 'hash-b' },
      { id: 'stale-next', html: '<p>Old next.</p>', sourceHash: 'hash-old' },
      { id: 'reflowed-next', html: '<p>New next.</p>', sourceHash: 'hash-new' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => {
      if (translateSegments.mock.calls.length === 1) return foreground;
      return {
        segments: request.segments.map((segment: any) => ({
          id: segment.id,
          sourceHash: segment.sourceHash,
          translatedHtml: `<p>Translated ${segment.id}</p>`,
        })),
      };
    });

    function Harness() {
      const [pageWindow, setPageWindow] = useState({
        current: ['a', 'b'],
        next: ['stale-next'],
      });
      const pageOptions = useMemo(() => ({ annotatedHtml: source, segments, pageWindow }), [pageWindow]);
      const translation = useReaderTranslation('post-commit-window', 0, source, pageOptions);
      useEffect(() => {
        if (!translation.translatedContent?.includes('Translated a')) return;
        setPageWindow((current) => current.next[0] === 'reflowed-next'
          ? current
          : { current: ['a'], next: ['reflowed-next'] });
      }, [translation.translatedContent]);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate reflow</button>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: { backend: { translation: { translateSegments } as any } },
    });
    await user.click(screen.getByRole('button', { name: 'Translate reflow' }));
    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(1));
    expect(translateSegments.mock.calls[0][0].segments.map((item: any) => item.id)).toEqual(['a', 'b']);

    await act(async () => {
      resolveForeground({
        segments: ['a', 'b'].map((id) => ({
          id,
          sourceHash: `hash-${id}`,
          translatedHtml: `<p>Translated ${id}</p>`,
        })),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(translateSegments.mock.calls[1][0].segments.map((item: any) => item.id)).toEqual([
      'reflowed-next',
    ]);
    expect(translateSegments.mock.calls.flatMap(([request]) =>
      request.segments.map((item: any) => item.id)
    )).not.toContain('stale-next');
  });

  it('reuses overlapping in-flight segments when the page window narrows and expands', async () => {
    const user = userEvent.setup();
    let resolveLookahead!: (value: any) => void;
    const lookahead = new Promise<any>((resolve) => {
      resolveLookahead = resolve;
    });
    const segments = [
      { id: 'a', html: '<p>A.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>B.</p>', sourceHash: 'hash-b' },
      { id: 'c', html: '<p>C.</p>', sourceHash: 'hash-c' },
      { id: 'd', html: '<p>D.</p>', sourceHash: 'hash-d' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => {
      const ids = request.segments.map((segment: any) => segment.id);
      if (ids.join(',') === 'b,c') return lookahead;
      return {
        segments: request.segments.map((segment: any) => ({
          id: segment.id,
          sourceHash: segment.sourceHash,
          translatedHtml: `<p>Translated ${segment.id}</p>`,
        })),
      };
    });

    function Harness() {
      const [pageWindow, setPageWindow] = useState({ current: ['a'], next: ['b', 'c'] });
      const pageOptions = useMemo(() => ({ annotatedHtml: source, segments, pageWindow }), [pageWindow]);
      const translation = useReaderTranslation('overlap-window', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate overlap</button>
          <button onClick={() => setPageWindow({ current: ['b'], next: ['c', 'd'] })}>
            Advance window
          </button>
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: { backend: { translation: { translateSegments } as any } },
    });
    await user.click(screen.getByRole('button', { name: 'Translate overlap' }));
    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(translateSegments.mock.calls[0][0].segments.map((item: any) => item.id)).toEqual(['a']);
    expect(translateSegments.mock.calls[1][0].segments.map((item: any) => item.id)).toEqual(['b', 'c']);

    await user.click(screen.getByRole('button', { name: 'Advance window' }));
    await act(async () => {
      resolveLookahead({
        segments: ['b', 'c'].map((id) => ({
          id,
          sourceHash: `hash-${id}`,
          translatedHtml: `<p>Translated ${id}</p>`,
        })),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(3), { timeout: 3000 });
    expect(translateSegments.mock.calls[2][0].segments.map((item: any) => item.id)).toEqual(['d']);
    const paidIds = translateSegments.mock.calls.flatMap(([request]) =>
      request.segments.map((item: any) => item.id)
    );
    expect(paidIds.filter((id) => id === 'b')).toHaveLength(1);
    expect(paidIds.filter((id) => id === 'c')).toHaveLength(1);
  });

  it('recovers the most recently cached CEFR mode before segmented autoload', async () => {
    const getMany = vi.fn(async (keys: any[]) => keys.map((key) => key.useCefr
      ? {
          version: 2,
          // The real IndexedDB adapter returns its canonicalized key even
          // when the lookup was made with display-case settings.
          key: { ...key, targetLanguage: key.targetLanguage.toLowerCase() },
          translatedHtml: '<p>Cached CEFR translation.</p>',
          timestamp: 200,
          modelUsed: key.model,
        }
      : null));
    const translateSegments = vi.fn();
    const segment = { id: 'cached', html: '<p>Source.</p>', sourceHash: 'hash-cached' };
    const source = `<div data-pr-segment-id="cached">${segment.html}</div>`;

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments: [segment],
        pageWindow: { current: ['cached'], next: [] },
      }), []);
      const translation = useReaderTranslation('cefr-cache', 0, source, pageOptions);
      return (
        <div>
          <span data-testid="cefr-mode">{translation.lastUseCefr ? 'cefr' : 'plain'}</span>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: {
          getOpenAiKey: () => null,
          setOpenAiKey: () => {},
          getOpenAiModel: () => 'gpt-5.6-luna',
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
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: {
            get: async () => null,
            getMany,
            put: async () => {},
            putMany: async () => {},
            remove: async () => {},
            removeChapter: async () => {},
            clear: async () => {},
          },
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await waitFor(() => expect(screen.getByText('Cached CEFR translation.')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByTestId('cefr-mode')).toHaveTextContent('cefr');
    expect(translateSegments).not.toHaveBeenCalled();
    expect(getMany.mock.calls[0][0]).toHaveLength(2);
    expect(getMany.mock.calls[0][0].every((key: any) => key.segmentId === 'cached')).toBe(true);
    expect(getMany.mock.calls.some(([keys]) => keys.length === 1 && keys[0].useCefr)).toBe(true);
  });

  it('locally annotates ambiguous legacy translations without another model call', async () => {
    const translateSegments = vi.fn();
    const sourceSegments = [
      { id: 'source-a', html: '<p>A.</p>', sourceHash: 'hash-a' },
      { id: 'source-b', html: '<p>B.</p>', sourceHash: 'hash-b' },
    ];
    const source = sourceSegments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const legacyHtml = '<p>Legacy one.</p><p>Legacy two.</p><p>Legacy three.</p>';

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments: sourceSegments,
        pageWindow: { current: ['source-a'], next: ['source-b'] },
      }), []);
      const translation = useReaderTranslation('legacy-markers', 0, source, pageOptions);
      return (
        <div data-testid="legacy-content" dangerouslySetInnerHTML={{
          __html: translation.translatedContent ?? source,
        }} />
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: {
          getOpenAiKey: () => null,
          setOpenAiKey: () => {},
          getOpenAiModel: () => 'gpt-5.6-luna',
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
          get: () => ({
            content: legacyHtml,
            timestamp: 123,
            useCefr: false,
            targetLanguage: 'English',
            cefrLevel: 'B2',
          }),
          set: () => {},
          remove: () => {},
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await waitFor(() => expect(screen.getByText('Legacy three.')).toBeInTheDocument());
    const rendered = screen.getByTestId('legacy-content');
    expect(rendered.querySelector('[data-pr-segment-id]')).not.toBeNull();
    expect(rendered.querySelector('[data-pr-source-hash]')).not.toBeNull();
    expect(translateSegments).not.toHaveBeenCalled();
  });

  it('repairs only an empty BYOK segment and keeps the successful segment', async () => {
    const user = userEvent.setup();
    const createChatCompletion = vi.fn(async (request: any) => {
      const prompt = request.body.messages[1].content as string;
      if (createChatCompletion.mock.calls.length === 1) {
        return {
          content: [
            '<pr-translation-segment data-pr-segment-id="a"><p>Translated A.</p></pr-translation-segment>',
            '<pr-translation-segment data-pr-segment-id="b">   </pr-translation-segment>',
          ].join(''),
        };
      }
      expect(prompt).toContain('data-pr-segment-id="b"');
      expect(prompt).not.toContain('data-pr-segment-id="a"');
      return {
        content: '<pr-translation-segment data-pr-segment-id="b"><p>Translated B.</p></pr-translation-segment>',
      };
    });
    const segments = [
      { id: 'a', html: '<p>A.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>B.</p>', sourceHash: 'hash-b' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments,
        pageWindow: { current: ['a', 'b'], next: [] },
      }), []);
      const translation = useReaderTranslation('empty-byok', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate empty</button>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: {
          getOpenAiKey: () => 'sk-test',
          setOpenAiKey: () => {},
          getOpenAiModel: () => 'gpt-5.6-luna',
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
        llmChat: { createChatCompletion },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate empty' }));
    await waitFor(() => expect(screen.getByText('Translated B.')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Translated A.')).toBeInTheDocument();
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('repairs only a duplicated BYOK segment and keeps the unambiguous paid result', async () => {
    const user = userEvent.setup();
    const createChatCompletion = vi.fn(async (request: any) => {
      const prompt = request.body.messages[1].content as string;
      if (createChatCompletion.mock.calls.length === 1) {
        return {
          content: [
            '<pr-translation-segment data-pr-segment-id="a"><p>Ambiguous A one.</p></pr-translation-segment>',
            '<pr-translation-segment data-pr-segment-id="a"><p>Ambiguous A two.</p></pr-translation-segment>',
            '<pr-translation-segment data-pr-segment-id="b"><p>Translated B.</p></pr-translation-segment>',
          ].join(''),
        };
      }
      expect(prompt).toContain('data-pr-segment-id="a"');
      expect(prompt).not.toContain('data-pr-segment-id="b"');
      return {
        content: '<pr-translation-segment data-pr-segment-id="a"><p>Translated A.</p></pr-translation-segment>',
      };
    });
    const segments = [
      { id: 'a', html: '<p>A.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>B.</p>', sourceHash: 'hash-b' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments,
        pageWindow: { current: ['a', 'b'], next: [] },
      }), []);
      const translation = useReaderTranslation('duplicate-byok', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate duplicate</button>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: { ...translationPrefs(false), getOpenAiKey: () => 'sk-test' },
        llmChat: { createChatCompletion },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate duplicate' }));
    await waitFor(() => expect(screen.getByText('Translated A.')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByText('Translated B.')).toBeInTheDocument();
    expect(screen.queryByText(/Ambiguous A/)).not.toBeInTheDocument();
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keeps a malformed current page entirely original and retries only the missing paid segment', async () => {
    const user = userEvent.setup();
    const segments = [
      { id: 'a', html: '<p>Source A.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>Source B.</p>', sourceHash: 'hash-b' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => ({
      // The first response represents a backend batch whose one repair has
      // already been exhausted. Segment A is still a paid, trustworthy result.
      segments: translateSegments.mock.calls.length === 1
        ? [{
            id: 'a',
            sourceHash: 'hash-a',
            translatedHtml: '<p>Translated A.</p>',
          }]
        : request.segments.map((segment: any) => ({
            id: segment.id,
            sourceHash: segment.sourceHash,
            translatedHtml: `<p>Translated ${segment.id.toUpperCase()}.</p>`,
          })),
    }));

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments,
        pageWindow: { current: ['a', 'b'], next: [] },
      }), []);
      const translation = useReaderTranslation('atomic-page', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate atomic</button>
          {translation.pageTranslationError && (
            <button onClick={translation.retryPageTranslation}>Retry atomic</button>
          )}
          <div data-testid="atomic-content" dangerouslySetInnerHTML={{
            __html: translation.translatedContent ?? source,
          }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(false),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate atomic' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry atomic' })).toBeInTheDocument());
    const failedPage = screen.getByTestId('atomic-content');
    expect(failedPage).toHaveTextContent('Source A.');
    expect(failedPage).toHaveTextContent('Source B.');
    expect(failedPage).not.toHaveTextContent('Translated A.');
    expect(translateSegments).toHaveBeenCalledTimes(1);
    expect(translateSegments.mock.calls[0][0].segments.map((item: any) => item.id)).toEqual(['a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Retry atomic' }));
    await waitFor(() => expect(screen.getByText('Translated B.')).toBeInTheDocument());
    expect(screen.getByText('Translated A.')).toBeInTheDocument();
    expect(translateSegments).toHaveBeenCalledTimes(2);
    expect(translateSegments.mock.calls[1][0].segments.map((item: any) => item.id)).toEqual(['b']);
  });

  it('commits a fully translated page when IndexedDB persistence fails without paying twice', async () => {
    const user = userEvent.setup();
    const segment = { id: 'paid', html: '<p>Paid source.</p>', sourceHash: 'hash-paid' };
    const source = `<div data-pr-segment-id="paid">${segment.html}</div>`;
    const putMany = vi.fn(async () => {
      throw new Error('IndexedDB is read-only');
    });
    const translateSegments = vi.fn(async (request: any) => ({
      segments: request.segments.map((item: any) => ({
        id: item.id,
        sourceHash: item.sourceHash,
        translatedHtml: '<p>Paid translation.</p>',
      })),
    }));

    function Harness() {
      const [layoutVersion, setLayoutVersion] = useState(0);
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments: [segment],
        pageWindow: { current: ['paid'], next: [] },
        layoutVersion,
        getLayoutSnapshot: () => ({ ready: true, version: layoutVersion }),
      }), [layoutVersion]);
      const translation = useReaderTranslation('cache-write-failure', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate paid</button>
          <button onClick={() => setLayoutVersion((value) => value + 1)}>Reflow paid</button>
          <span data-testid="paid-error">{translation.pageTranslationError ?? 'ok'}</span>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(false),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: {
            ...segmentCacheWithGetMany(async (keys) => keys.map(() => null)),
            putMany,
          },
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate paid' }));
    await waitFor(() => expect(screen.getByText('Paid translation.')).toBeInTheDocument());
    expect(screen.getByTestId('paid-error')).toHaveTextContent('ok');
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(translateSegments).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Reflow paid' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(translateSegments).toHaveBeenCalledTimes(1);
  });

  it('translates explicitly through an IndexedDB read failure and retains the paid result', async () => {
    const user = userEvent.setup();
    const segment = { id: 'read-failure', html: '<p>Read failure source.</p>', sourceHash: 'hash-read' };
    const source = `<div data-pr-segment-id="read-failure">${segment.html}</div>`;
    const getMany = vi.fn(async () => {
      throw new Error('IndexedDB unavailable');
    });
    const translateSegments = vi.fn(async (request: any) => ({
      segments: request.segments.map((item: any) => ({
        id: item.id,
        sourceHash: item.sourceHash,
        translatedHtml: '<p>Translation survived cache read failure.</p>',
      })),
    }));

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments: [segment],
        pageWindow: { current: ['read-failure'], next: [] },
      }), []);
      const translation = useReaderTranslation('cache-read-failure', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate read failure</button>
          <span data-testid="read-error">{translation.pageTranslationError ?? 'ok'}</span>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(false),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: segmentCacheWithGetMany(getMany),
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate read failure' }));
    await waitFor(() => expect(screen.getByText('Translation survived cache read failure.')).toBeInTheDocument());
    expect(screen.getByTestId('read-error')).toHaveTextContent('ok');
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(translateSegments).toHaveBeenCalledTimes(1);
  });

  it('keeps segmented translation off after Show original, including future pages', async () => {
    const user = userEvent.setup();
    const segments = [
      { id: 'a', html: '<p>Source A.</p>', sourceHash: 'hash-a' },
      { id: 'b', html: '<p>Source B.</p>', sourceHash: 'hash-b' },
      { id: 'c', html: '<p>Source C.</p>', sourceHash: 'hash-c' },
      { id: 'd', html: '<p>Source D.</p>', sourceHash: 'hash-d' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn(async (request: any) => ({
      segments: request.segments.map((segment: any) => ({
        id: segment.id,
        sourceHash: segment.sourceHash,
        translatedHtml: `<p>Unexpected ${segment.id}</p>`,
      })),
    }));
    const getMany = vi.fn(async (keys: readonly any[]) => keys.map((key) =>
      !key.useCefr && (key.segmentId === 'a' || key.segmentId === 'b')
        ? {
            version: 2,
            key,
            translatedHtml: `<p>Cached ${key.segmentId.toUpperCase()}.</p>`,
            timestamp: 100,
            modelUsed: key.model,
          }
        : null
    ));

    function Harness() {
      const [pageWindow, setPageWindow] = useState({ current: ['a'], next: ['b'] });
      const pageOptions = useMemo(
        () => ({ annotatedHtml: source, segments, pageWindow }),
        [pageWindow],
      );
      const translation = useReaderTranslation('autoload-suppression', 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => translation.clearTranslation({ suppressAutoload: true })}>
            Original segmented
          </button>
          <button onClick={() => setPageWindow({ current: ['c'], next: ['d'] })}>
            Advance after original
          </button>
          <span data-testid="segmented-mode">
            {translation.isTranslated ? 'translated' : 'source'}
          </span>
          <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(true),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: segmentCacheWithGetMany(getMany),
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await waitFor(() => expect(screen.getByText('Cached A.')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(translateSegments).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Original segmented' }));
    expect(screen.getByTestId('segmented-mode')).toHaveTextContent('source');
    expect(screen.getByText('Source A.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Advance after original' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId('segmented-mode')).toHaveTextContent('source');
    expect(translateSegments).not.toHaveBeenCalled();
  });

  it.each([
    {
      cacheState: 'no exact cached segment',
      segments: segmentCacheWithGetMany(async (keys) => keys.map(() => null)),
    },
    {
      cacheState: 'a failed cache lookup',
      segments: segmentCacheWithGetMany(async () => {
        throw new Error('IndexedDB unavailable');
      }),
    },
    {
      cacheState: 'no segmented cache port',
      segments: undefined,
    },
  ])('does not spend during segmented autoload with $cacheState', async ({ segments: segmentCache }) => {
    const segment = { id: 'uncached', html: '<p>Uncached source.</p>', sourceHash: 'hash-uncached' };
    const source = `<div data-pr-segment-id="uncached">${segment.html}</div>`;
    const translateSegments = vi.fn();

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments: [segment],
        pageWindow: { current: ['uncached'], next: [] },
      }), []);
      const translation = useReaderTranslation('uncached-autoload', 0, source, pageOptions);
      return (
        <span data-testid="uncached-autoload-state">
          {translation.isTranslated ? 'translated' : 'source'}
        </span>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(true),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          ...(segmentCache ? { segments: segmentCache } : {}),
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId('uncached-autoload-state')).toHaveTextContent('source');
    expect(translateSegments).not.toHaveBeenCalled();
  });

  it('does not spend when segmented autoload finds only part of the current page cached', async () => {
    const segments = [
      { id: 'cached', html: '<p>Cached source.</p>', sourceHash: 'hash-cached' },
      { id: 'missing', html: '<p>Missing source.</p>', sourceHash: 'hash-missing' },
      { id: 'lookahead', html: '<p>Lookahead source.</p>', sourceHash: 'hash-lookahead' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn();
    const getMany = vi.fn(async (keys: readonly any[]) => keys.map((key) =>
      !key.useCefr && key.segmentId === 'cached'
        ? {
            version: 2,
            key,
            translatedHtml: '<p>Cached translation.</p>',
            timestamp: 100,
            modelUsed: key.model,
          }
        : null
    ));

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments,
        pageWindow: { current: ['cached', 'missing'], next: ['lookahead'] },
      }), []);
      const translation = useReaderTranslation('partial-autoload', 0, source, pageOptions);
      return (
        <span data-testid="partial-autoload-state">
          {translation.isTranslated ? 'translated' : 'source'}
        </span>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(true),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: segmentCacheWithGetMany(getMany),
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
    });
    expect(screen.getByTestId('partial-autoload-state')).toHaveTextContent('source');
    expect(translateSegments).not.toHaveBeenCalled();
  });

  it('keeps autoload cache-only when the current page is cached but lookahead is missing', async () => {
    const segments = [
      { id: 'current', html: '<p>Current source.</p>', sourceHash: 'hash-current' },
      { id: 'lookahead', html: '<p>Lookahead source.</p>', sourceHash: 'hash-lookahead' },
    ];
    const source = segments
      .map((segment) => `<div data-pr-segment-id="${segment.id}">${segment.html}</div>`)
      .join('');
    const translateSegments = vi.fn();
    const getMany = vi.fn(async (keys: readonly any[]) => keys.map((key) =>
      !key.useCefr && key.segmentId === 'current'
        ? {
            version: 2,
            key,
            translatedHtml: '<p>Cached current.</p>',
            timestamp: 100,
            modelUsed: key.model,
          }
        : null
    ));

    function Harness() {
      const pageOptions = useMemo(() => ({
        annotatedHtml: source,
        segments,
        pageWindow: { current: ['current'], next: ['lookahead'] },
      }), []);
      const translation = useReaderTranslation('cache-only-lookahead', 0, source, pageOptions);
      return <div dangerouslySetInnerHTML={{ __html: translation.translatedContent ?? source }} />;
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(true),
        translationCache: {
          get: () => null,
          set: () => {},
          remove: () => {},
          segments: segmentCacheWithGetMany(getMany),
        },
        backend: { translation: { translateSegments } as any },
      },
    });

    await waitFor(() => expect(screen.getByText('Cached current.')).toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(translateSegments).not.toHaveBeenCalled();
    expect(screen.getByText('Lookahead source.')).toBeInTheDocument();
  });

  it('clears the busy state and does not start work for a replacement book', async () => {
    const user = userEvent.setup();
    const segment = { id: 'book-segment', html: '<p>Book source.</p>', sourceHash: 'hash-book' };
    const source = `<div data-pr-segment-id="book-segment">${segment.html}</div>`;
    const pageOptions = {
      annotatedHtml: source,
      segments: [segment],
      pageWindow: { current: ['book-segment'], next: [] },
    };
    const translateSegments = vi.fn(() => new Promise(() => {}));

    function Harness() {
      const [bookId, setBookId] = useState('book-a');
      const translation = useReaderTranslation(bookId, 0, source, pageOptions);
      return (
        <div>
          <button onClick={() => void translation.translateCurrent(false)}>Translate book</button>
          <button onClick={() => setBookId('book-b')}>Replace book</button>
          <span data-testid="book-reset-state">
            {translation.isTranslating ? 'busy' : 'idle'}
          </span>
        </div>
      );
    }

    renderWithProviders(<Harness />, {
      depsOverride: {
        prefs: translationPrefs(false),
        backend: { translation: { translateSegments } as any },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Translate book' }));
    await waitFor(() => expect(translateSegments).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('book-reset-state')).toHaveTextContent('busy');

    await user.click(screen.getByRole('button', { name: 'Replace book' }));
    await waitFor(() => expect(screen.getByTestId('book-reset-state')).toHaveTextContent('idle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(translateSegments).toHaveBeenCalledTimes(1);
  });
});
