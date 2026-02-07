import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { VocabularyPage } from '@features/vocabulary/components/VocabularyPage';

describe('Vocabulary integration: due cards', () => {
  it('fetch button loads and displays mock due cards count', async () => {
    renderWithProviders(<VocabularyPage />);

    // Select a JPDB deck first (required to enable due fetch).
    await userEvent.click(screen.getByText(/Select JPDB Deck/i));
    await userEvent.click(await screen.findByText(/My Deck/i));

    const btn = screen.getByRole('button', { name: /Fetch Due Cards|期限カードを取得/ });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('誰')).toBeInTheDocument();
      expect(screen.getByText('水')).toBeInTheDocument();
    });
  });
});
