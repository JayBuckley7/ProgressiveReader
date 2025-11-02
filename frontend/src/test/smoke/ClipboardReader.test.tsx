import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import ClipboardReader from '@features/clipboard/components/ClipboardReader';

describe('ClipboardReader (smoke)', () => {
  it('renders title', () => {
    renderWithProviders(<ClipboardReader />);
    expect(screen.getByText(/Clipboard Reader|クリップボードリーダー/)).toBeInTheDocument();
  });
});


