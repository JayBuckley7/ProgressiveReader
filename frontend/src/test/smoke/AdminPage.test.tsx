import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { AdminPage } from '@features/admin/components/AdminPage';

describe('AdminPage (smoke)', () => {
  it('renders admin header after loading', async () => {
    renderWithProviders(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText(/Admin Panel|管理パネル/)).toBeInTheDocument();
    });
  });
});


