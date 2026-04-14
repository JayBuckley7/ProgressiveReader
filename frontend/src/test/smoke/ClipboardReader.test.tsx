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
});
