import { createContext } from 'react';
import type { Settings } from '@/types';
import { DEFAULT_SETTINGS } from './defaults';

export interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

/** Contexte des reglages, isole du composant pour garder le Fast Refresh. */
export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => undefined,
  reset: () => undefined,
});
