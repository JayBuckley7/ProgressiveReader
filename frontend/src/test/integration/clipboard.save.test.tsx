import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import ClipboardReader from '@features/clipboard/components/ClipboardReader';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Clipboard integration: paste and save', () => {
  it('pastes content and triggers save upload', async () => {
    const uploadBook = vi.fn(async () => ({}));
    renderWithProviders(<ClipboardReader />, { appDataOverride: { uploadBook, isAuthenticated: true } as any });

    // Simulate paste via button (uses navigator.clipboard.readText)
    // Fallback: dispatch paste event
    const pasteArea = screen.getByPlaceholderText(/paste|貼り付け/i);
    const text = 'Hello world';
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
    } as any);
    pasteEvent.clipboardData?.setData('text', text);
    pasteArea.dispatchEvent(pasteEvent);

    await waitFor(() => {
      expect(screen.getAllByText(/Entry|項目/)[0]).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save to Library|ライブラリに保存/ });
    await userEvent.click(saveBtn);
    await waitFor(() => {
      expect(uploadBook).toHaveBeenCalled();
    });
  });
});


