import { useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';

export default function LanguageSelector({ className = '' }) {
  const { t } = useTranslation('common');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const targetLanguage = language === 'ta' ? 'en' : 'ta';
  const targetLabel = targetLanguage === 'ta' ? 'தமிழ்' : 'English';
  return (
    <button
      type="button"
      className={`language-toggle ${className}`.trim()}
      aria-label={t(targetLanguage === 'ta' ? 'Switch language to Tamil' : 'Switch language to English')}
      aria-pressed={language === 'ta'}
      lang={targetLanguage}
      onClick={() => void i18n.changeLanguage(targetLanguage)}
    >
      {targetLabel}
    </button>
  );
}
