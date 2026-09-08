import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, createTestDeps } from '../test-utils';
import { VocabularyPage } from '@features/vocabulary/components/VocabularyPage';

describe('Vocabulary integration: due cards', () => {
  it('fetch button loads and displays mock due cards count', async () => {
    localStorage.clear();
    const deps = createTestDeps();
    const lookup = vi.fn(async () => [
      { vid: 1, sid: 1, spelling: '誰', reading: 'だれ', meanings: ['who'], due_at: 1, card_state: ['learning'] },
      { vid: 2, sid: 1, spelling: '水', reading: 'みず', meanings: ['water'], due_at: 1, card_state: ['learning'] },
    ]);
    deps.backend.vocabulary = { ...deps.backend.vocabulary,
      fetchUserDecks: vi.fn(async () => [{ id: '1', name: 'My Deck', words: 2 }]),
      getUserVocabulary: vi.fn(async () => []),
      listDeckVocabulary: vi.fn(async () => [[1, 1], [2, 1]]),
      lookupVocabulary: lookup,
    };
    renderWithProviders(<VocabularyPage />, { depsOverride: deps });

    // Select a JPDB deck first (required to enable due fetch).
    await userEvent.click(screen.getByText(/Select JPDB Deck/i));
    await userEvent.click(await screen.findByText(/My Deck/i));
    expect(screen.getByText('Refresh to check how many words are due.')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /Fetch Due Cards|期限カードを取得/ });
    await userEvent.click(btn);
    await screen.findByText('2 words due at last check.');
    await userEvent.click(screen.getByText('Browse due words (2)'));
    await waitFor(() => {
      expect(screen.getByText('誰')).toBeInTheDocument();
      expect(screen.getByText('水')).toBeInTheDocument();
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Review in JPDB' })).toHaveAttribute('href', 'https://jpdb.io/review');
  });
});
