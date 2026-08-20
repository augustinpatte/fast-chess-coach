import { useState } from 'react';
import type { Settings } from '@/types';
import { DIFFICULTY_PROFILES, LEVEL_ORDER, SPEED_PROFILES } from '@/engine/difficulty';
import { analysisCacheSize, clearAnalysisCache } from '@/engine/analysisService';
import { approximateUsage, clearAll } from '@/storage/localStore';
import { Dialog } from './Dialog';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  id: string;
}

function Toggle(props: ToggleProps): React.JSX.Element {
  return (
    <div className="field field-inline">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    </div>
  );
}

/** Fenetre de reglages compacte. Chaque changement est sauvegarde aussitot. */
export function SettingsDialog(props: SettingsDialogProps): React.JSX.Element {
  const { settings, update } = props;
  const [cleared, setCleared] = useState(false);

  return (
    <Dialog title="Réglages" open={props.open} onClose={props.onClose}>
      <div className="settings-grid">
        <div className="field">
          <label htmlFor="set-level">Niveau de l’adversaire</label>
          <select
            id="set-level"
            value={String(settings.level)}
            onChange={(event) =>
              update(
                'level',
                event.target.value === 'custom'
                  ? 'custom'
                  : (Number(event.target.value) as Settings['level']),
              )
            }
          >
            {LEVEL_ORDER.map((id) => (
              <option key={id} value={id}>
                {DIFFICULTY_PROFILES[id].label}
              </option>
            ))}
            <option value="custom">Personnalisé</option>
          </select>
        </div>

        {settings.level === 'custom' ? (
          <div className="field">
            <label htmlFor="set-custom">Elo personnalisé : {settings.customElo}</label>
            <input
              id="set-custom"
              type="range"
              min={400}
              max={3000}
              step={50}
              value={settings.customElo}
              onChange={(event) => update('customElo', Number(event.target.value))}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="set-coach">Niveau pédagogique</label>
          <select
            id="set-coach"
            value={settings.coachLevel}
            onChange={(event) => update('coachLevel', event.target.value as Settings['coachLevel'])}
          >
            <option value="beginner">Débutant (600-900)</option>
            <option value="intermediate">Intermédiaire (900-1200)</option>
            <option value="progress">Progression (1200-1500)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-speed">Vitesse d’analyse</label>
          <select
            id="set-speed"
            value={settings.analysisSpeed}
            onChange={(event) =>
              update('analysisSpeed', event.target.value as Settings['analysisSpeed'])
            }
          >
            {Object.values(SPEED_PROFILES).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-orientation">Orientation de l’échiquier</label>
          <select
            id="set-orientation"
            value={settings.boardOrientation}
            onChange={(event) =>
              update('boardOrientation', event.target.value as Settings['boardOrientation'])
            }
          >
            <option value="auto">Selon ma couleur</option>
            <option value="white">Toujours blancs en bas</option>
            <option value="black">Toujours noirs en bas</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-theme">Thème</label>
          <select
            id="set-theme"
            value={settings.theme}
            onChange={(event) => update('theme', event.target.value as Settings['theme'])}
          >
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </div>

        <Toggle
          id="set-evalbar"
          label="Barre d’évaluation"
          checked={settings.showEvalBar}
          onChange={(v) => update('showEvalBar', v)}
        />
        <Toggle
          id="set-evalvalue"
          label="Valeur numérique de l’évaluation"
          checked={settings.showEvalValue}
          onChange={(v) => update('showEvalValue', v)}
        />
        <Toggle
          id="set-legal"
          label="Afficher les coups légaux"
          checked={settings.showLegalMoves}
          onChange={(v) => update('showLegalMoves', v)}
        />
        <Toggle
          id="set-coachon"
          label="Explication après chaque coup"
          checked={settings.showCoach}
          onChange={(v) => update('showCoach', v)}
        />
        <div className="field">
          <label htmlFor="set-help">Aide au prochain coup</label>
          <select
            id="set-help"
            value={settings.nextMoveHelp}
            onChange={(event) =>
              update('nextMoveHelp', event.target.value as Settings['nextMoveHelp'])
            }
          >
            <option value="plan">Plan seulement</option>
            <option value="on_demand">Meilleur coup sur demande</option>
            <option value="always">Toujours montrer le meilleur coup</option>
          </select>
        </div>

        <Toggle
          id="set-dashboard"
          label="Tableau de lecture de position"
          checked={settings.showPositionDashboard}
          onChange={(v) => update('showPositionDashboard', v)}
        />
        <Toggle
          id="set-sound"
          label="Son"
          checked={settings.sound}
          onChange={(v) => update('sound', v)}
        />
        <Toggle
          id="set-undo"
          label="Autoriser l’annulation du dernier coup"
          checked={settings.allowUndo}
          onChange={(v) => update('allowUndo', v)}
        />
        <Toggle
          id="set-resign"
          label="Confirmer avant d’abandonner"
          checked={settings.confirmResign}
          onChange={(v) => update('confirmResign', v)}
        />
        <Toggle
          id="set-anim"
          label="Réduire les animations"
          checked={settings.reduceAnimations}
          onChange={(v) => update('reduceAnimations', v)}
        />
      </div>

      <div className="settings-footer">
        <p className="hint">
          Données locales : {(approximateUsage() / 1024).toFixed(1)} Ko · cache d’analyses :{' '}
          {analysisCacheSize()} positions.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearAnalysisCache();
              setCleared(true);
            }}
          >
            Vider le cache d’analyses
          </button>
          <button
            type="button"
            className="btn btn-ghost danger"
            onClick={() => {
              clearAll();
              props.reset();
              setCleared(true);
            }}
          >
            Effacer toutes mes données
          </button>
        </div>
        {cleared ? <p className="hint">Données effacées.</p> : null}
      </div>
    </Dialog>
  );
}
