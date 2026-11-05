import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector.jsx';
import { ApiError } from '../api/client.js';
import { translateAdminModuleLabel, translatePermissionAction } from './adminLabels.js';
import i18n from './index.js';

function LocalizedLabels() {
  const { t } = useTranslation('admin');
  return <p>{t('Overview')}</p>;
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
  window.localStorage.clear();
});

describe('application internationalization', () => {
  it('switches admin interface language immediately and persists the selection', async () => {
    await i18n.changeLanguage('en');
    render(<><LanguageSelector /><LocalizedLabels /></>);
    expect(screen.getByText('Overview')).toBeInTheDocument();

    const languageButton = screen.getByRole('button', { name: 'Switch language to Tamil' });
    expect(languageButton).toHaveTextContent('தமிழ்');
    expect(languageButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(languageButton);

    expect(await screen.findByText('மேலோட்டம்')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'ta');
    expect(JSON.parse(window.localStorage.getItem('startuptn-public-preferences')).language).toBe('ta');
    expect(screen.getByRole('button', { name: 'ஆங்கிலத்திற்கு மொழியை மாற்றவும்' })).toHaveTextContent('English');
    expect(screen.getByRole('button', { name: 'ஆங்கிலத்திற்கு மொழியை மாற்றவும்' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'ஆங்கிலத்திற்கு மொழியை மாற்றவும்' }));
    expect(await screen.findByText('Overview')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
  });

  it('uses the English fallback for genuinely untranslated text without exposing keys', async () => {
    await i18n.changeLanguage('ta');
    expect(i18n.t('A new untranslated interface message', {
      ns: 'admin',
      defaultValue: 'A new untranslated interface message'
    })).toBe('A new untranslated interface message');
    expect(i18n.t('Overview', { ns: 'admin' })).not.toBe('Overview');
  });

  it('keeps Tamil text as valid Unicode', () => {
    expect(i18n.t('language', { ns: 'common', lng: 'ta' })).toBe('மொழி');
    expect([...i18n.t('language', { ns: 'common', lng: 'ta' })].length).toBeGreaterThan(1);
  });

  it('localizes permission display labels while preserving module and action identifiers', async () => {
    await i18n.changeLanguage('en');
    expect(translateAdminModuleLabel('news-articles', 'News Articles')).toBe('News Articles');
    expect(translatePermissionAction('view')).toBe('View');

    await i18n.changeLanguage('ta');
    expect(translateAdminModuleLabel('news-articles', 'News Articles')).toBe('செய்திக் கட்டுரைகள்');
    expect(translatePermissionAction('view')).toBe('பார்க்கவும்');
    expect(translateAdminModuleLabel('custom-module', 'Custom module')).toBe('Custom module');
  });

  it('localizes known API and field-validation messages', async () => {
    await i18n.changeLanguage('ta');
    const error = new ApiError('Invalid email or password.', 401, [
      { path: 'password', message: 'The current password is incorrect.' }
    ]);
    expect(error.message).toBe('மின்னஞ்சல் முகவரி அல்லது கடவுச்சொல் தவறானது.');
    expect(error.details[0].message).toBe('தற்போதைய கடவுச்சொல் தவறானது.');
  });
});
