import { useEffect } from 'react';
import { useLocalPreference } from './useLocalPreference';

export type FontSize = 'small' | 'default' | 'large' | 'xl';
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Manages accessibility preferences (theme, font size, contrast, motion)
 * and applies them as data attributes on <html> for CSS to consume.
 */
export function useAccessibilityPrefs() {
  const [fontSize, setFontSize] = useLocalPreference<FontSize>('pref-font-size', 'default');
  const [themeMode, setThemeMode] = useLocalPreference<ThemeMode>('pref-theme-mode', 'light');
  const [highContrast, setHighContrast] = useLocalPreference<boolean>('pref-high-contrast', false);
  const [reduceMotion, setReduceMotion] = useLocalPreference<boolean>('pref-reduce-motion', false);

  // Apply font size
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);

  // Apply theme (resolve 'system' to light/dark)
  useEffect(() => {
    const applyTheme = (mode: ThemeMode) => {
      if (mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', mode);
      }
    };

    applyTheme(themeMode);

    // Listen for system theme changes when in 'system' mode
    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [themeMode]);

  // Apply high contrast
  useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', String(highContrast));
  }, [highContrast]);

  // Apply reduce motion
  useEffect(() => {
    document.documentElement.setAttribute('data-reduce-motion', String(reduceMotion));
  }, [reduceMotion]);

  return {
    fontSize,
    setFontSize,
    themeMode,
    setThemeMode,
    highContrast,
    setHighContrast,
    reduceMotion,
    setReduceMotion,
  };
}
