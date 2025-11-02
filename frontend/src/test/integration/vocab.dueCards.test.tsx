import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { VocabularyPage } from '@features/vocabulary/components/VocabularyPage';

describe('Vocabulary integration: due cards', () => {
  beforeEach(() => {
    // Configure a mock credential so the page attempts fetch
    localStorage.setItem('jpdbCookie', 'mock-cookie');
  });

  it('fetch button loads and displays mock due cards count', async () => {
    renderWithProviders(<VocabularyPage />);
    const btn = screen.getByRole('button', { name: /Fetch Due Cards|期限カードを取得/ });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('誰')).toBeInTheDocument();
      expect(screen.getByText('水')).toBeInTheDocument();
    });
  });
});


