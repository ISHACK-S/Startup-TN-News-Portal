import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SiteLayout from '../components/SiteLayout.jsx';
import { PublicPreferencesProvider, usePublicPreferences } from './PublicPreferencesContext.jsx';

const STORAGE_KEY = 'startuptn-public-preferences';

function EditorialFallback() {
  const { translate } = usePublicPreferences();
  return <p>{translate('An editorial title without a verified translation')}</p>;
}

function renderPublicSite() {
  return render(
    <MemoryRouter>
      <PublicPreferencesProvider>
        <SiteLayout />
        <EditorialFallback />
      </PublicPreferencesProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.highContrast;
  document.documentElement.style.removeProperty('--user-font-scale');
});

describe('public accessibility preferences', () => {
  it('changes text size, stops at both limits, and resets to default', async () => {
    const user = userEvent.setup();
    renderPublicSite();

    const increase = screen.getByRole('button', { name: 'Increase text size' });
    const decrease = screen.getByRole('button', { name: 'Decrease text size' });
    const reset = screen.getByRole('button', { name: 'Reset text size' });

    expect(document.documentElement.style.getPropertyValue('--user-font-scale')).toBe('1');
    for (let index = 0; index < 4; index += 1) await user.click(increase);
    expect(document.documentElement.style.getPropertyValue('--user-font-scale')).toBe('1.3');
    expect(increase).toBeDisabled();

    for (let index = 0; index < 6; index += 1) await user.click(decrease);
    expect(document.documentElement.style.getPropertyValue('--user-font-scale')).toBe('0.85');
    expect(decrease).toBeDisabled();

    await user.click(reset);
    expect(document.documentElement.style.getPropertyValue('--user-font-scale')).toBe('1');
    expect(reset).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles high contrast and switches translated interface text to Tamil', async () => {
    const user = userEvent.setup();
    renderPublicSite();

    const contrast = screen.getByRole('button', { name: 'High contrast mode' });
    await user.click(contrast);
    expect(contrast).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-high-contrast', 'true');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'ta');
    expect(document.documentElement.lang).toBe('ta');
    expect(screen.getByRole('navigation', { name: 'முதன்மை வழிசெலுத்தல்' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'அணுகல்தன்மைக் கட்டுப்பாடுகள்' })).toBeInTheDocument();
    expect(screen.getByText('தமிழ்நாடு தொடக்க நிறுவனங்கள் மற்றும் வணிகச் செய்திப் பிரிவு')).toBeInTheDocument();
    expect(screen.getByText('An editorial title without a verified translation')).toBeInTheDocument();

    await user.click(contrast);
    expect(contrast).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).toHaveAttribute('data-high-contrast', 'false');
  });

  it('persists preferences across a public-page remount', async () => {
    const user = userEvent.setup();
    const firstRender = renderPublicSite();

    await user.click(screen.getByRole('button', { name: 'Increase text size' }));
    await user.click(screen.getByRole('button', { name: 'High contrast mode' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'ta');
    const savedPreferences = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(savedPreferences).toEqual({ fontIndex: 3, highContrast: true, language: 'ta' });

    firstRender.unmount();
    renderPublicSite();

    expect(document.documentElement).toHaveAttribute('lang', 'ta');
    expect(document.documentElement).toHaveAttribute('data-high-contrast', 'true');
    expect(document.documentElement.style.getPropertyValue('--user-font-scale')).toBe('1.075');
    expect(within(screen.getByRole('navigation', { name: 'முதன்மை வழிசெலுத்தல்' }))
      .getByRole('link', { name: 'முகப்பு' })).toBeInTheDocument();
  });

  it('places a keyboard-accessible skip link before the header and targets main content', async () => {
    const user = userEvent.setup();
    renderPublicSite();

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink.compareDocumentPosition(screen.getByRole('banner')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
