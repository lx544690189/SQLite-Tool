import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, type SupportedLanguage } from './i18n';

interface I18nContextValue {
  language: SupportedLanguage;
  t: ReturnType<typeof createTranslator>;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: createTranslator('en'),
});

export function I18nProvider({
  language,
  children,
}: {
  language: SupportedLanguage;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ language, t: createTranslator(language) }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
