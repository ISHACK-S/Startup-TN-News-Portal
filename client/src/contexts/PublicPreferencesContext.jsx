import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'startuptn-public-preferences';
const FONT_SCALES = [0.85, 0.925, 1, 1.075, 1.15, 1.225, 1.3];
const DEFAULT_PREFERENCES = { fontIndex: 2, highContrast: false, language: 'en' };
const PublicPreferencesContext = createContext({
  fontIndex: DEFAULT_PREFERENCES.fontIndex,
  highContrast: false,
  language: 'en',
  fontScale: 1,
  translate: (text) => text,
  changeFontSize: () => {},
  setLanguage: () => {},
  toggleContrast: () => {}
});

const translations = {
  'en': {},
  'ta': {
    'Skip to main content': 'முக்கிய உள்ளடக்கத்திற்குச் செல்க',
    'Stories from the Tamil Nadu startup ecosystem': 'தமிழ்நாடு தொடக்க நிறுவனச் சூழலின் செய்திகள்',
    'TAMIL NADU’S STARTUP & BUSINESS DESK': 'தமிழ்நாடு தொடக்க நிறுவனங்கள் மற்றும் வணிகச் செய்திப் பிரிவு',
    'A closer look at what’s next': 'அடுத்தகட்ட வளர்ச்சிகளைப் பாருங்கள்',
    'Accessibility controls': 'அணுகல்தன்மைக் கட்டுப்பாடுகள்',
    'Decrease text size': 'எழுத்து அளவைக் குறைக்கவும்',
    'Reset text size': 'இயல்பான எழுத்து அளவு',
    'Increase text size': 'எழுத்து அளவை அதிகரிக்கவும்',
    'Contrast': 'மாறுபாடு',
    'High contrast mode': 'உயர் மாறுபாட்டுப் பயன்முறை',
    'Language': 'மொழி',
    'Home': 'முகப்பு',
    'Latest news': 'சமீபத்திய செய்திகள்',
    'Latest': 'சமீபத்திய',
    'news.': 'செய்திகள்.',
    'Startups': 'தொடக்க நிறுவனங்கள்',
    'Funding': 'நிதி',
    'Events': 'நிகழ்வுகள்',
    'Policy': 'கொள்கை',
    'Innovation': 'புதுமை',
    'Ecosystem': 'சூழல்',
    'Main navigation': 'முதன்மை வழிசெலுத்தல்',
    'Search news': 'செய்திகளைத் தேடுக',
    'Search news stories...': 'செய்திகளைத் தேடுக...',
    'Search': 'தேடுக',
    'Image unavailable': 'படம் கிடைக்கவில்லை',
    'Close navigation menu': 'வழிசெலுத்தல் பட்டியை மூடுக',
    'Open navigation menu': 'வழிசெலுத்தல் பட்டியைத் திறக்கவும்',
    'Featured story': 'சிறப்புச் செய்தி',
    'Read the story': 'செய்தியைப் படிக்கவும்',
    'The newsroom': 'செய்தியகம்',
    'More headlines': 'மேலும் தலைப்புச் செய்திகள்',
    'More headlines list': 'மேலும் தலைப்புச் செய்திகளின் பட்டியல்',
    'Recent headlines': 'சமீபத்திய தலைப்புச் செய்திகள்',
    'All news': 'அனைத்துச் செய்திகள்',
    'Browse all latest headlines': 'அனைத்து சமீபத்திய தலைப்புச் செய்திகளையும் காண்க',
    'Browse all latest news': 'அனைத்து சமீபத்திய செய்திகளையும் காண்க',
    'Published stories from the Tamil Nadu startup ecosystem.': 'தமிழ்நாடு தொடக்க நிறுவனச் சூழலில் வெளியான செய்திகள்.',
    'New reporting and updates': 'புதிய செய்திகள் மற்றும் புதுப்பிப்புகள்',
    'All stories': 'அனைத்துச் செய்திகள்',
    'Browse all stories': 'அனைத்துச் செய்திகளையும் காண்க',
    'Featured picks from the newsroom': 'செய்தியகத்தின் சிறப்புத் தேர்வுகள்',
    'Featured stories': 'சிறப்புச் செய்திகள்',
    'Latest by category': 'பிரிவுவாரியான சமீபத்திய செய்திகள்',
    'From the ecosystem': 'சூழலிலிருந்து',
    'More': 'மேலும்',
    'More reporting from the ecosystem will appear here as it is published.': 'சூழல் தொடர்பான புதிய செய்திகள் வெளியிடப்படும்போது இங்கே இடம்பெறும்.',
    'The published stories above are the latest from the newsroom.': 'மேலே உள்ள செய்திகள் செய்தியகத்தின் சமீபத்திய வெளியீடுகள்.',
    'The story': 'செய்தி',
    'Source:': 'மூலம்:',
    'Share this story': 'இந்தச் செய்தியைப் பகிரவும்',
    'Share on Facebook': 'Facebook-இல் பகிரவும்',
    'Share on LinkedIn': 'LinkedIn-இல் பகிரவும்',
    'Share on X': 'X-இல் பகிரவும்',
    'Share by email': 'மின்னஞ்சலில் பகிரவும்',
    'Explore the newsroom': 'செய்தியகத்தைப் பார்வையிடவும்',
    'Find a story': 'செய்தியைத் தேடுக',
    'About this story': 'இந்தச் செய்தியைப் பற்றி',
    'Published': 'வெளியிடப்பட்டது',
    'Written by': 'எழுதியவர்',
    'Reading time': 'வாசிப்பு நேரம்',
    'Section': 'பிரிவு',
    'View original source': 'அசல் மூலத்தைப் பார்க்கவும்',
    'Fresh from the desk': 'செய்தியகத்தின் புதிய செய்திகள்',
    'Recent stories': 'சமீபத்திய செய்திகள்',
    'Browse all recent stories': 'அனைத்து சமீபத்திய செய்திகளையும் காண்க',
    'Recent stories are temporarily unavailable.': 'சமீபத்திய செய்திகள் தற்காலிகமாகக் கிடைக்கவில்லை.',
    'More reporting from the newsroom will appear here soon.': 'செய்தியகத்தின் மேலும் செய்திகள் விரைவில் இங்கே இடம்பெறும்.',
    'Continue exploring': 'தொடர்ந்து பார்வையிடுங்கள்',
    'The details': 'விவரங்கள்',
    'More from the newsroom': 'செய்தியகத்திலிருந்து மேலும்',
    'Filter by category': 'பிரிவின்படி வடிகட்டுக',
    'News': 'செய்திகள்',
    'Breadcrumb': 'வழிசெலுத்தல் பாதை',
    'Back to latest news': 'சமீபத்திய செய்திகளுக்குத் திரும்பவும்',
    'Article reading progress': 'செய்தி வாசிப்பு முன்னேற்றம்',
    'min': 'நிமிடம்',
    'Read story': 'செய்தியைப் படிக்கவும்',
    'This story may have moved, or is no longer available.': 'இந்தச் செய்தி மாற்றப்பட்டிருக்கலாம் அல்லது இனி கிடைக்காமல் இருக்கலாம்.',
    'Search by headline or summary': 'தலைப்பு அல்லது சுருக்கத்தைத் தேடுக',
    'Search headlines and summaries': 'தலைப்புகள் மற்றும் சுருக்கங்களைத் தேடுக',
    'Reporting, perspectives and updates from across Tamil Nadu’s startup ecosystem.': 'தமிழ்நாட்டின் தொடக்க நிறுவனச் சூழல் குறித்த செய்திகள், பார்வைகள் மற்றும் புதுப்பிப்புகள்.',
    'Results for': 'இதற்கான முடிவுகள்',
    'in': 'இல்',
    'Page': 'பக்கம்',
    'of': '/',
    'Categories are temporarily unavailable. You can still search all published stories.': 'பிரிவுகள் தற்காலிகமாகக் கிடைக்கவில்லை. வெளியிடப்பட்ட செய்திகளைத் தொடர்ந்து தேடலாம்.',
    'No stories match those filters.': 'இந்த வடிகட்டிகளுக்கு ஏற்ற செய்திகள் இல்லை.',
    'The newsroom is getting ready.': 'செய்தியகம் தயாராகி வருகிறது.',
    'Try a different search or select another category.': 'வேறு தேடலை முயற்சிக்கவும் அல்லது வேறு பிரிவைத் தேர்ந்தெடுக்கவும்.',
    'No articles have been published yet. Please check back soon.': 'இதுவரை செய்திகள் வெளியிடப்படவில்லை. விரைவில் மீண்டும் பார்க்கவும்.',
    'There are no published stories just yet. Check back soon for verified news and updates from Tamil Nadu’s startup ecosystem.': 'இப்போதைக்கு வெளியிடப்பட்ட செய்திகள் இல்லை. தமிழ்நாட்டின் தொடக்க நிறுவனச் சூழலின் சரிபார்க்கப்பட்ட செய்திகள் மற்றும் புதுப்பிப்புகளுக்கு விரைவில் மீண்டும் பார்க்கவும்.',
    'Previous': 'முந்தையது',
    'Next': 'அடுத்தது',
    'News pages': 'செய்திப் பக்கங்கள்',
    'A small pause': 'சிறிய இடைவேளை',
    'We couldn’t load the news.': 'செய்திகளை ஏற்ற முடியவில்லை.',
    'Please check your connection and try again.': 'இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
    'Try again': 'மீண்டும் முயற்சிக்கவும்',
    'No stories found': 'செய்திகள் எதுவும் இல்லை',
    'Try another search or category.': 'வேறு தேடல் அல்லது பிரிவை முயற்சிக்கவும்.',
    'Loading news': 'செய்திகள் ஏற்றப்படுகின்றன',
    'Loading article': 'செய்தி ஏற்றப்படுகிறது',
    'No published stories': 'வெளியிடப்பட்ட செய்திகள் இல்லை',
    'Explore': 'பார்வையிடுக',
    'Independent stories and perspectives from across Tamil Nadu’s startup ecosystem.': 'தமிழ்நாட்டின் தொடக்க நிறுவனச் சூழல் குறித்த சுயாதீனச் செய்திகள் மற்றும் பார்வைகள்.',
    'Independent editorial project · Not an official StartupTN publication': 'சுயாதீனச் செய்தித் திட்டம் · அதிகாரப்பூர்வ StartupTN வெளியீடு அல்ல',
    'Back to top': 'மேலே செல்லவும்',
    'Return to the front page': 'முகப்புப் பக்கத்திற்குத் திரும்பவும்',
    'This page is off the record.': 'இந்தப் பக்கம் கிடைக்கவில்லை.',
    'The story may have moved, or the address might be incomplete.': 'இந்தச் செய்தி மாற்றப்பட்டிருக்கலாம் அல்லது முகவரி முழுமையற்றதாக இருக்கலாம்.',
    '404 · Story not found': '404 · செய்தி கிடைக்கவில்லை',
    'By': 'எழுதியவர்',
    'min read': 'நிமிட வாசிப்பு',
    'Recently published': 'சமீபத்தில் வெளியிடப்பட்டது'
  }
};

function readPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      fontIndex: Number.isInteger(stored.fontIndex)
        ? Math.max(0, Math.min(FONT_SCALES.length - 1, stored.fontIndex))
        : DEFAULT_PREFERENCES.fontIndex,
      highContrast: stored.highContrast === true,
      language: stored.language === 'ta' ? 'ta' : 'en'
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function PublicPreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const fontScale = FONT_SCALES[preferences.fontIndex];
  const initialDocumentLanguage = useRef(document.documentElement.lang || 'en');

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = preferences.language;
    root.dataset.highContrast = String(preferences.highContrast);
    root.style.setProperty('--user-font-scale', String(fontScale));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences remain active for this page session when storage is unavailable.
    }
  }, [fontScale, preferences]);

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
      document.documentElement.lang = initialDocumentLanguage.current;
    };
  }, []);

  const translate = useCallback((text) => translations[preferences.language][text] ?? text, [preferences.language]);
  const changeFontSize = useCallback((direction) => {
    setPreferences((current) => ({
      ...current,
      fontIndex: direction === 0
        ? DEFAULT_PREFERENCES.fontIndex
        : Math.max(0, Math.min(FONT_SCALES.length - 1, current.fontIndex + direction))
    }));
  }, []);
  const setLanguage = useCallback((language) => {
    setPreferences((current) => ({ ...current, language: language === 'ta' ? 'ta' : 'en' }));
  }, []);
  const toggleContrast = useCallback(() => {
    setPreferences((current) => ({ ...current, highContrast: !current.highContrast }));
  }, []);

  const value = useMemo(() => ({
    ...preferences,
    fontScale,
    translate,
    changeFontSize,
    setLanguage,
    toggleContrast
  }), [preferences, fontScale, translate, changeFontSize, setLanguage, toggleContrast]);

  return <PublicPreferencesContext.Provider value={value}>{children}</PublicPreferencesContext.Provider>;
}

export function usePublicPreferences() {
  return useContext(PublicPreferencesContext);
}
