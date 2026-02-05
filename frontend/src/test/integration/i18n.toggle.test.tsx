import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SettingsProvider, useSettings } from '@shared/contexts/SettingsContext';
import { TopActions } from '@shared/components/TopActions';

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
    render(
      <BrowserRouter>
        <SettingsProvider>
          <TopActions currentPage="library" />
          <ToggleLang />
        </SettingsProvider>
      </BrowserRouter>
    );

    // English default
    expect(screen.getByAltText(/Progressive Reader/)).toBeInTheDocument();

    // Toggle to Japanese
    screen.getByText('toggle-lang').click();
    // After toggle, labels should update (app name is same, but nav labels differ)
    expect(await screen.findByText(/ライブラリ/)).toBeInTheDocument();
  });
});

