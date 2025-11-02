import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { VocabularyPage } from '@features/vocabulary/components/VocabularyPage';

describe('VocabularyPage (smoke)', () => {
  it('renders header', () => {
    renderWithProviders(<VocabularyPage />);
    const heading = screen.getByRole('heading', { level: 1, name: /Vocabulary|語彙/ });
    expect(heading).toBeInTheDocument();
  });
});


