import { useContext } from 'react';
import { SettingsContext, type SettingsContextValue } from '@/settings/settingsContext';

/** Accede aux reglages et a leur mise a jour. */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
