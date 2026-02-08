import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { TopActions } from '@shared/components/TopActions';
import { renderWithProviders } from '../test-utils';

function ToggleLang() {
  const { updateSettings } = useSettings();
  return (
    <button onClick={() => updateSettings({ uiLanguage: 'ja' })}>
      toggle-lang
    </button>
  );
}

describe('i18n toggle', () => {
  it('switches UI language via SettingsContext', async () => {
    renderWithProviders(
      <>
        <TopActions currentPage="library" />
        <ToggleLang />
      </>
    );

    // English default
    expect(screen.getAllByAltText(/Progressive Reader/)[0]).toBeInTheDocument();

    // Toggle to Japanese
    screen.getByText('toggle-lang').click();
    // After toggle, labels should update (app name is same, but nav labels differ)
    expect(await screen.findByText(/ライブラリ/)).toBeInTheDocument();
  });
});
