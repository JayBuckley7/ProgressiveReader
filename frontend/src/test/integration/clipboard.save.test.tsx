import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import ClipboardReader from '@features/clipboard/components/ClipboardReader';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Clipboard integration: paste and save', () => {
  it('pastes content and triggers save upload', async () => {
    const uploadBook = vi.fn(async () => ({}));
    renderWithProviders(<ClipboardReader />, { appDataOverride: { uploadBook, isAuthenticated: true } as any });

    // Simulate paste via button (uses navigator.clipboard.readText)
    // Fallback: dispatch paste event
    const pasteArea = screen.getByRole('textbox');
    const text = 'Hello world';
    fireEvent.paste(pasteArea, {
      clipboardData: {
        getData: () => text,
      },
    });

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
