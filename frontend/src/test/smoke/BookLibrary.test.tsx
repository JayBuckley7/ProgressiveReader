import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import BookLibrary from '@features/books/components/BookLibrary';

describe('BookLibrary (smoke)', () => {
  it('renders the library title', () => {
    renderWithProviders(<BookLibrary />);
    expect(screen.getByText(/My Library|マイライブラリ/i)).toBeInTheDocument();
  });
});


