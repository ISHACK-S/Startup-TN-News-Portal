import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPublicWebsiteConfiguration } from '../api/news.js';
import i18n from '../i18n/index.js';
import {
  DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
  normalizePublicWebsiteConfiguration
} from '../config/public-site-defaults.js';

const STORAGE_KEY = 'startuptn-public-preferences';
const THEME_STORAGE_KEY = 'startuptn-public-theme';
const FONT_SCALES = [0.85, 0.925, 1, 1.075, 1.15, 1.225, 1.3];
const DEFAULT_PREFERENCES = { fontIndex: 2, highContrast: false };
const DEFAULT_THEME = 'light';
const PublicPreferencesContext = createContext({
  fontIndex: DEFAULT_PREFERENCES.fontIndex,
  highContrast: false,
  theme: DEFAULT_THEME,
  language: 'en',
  fontScale: 1,
  translate: (text) => text,
  siteConfiguration: DEFAULT_PUBLIC_WEBSITE_CONFIGURATION,
  configurationLoading: false,
  changeFontSize: () => {},
  toggleContrast: () => {}
});

function getInitialTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  } catch {
    // Use the default theme when storage is disabled.
  }
  return DEFAULT_THEME;
}

function readPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      fontIndex: Number.isInteger(stored.fontIndex)
        ? Math.max(0, Math.min(FONT_SCALES.length - 1, stored.fontIndex))
        : DEFAULT_PREFERENCES.fontIndex,
      highContrast: stored.highContrast === true
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function PublicPreferencesProvider({ children }) {
  const { i18n: languageI18n } = useTranslation();
  const [preferences, setPreferences] = useState(readPreferences);
  const [theme, setTheme] = useState(getInitialTheme);
  const [siteConfiguration, setSiteConfiguration] = useState(() => (
    normalizePublicWebsiteConfiguration(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION)
  ));
  const [configurationError, setConfigurationError] = useState('');
  const fontScale = FONT_SCALES[preferences.fontIndex];
  const language = languageI18n.resolvedLanguage ?? languageI18n.language;
  const initialDocumentLanguage = useRef(document.documentElement.lang || 'en');

  useEffect(() => {
    const controller = new AbortController();
    let activeController = controller;
    getPublicWebsiteConfiguration({ signal: controller.signal })
      .then((configuration) => {
        setSiteConfiguration(normalizePublicWebsiteConfiguration(configuration));
        setConfigurationError('');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Unable to load public website configuration.', error);
          setConfigurationError('Public website settings could not be refreshed.');
        }
      });

    const refresh = () => {
      activeController.abort();
      activeController = new AbortController();
      getPublicWebsiteConfiguration({ signal: activeController.signal })
        .then((configuration) => setSiteConfiguration(normalizePublicWebsiteConfiguration(configuration)))
        .then(() => setConfigurationError(''))
        .catch((error) => {
          if (error.name !== 'AbortError') {
            console.error('Unable to refresh public website configuration.', error);
            setConfigurationError('Public website settings could not be refreshed.');
          }
        });
    };
    const handleStorage = (event) => {
      if (event.key === 'startuptn:site-config-updated') refresh();
    };
    window.addEventListener('startuptn:site-config-updated', refresh);
    window.addEventListener('storage', handleStorage);
    return () => {
      activeController.abort();
      window.removeEventListener('startuptn:site-config-updated', refresh);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dataset.highContrast = String(preferences.highContrast);
    root.dataset.theme = theme;
    root.style.setProperty('--user-font-scale', String(fontScale));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, language }));
    } catch {
      // Preferences remain active for this page session when storage is unavailable.
    }
  }, [fontScale, language, preferences, theme]);

  useLayoutEffect(() => {
    let active = true;
    let scanFrame = 0;
    const scanNow = () => {
      document.querySelectorAll('[data-a11y-text]').forEach((element) => {
        element.removeAttribute('data-a11y-text');
        element.style.removeProperty('--a11y-base-font-size');
      });

      const textElements = new Set(
        [...document.querySelectorAll('button, input, select, textarea')]
      );
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const element = node.parentElement;
        if (!element || element.closest('svg, script, style, .brand, [aria-hidden="true"]')) continue;
        textElements.add(element);
      }

      const sizes = [...textElements]
        .filter((element) => element.isConnected && !element.closest('svg, script, style, .brand'))
        .map((element) => [element, getComputedStyle(element).fontSize]);
      sizes.forEach(([element, size]) => {
        element.style.setProperty('--a11y-base-font-size', size);
        element.setAttribute('data-a11y-text', '');
      });
    };
    const scanText = () => {
      if (!active) return;
      cancelAnimationFrame(scanFrame);
      scanFrame = requestAnimationFrame(scanNow);
    };

    scanNow();
    const observer = new MutationObserver(scanText);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', scanText);
    document.fonts?.ready.then(scanText);
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(scanFrame);
      window.removeEventListener('resize', scanText);
      document.querySelectorAll('[data-a11y-text]').forEach((element) => {
        element.removeAttribute('data-a11y-text');
        element.style.removeProperty('--a11y-base-font-size');
      });
      delete document.documentElement.dataset.highContrast;
      document.documentElement.style.removeProperty('--user-font-scale');
      document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language ?? initialDocumentLanguage.current;
    };
  }, []);

  useEffect(() => {
    const { branding } = siteConfiguration;
    const root = document.querySelector('.public-site');
    const colorProperties = ['--blue', '--navy', '--blue-deep', '--navy-deep', '--blue-mid', '--gold', '--gold-soft', '--orange', '--orange-dark', '--paper', '--ink', '--serif', '--public-font-family'];
    const customProperties = ['--public-primary', '--public-secondary', '--public-accent', '--public-background', '--public-text'];
    const properties = [...colorProperties, ...customProperties];
    if (root && siteConfiguration.brandingCustomized) {
      const colors = {
        '--blue': branding.primaryColor,
        '--navy': branding.primaryColor,
        '--blue-deep': branding.secondaryColor,
        '--navy-deep': branding.secondaryColor,
        '--blue-mid': `color-mix(in srgb, ${branding.secondaryColor} 82%, white)`,
        '--gold': branding.accentColor,
        '--gold-soft': branding.accentColor,
        '--orange': branding.accentColor,
        '--orange-dark': branding.secondaryColor,
        '--public-primary': branding.primaryColor,
        '--public-secondary': branding.secondaryColor,
        '--public-accent': branding.accentColor,
        '--paper': branding.backgroundColor,
        '--ink': branding.textColor,
        '--public-background': branding.backgroundColor,
        '--public-text': branding.textColor,
        '--public-font-family': branding.fontFamily === 'Trebuchet MS'
          ? '"Trebuchet MS", sans-serif'
          : branding.fontFamily === 'Inter'
            ? 'Inter, "Segoe UI", Arial, sans-serif'
            : `${branding.fontFamily}, ${branding.fontFamily === 'Georgia' ? 'serif' : 'sans-serif'}`,
        '--serif': branding.fontFamily === 'Georgia'
          ? 'Georgia, "Times New Roman", serif'
          : branding.fontFamily === 'Trebuchet MS'
            ? '"Trebuchet MS", sans-serif'
            : branding.fontFamily === 'Arial'
              ? 'Arial, sans-serif'
              : 'Georgia, "Times New Roman", serif'
      };
      for (const [property, value] of Object.entries(colors)) {
        if (property.includes('public') || property === '--blue-mid' || property === '--serif' || /^#[0-9a-f]{6}$/i.test(value)) {
          root.style.setProperty(property, value);
        }
      }
    } else if (root) {
      properties.forEach((property) => root.style.removeProperty(property));
    }
    if (root && !siteConfiguration.brandingCustomized) {
      ['--paper', '--ink', '--serif', '--public-font-family'].forEach((property) => {
        root.style.removeProperty(property);
      });
    }

    const previousFavicon = document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? null;
    let favicon;
    let createdFavicon = false;
    if (siteConfiguration.brandingCustomized && branding.faviconUrl) {
      favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.append(favicon);
        createdFavicon = true;
      }
      favicon.href = branding.faviconUrl;
    }
    return () => {
      if (createdFavicon) favicon?.remove();
      else if (favicon && previousFavicon === null) favicon.removeAttribute('href');
      else if (favicon && previousFavicon !== null) favicon.href = previousFavicon;
    };
  }, [siteConfiguration]);

  const translate = useCallback((text) => i18n.t(text, {
    ns: 'public',
    defaultValue: text
  }), []);
  const changeFontSize = useCallback((direction) => {
    setPreferences((current) => ({
      ...current,
      fontIndex: direction === 0
        ? DEFAULT_PREFERENCES.fontIndex
        : Math.max(0, Math.min(FONT_SCALES.length - 1, current.fontIndex + direction))
    }));
  }, []);
  const toggleContrast = useCallback(() => {
    setPreferences((current) => ({ ...current, highContrast: !current.highContrast }));
  }, []);
  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The selected theme remains active for this page session when storage is unavailable.
    }
  }, [theme]);

  const value = useMemo(() => ({
    ...preferences,
    theme,
    language,
    siteConfiguration,
    configurationError,
    fontScale,
    translate,
    changeFontSize,
    toggleContrast,
    toggleTheme
  }), [preferences, theme, language, siteConfiguration, configurationError, fontScale, translate, changeFontSize, toggleContrast, toggleTheme]);

  return <PublicPreferencesContext.Provider value={value}>{children}</PublicPreferencesContext.Provider>;
}

export function usePublicPreferences() {
  return useContext(PublicPreferencesContext);
}
