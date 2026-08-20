import type { Settings } from '@/types';
import { STORAGE_KEYS, readJson, writeJson } from '@/storage/localStore';

/** Reglages par defaut : orientes « partie rapide pour un joueur de 800 Elo ». */
export const DEFAULT_SETTINGS: Settings = {
  level: 800,
  customElo: 1000,
  coachLevel: 'beginner',
  analysisSpeed: 'fast',
  showEvalBar: true,
  showEvalValue: true,
  showLegalMoves: true,
  showCoach: true,
  showPositionDashboard: true,
  nextMoveHelp: 'on_demand',
  sound: true,
  boardOrientation: 'auto',
  confirmResign: true,
  allowUndo: true,
  theme: 'system',
  reduceAnimations: false,
};

const VALID_LEVELS = [600, 800, 1000, 1200, 1400, 1500, 1700, 1900, 3000];

/**
 * Fusionne les reglages stockes avec les valeurs par defaut et rejette les
 * valeurs invalides : une version anterieure du stockage ne doit jamais
 * casser l'application.
 */
export function normalizeSettings(input: unknown): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  if (typeof input !== 'object' || input === null) return merged;
  const raw = input as Record<string, unknown>;

  const bool = (key: keyof Settings): void => {
    if (typeof raw[key] === 'boolean') {
      (merged[key] as boolean) = raw[key];
    }
  };
  bool('showEvalBar');
  bool('showEvalValue');
  bool('showLegalMoves');
  bool('showCoach');
  bool('showPositionDashboard');
  bool('sound');
  bool('confirmResign');
  bool('allowUndo');
  bool('reduceAnimations');

  if (
    raw.level === 'custom' ||
    (typeof raw.level === 'number' && VALID_LEVELS.includes(raw.level))
  ) {
    merged.level = raw.level as Settings['level'];
  }
  if (typeof raw.customElo === 'number' && raw.customElo >= 400 && raw.customElo <= 3000) {
    merged.customElo = Math.round(raw.customElo);
  }
  if (
    raw.coachLevel === 'beginner' ||
    raw.coachLevel === 'intermediate' ||
    raw.coachLevel === 'progress'
  ) {
    merged.coachLevel = raw.coachLevel;
  }
  if (
    raw.analysisSpeed === 'fast' ||
    raw.analysisSpeed === 'normal' ||
    raw.analysisSpeed === 'accurate'
  ) {
    merged.analysisSpeed = raw.analysisSpeed;
  }
  if (
    raw.boardOrientation === 'auto' ||
    raw.boardOrientation === 'white' ||
    raw.boardOrientation === 'black'
  ) {
    merged.boardOrientation = raw.boardOrientation;
  }
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') {
    merged.theme = raw.theme;
  }
  if (
    raw.nextMoveHelp === 'plan' ||
    raw.nextMoveHelp === 'on_demand' ||
    raw.nextMoveHelp === 'always'
  ) {
    merged.nextMoveHelp = raw.nextMoveHelp;
  }
  return merged;
}

/** Charge les reglages depuis le stockage local. */
export function loadSettings(): Settings {
  return normalizeSettings(readJson<unknown>(STORAGE_KEYS.settings, null));
}

/** Enregistre les reglages. */
export function saveSettings(settings: Settings): boolean {
  return writeJson(STORAGE_KEYS.settings, settings);
}
