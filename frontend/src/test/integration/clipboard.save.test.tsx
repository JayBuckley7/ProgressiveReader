import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import ClipboardReader from '@features/clipboard/components/ClipboardReader';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Clipboard integration: paste and save', () => {
  it('saves edited typed text without creating duplicate entries', async () => {
    const uploadBook = vi.fn(async (_file: File, _meta: unknown) => ({}));
    renderWithProviders(<ClipboardReader />, { appDataOverride: { uploadBook, isAuthenticated: true } as any });
    const editor = screen.getByRole('textbox', { name: /Text to read/ });
    const save = screen.getByRole('button', { name: /Save to Library/ });
    expect(save).toBeDisabled();
    fireEvent.change(editor, { target: { value: 'Original text' } });
    fireEvent.change(editor, { target: { value: 'Edited text' } });
    await userEvent.click(save);
    await waitFor(() => expect(uploadBook).toHaveBeenCalledTimes(1));
    const file = uploadBook.mock.calls[0][0] as File;
    const content = await new Promise<string>(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(file);
    });
    expect(content).toBe('Edited text');
  });
  it('pastes content and triggers save upload', async () => {
    const uploadBook = vi.fn(async (_file: File, _meta: unknown) => ({}));
    renderWithProviders(<ClipboardReader />, { appDataOverride: { uploadBook, isAuthenticated: true } as any });

    // Simulate paste via button (uses navigator.clipboard.readText)
    // Fallback: dispatch paste event
    const pasteArea = screen.getByPlaceholderText(/Ctrl\+V/);
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
