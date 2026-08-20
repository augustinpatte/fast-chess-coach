import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '@/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './defaults';
import { SettingsContext, type SettingsContextValue } from './settingsContext';

/** Applique le theme choisi au document. */
function applyTheme(theme: Settings['theme'], reduceAnimations: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.dataset.theme = resolved;
  root.dataset.animations = reduceAnimations ? 'reduced' : 'normal';
}

export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
    applyTheme(settings.theme, settings.reduceAnimations);
  }, [settings]);

  // Suit le theme systeme lorsque l'option « systeme » est active.
  useEffect(() => {
    if (settings.theme !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const listener = (): void => applyTheme('system', settings.reduceAnimations);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.theme, settings.reduceAnimations]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }, []);

  const reset = useCallback((): void => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, reset }),
    [settings, update, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
