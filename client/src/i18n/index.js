import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enPublic from './locales/en/public.json';
import enAdmin from './locales/en/admin.json';
import enErrors from './locales/en/errors.json';
import taCommon from './locales/ta/common.json';
import taPublic from './locales/ta/public.json';
import taAdmin from './locales/ta/admin.json';
import taErrors from './locales/ta/errors.json';

const namespaces = [
  'common', 'public', 'navigation', 'admin', 'dashboard', 'articles',
  'account', 'permissions', 'settings', 'validation', 'errors'
];

function storedLanguage() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('startuptn-public-preferences') || '{}');
    return stored.language === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
}

const emptyNamespaces = Object.fromEntries(namespaces
  .filter((namespace) => !['common', 'public', 'admin', 'errors'].includes(namespace))
  .map((namespace) => [namespace, {}]));

void i18n
  .use(initReactI18next)
  .init({
    lng: storedLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'ta'],
    defaultNS: 'common',
    ns: namespaces,
    resources: {
      en: { common: enCommon, public: enPublic, admin: enAdmin, errors: enErrors, ...emptyNamespaces },
      ta: { common: taCommon, public: taPublic, admin: taAdmin, errors: taErrors, ...emptyNamespaces }
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    initImmediate: false
  });

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  try {
    const stored = JSON.parse(window.localStorage.getItem('startuptn-public-preferences') || '{}');
    window.localStorage.setItem('startuptn-public-preferences', JSON.stringify({
      ...stored,
      language
    }));
  } catch {
    // Language changes remain active for this page session when storage is unavailable.
  }
});

export default i18n;
