import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import ClipboardReader from '@features/clipboard/components/ClipboardReader';

describe('ClipboardReader (smoke)', () => {
  it('renders title', () => {
    renderWithProviders(<ClipboardReader />);
    expect(screen.getByText(/Clipboard Reader/)).toBeInTheDocument();
  });

  it('allows enabling clipboard sync from the prompt permission state', async () => {
    const originalSecureContext = window.isSecureContext;
    const originalClipboard = navigator.clipboard;
    const originalPermissions = navigator.permissions;
    const readText = vi.fn(async () => 'clipboard text');

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn(async () => ({ state: 'prompt', onchange: null })),
      },
    });

    try {
      renderWithProviders(<ClipboardReader />);

      const enableButton = await screen.findByRole('button', { name: /Enable Clipboard/ });
      await userEvent.click(enableButton);

      await waitFor(() => {
        expect(readText).toHaveBeenCalled();
        expect(screen.getAllByText(/Entry/)[0]).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: originalSecureContext });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: originalPermissions });
    }
  });

  it('imports the kanji version of Uta-Net lyrics', async () => {
    const importKanjiLyrics = vi.fn(async () => ({
      title: '星の歌',
      artist: '試験バンド',
      text: '夜空を見上げる\n星が光っている',
      source_url: 'https://www.uta-net.com/global/en/lyric/335761/',
    }));

    renderWithProviders(<ClipboardReader />, {
      depsOverride: { backend: { lyrics: { importKanjiLyrics } } as any },
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: /Uta-Net lyrics URL/ }),
      'https://www.uta-net.com/global/en/lyric/335761/?utm_source=chatgpt.com'
    );
    await userEvent.click(screen.getByRole('button', { name: /Import Kanji/ }));

    await waitFor(() => {
      expect(importKanjiLyrics).toHaveBeenCalled();
      expect(screen.getByText('星の歌 — 試験バンド')).toBeInTheDocument();
      expect(screen.getByText(/夜空を見上げる/)).toBeInTheDocument();
    });
  });
});
