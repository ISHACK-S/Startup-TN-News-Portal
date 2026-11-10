import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import SiteLayout from '../components/SiteLayout.jsx';
import { PublicPreferencesProvider, usePublicPreferences } from './PublicPreferencesContext.jsx';
import {
  DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
  normalizePublicWebsiteConfiguration
} from '../config/public-site-defaults.js';
import i18n from '../i18n/index.js';

const STORAGE_KEY = 'startuptn-public-preferences';

function EditorialFallback() {
  const { translate } = usePublicPreferences();
  return <p>{translate('An editorial title without a verified translation')}</p>;
}

function getLanguageToggle() {
  return screen.getByRole('button', { name: /switch language to/i });
}

function renderPublicSite(configuration = DEFAULT_PUBLIC_WEBSITE_CONFIGURATION) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: configuration })
  })));
  return render(
    <MemoryRouter>
      <div className="public-site">
        <PublicPreferencesProvider>
          <SiteLayout />
          <EditorialFallback />
        </PublicPreferencesProvider>
      </div>
    </MemoryRouter>
  );
}

function NavigationHistoryControls() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)}>Go back</button>
      <button type="button" onClick={() => navigate(1)}>Go forward</button>
    </div>
  );
}

function renderPublicNavigation(initialEntry = '/') {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: DEFAULT_PUBLIC_WEBSITE_CONFIGURATION })
  })));
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <div className="public-site">
        <PublicPreferencesProvider>
          <Routes>
            <Route element={<SiteLayout />}>
              <Route path="/" element={<p>Home page route</p>} />
              <Route path="/videos" element={<p>Videos page route</p>} />
              <Route path="/videos/:id" element={<p>Individual video route</p>} />
            </Route>
          </Routes>
          <NavigationHistoryControls />
        </PublicPreferencesProvider>
      </div>
    </MemoryRouter>
  );
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  document.querySelectorAll('.admin-app').forEach((element) => element.remove());
  await i18n.changeLanguage('en');
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.highContrast;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty('color-scheme');
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

  it('defaults to light regardless of the system theme and persists manual theme selections', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    renderPublicSite();

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' });
    await user.click(toggle);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('startuptn-public-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('startuptn-public-theme')).toBe('light');
  });

  it('restores a saved dark theme regardless of the system preference', () => {
    window.localStorage.setItem('startuptn-public-theme', 'dark');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    renderPublicSite();

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores a saved light theme regardless of the system preference', () => {
    window.localStorage.setItem('startuptn-public-theme', 'light');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    renderPublicSite();

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles high contrast and switches translated interface text to Tamil', async () => {
    const user = userEvent.setup();
    renderPublicSite();

    const contrast = screen.getByRole('button', { name: 'High contrast mode' });
    await user.click(contrast);
    expect(contrast).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-high-contrast', 'true');

    const languageToggle = getLanguageToggle();
    await user.click(languageToggle);
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
    await user.click(getLanguageToggle());
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

  it('keeps Tamil navigation active across route and browser-history changes', async () => {
    const user = userEvent.setup();
    renderPublicNavigation();

    await user.click(getLanguageToggle());
    const videosLink = await screen.findByRole('link', { name: 'காணொளிகள்' });
    await user.click(videosLink);
    expect(await screen.findByText('Videos page route')).toBeInTheDocument();
    expect(videosLink).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(await screen.findByText('Home page route')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go forward' }));
    expect(await screen.findByText('Videos page route')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'முதன்மை வழிசெலுத்தல்' })).toBeInTheDocument();
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

  it('renders saved public navigation, footer, and branding without changing admin styles', async () => {
    const configuration = {
      ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
      brandingCustomized: true,
      menu: [{
        id: 'updates',
        labelEn: 'Latest updates',
        labelTa: 'சமீபத்திய புதுப்பிப்புகள்',
        destinationType: 'internal',
        destination: '/news/',
        isActive: true,
        isVisible: true,
        openInNewTab: false,
        children: []
      }],
      footer: {
        ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer,
        websiteName: 'Custom publication',
        socialLinks: [{
          id: 'linkedin',
          label: 'LinkedIn',
          url: 'https://www.linkedin.com/company/example',
          displayOrder: 10,
          isVisible: true
        }],
        copyrightEn: 'Copyright test text',
        copyrightTa: 'பதிப்புரிமை சோதனை',
        groups: [{
          id: 'custom-links',
          headingEn: 'Custom links',
          headingTa: 'தனிப்பயன் இணைப்புகள்',
          links: [{
            id: 'custom-link',
            labelEn: 'Public contact',
            labelTa: 'தொடர்பு',
            url: '/news/',
            isVisible: true,
            openInNewTab: false
          }]
        }]
      },
      branding: {
        ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding,
        websiteName: 'Custom publication',
        primaryColor: '#293f80',
        secondaryColor: '#101b3b',
        accentColor: '#ffbe24',
        backgroundColor: '#fffaf0',
        textColor: '#203040',
        fontFamily: 'Georgia'
      }
    };
    const adminShell = document.createElement('div');
    adminShell.className = 'admin-app';
    document.body.append(adminShell);
    renderPublicSite(configuration);

    expect(await screen.findByRole('link', { name: 'Latest updates' })).toBeInTheDocument();
    expect(screen.getByText('Custom links')).toBeInTheDocument();
    expect(screen.getByText('Public contact')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Copyright test text/)).toBeInTheDocument();
    expect(screen.getAllByText('Custom publication').length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(document.querySelector('.public-site').style.getPropertyValue('--public-primary')).toBe('#293f80');
      expect(document.querySelector('.public-site').style.getPropertyValue('--paper')).toBe('#fffaf0');
      expect(document.querySelector('.public-site').style.getPropertyValue('--public-font-family')).toBe('Georgia, serif');
    });
    expect(document.querySelector('.admin-app').style.getPropertyValue('--public-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--navy')).toBe('');
  });

  it('respects an explicitly published footer visibility setting', async () => {
    const configuration = {
      ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
      footer: { ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer, isVisible: false }
    };
    renderPublicSite(configuration);
    await waitFor(() => {
      expect(document.querySelector('.site-footer')).toBeNull();
    });
  });

  it('refreshes published menu, footer, and branding settings on the public site', async () => {
    let publishedConfiguration = DEFAULT_PUBLIC_WEBSITE_CONFIGURATION;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: publishedConfiguration })
    })));
    render(
      <MemoryRouter>
        <div className="public-site">
          <PublicPreferencesProvider><SiteLayout /></PublicPreferencesProvider>
        </div>
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();

    publishedConfiguration = {
      ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
      menu: [{
        ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.menu[0],
        labelEn: 'Published home',
        labelTa: 'வெளியிடப்பட்ட முகப்பு'
      }],
      footer: {
        ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer,
        copyrightEn: 'Published footer text'
      },
      branding: {
        ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding,
        primaryColor: '#243a78'
      },
      brandingCustomized: true
    };
    window.dispatchEvent(new Event('startuptn:site-config-updated'));

    expect(await screen.findByRole('link', { name: 'Published home' })).toBeInTheDocument();
    expect(await screen.findByText(/Published footer text/)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('.public-site').style.getPropertyValue('--public-primary')).toBe('#243a78');
    });
  });

  it('uses the original public defaults for empty or malformed configuration', () => {
    const normalized = normalizePublicWebsiteConfiguration({
      menu: [],
      footer: { groups: [] },
      branding: { primaryColor: '', secondaryColor: undefined, accentColor: 'red' }
    });
    expect(normalized.menu).toEqual(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.menu);
    expect(normalized.footer.groups).toEqual(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer.groups);
    expect(normalized.branding.primaryColor).toBe(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding.primaryColor);
    expect(normalized.branding.secondaryColor).toBe(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding.secondaryColor);
    expect(normalized.branding.accentColor).toBe(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding.accentColor);
    expect(normalized.brandingCustomized).toBe(false);
  });

  it('keeps menu labels in individually spaced navigation items', async () => {
    const { default: styles } = await import('../admin/website-configuration.css?raw');
    renderPublicSite();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(9);
    expect(navigation.querySelectorAll('.nav-menu-entry')).toHaveLength(9);
    expect(within(navigation).getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos');
    expect(styles).toContain('.public-site .public-menu-link');
    expect(styles).toContain('flex: 1 1 0');
    expect(styles).toContain('@media (max-width: 860px)');
    expect(styles).not.toContain('background: var(--public-primary, #293f80)');
  });

  it('navigates to videos, highlights both video routes, and supports browser history', async () => {
    const user = userEvent.setup();
    renderPublicNavigation();

    const navigation = await screen.findByRole('navigation', { name: 'Main navigation' });
    const videosLink = within(navigation).getByRole('link', { name: 'Videos' });
    expect(within(navigation).getByRole('link', { name: 'Latest news' })).toHaveAttribute('href', '/news/');
    expect(videosLink).not.toHaveAttribute('aria-current');

    await user.click(videosLink);
    expect(await screen.findByText('Videos page route')).toBeInTheDocument();
    expect(videosLink).toHaveClass('active');
    expect(videosLink).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(await screen.findByText('Home page route')).toBeInTheDocument();
    expect(videosLink).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: 'Go forward' }));
    expect(await screen.findByText('Videos page route')).toBeInTheDocument();
    expect(videosLink).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Videos active on individual video routes and in the mobile menu', async () => {
    const user = userEvent.setup();
    renderPublicNavigation('/videos/42');

    const navigation = await screen.findByRole('navigation', { name: 'Main navigation' });
    const videosLink = within(navigation).getByRole('link', { name: 'Videos' });
    expect(videosLink).toHaveClass('active');
    expect(videosLink).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Individual video route')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(navigation).toHaveClass('primary-nav--open');
    await user.click(videosLink);
    expect(navigation).not.toHaveClass('primary-nav--open');
    expect(videosLink).toHaveAttribute('aria-current', 'page');
  });
});
