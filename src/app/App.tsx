import { useCallback, useEffect, useState } from 'react';
import type { OpeningStat, ProgressionState } from '@/types';
import { useSettings } from '@/hooks/useSettings';
import { useGameController, type GameConfig, type GameEnd } from '@/hooks/useGameController';
import {
  addGame,
  loadProgression,
  saveProgression,
  setOpeningPreference,
} from '@/progression/store';
import { resolveProfile } from '@/engine/difficulty';
import { disposeEngine, getEngine } from '@/engine/engineInstance';
import { SettingsDialog } from '@/components/SettingsDialog';
import { SetupScreen } from './screens/SetupScreen';
import { GameScreen } from './screens/GameScreen';
import { OpeningsScreen } from './screens/OpeningsScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { TrainerScreen } from './screens/TrainerScreen';
import { EngineBanner } from '@/components/EngineBanner';

type Screen = 'setup' | 'game' | 'openings' | 'progress' | 'trainer';

/** Racine de l'application : un ecran a la fois, aucun menu lateral permanent. */
export function App(): React.JSX.Element {
  const { settings, update, reset } = useSettings();
  const [screen, setScreen] = useState<Screen>('setup');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progression, setProgression] = useState<ProgressionState>(() => loadProgression());
  const [lastConfig, setLastConfig] = useState<GameConfig | null>(null);

  const handleFinish = useCallback((end: GameEnd): void => {
    setProgression((previous) => {
      const next = addGame(previous, end.summary);
      saveProgression(next);
      return next;
    });
  }, []);

  const controller = useGameController(settings, handleFinish);

  // Le moteur est initialise des le chargement pour que la premiere partie
  // demarre sans attente, et libere proprement a la fermeture de l'onglet.
  useEffect(() => {
    void getEngine()
      .init()
      .catch(() => undefined);
    const onUnload = (): void => disposeEngine();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  const startGame = useCallback(
    (config: GameConfig): void => {
      setLastConfig(config);
      controller.start(config);
      setScreen('game');
    },
    [controller],
  );

  const replay = useCallback((): void => {
    if (lastConfig) controller.start(lastConfig);
  }, [controller, lastConfig]);

  const setPreference = useCallback(
    (openingId: string, preference: OpeningStat['preference']): void => {
      setProgression((previous) => {
        const next = setOpeningPreference(previous, openingId, preference);
        saveProgression(next);
        return next;
      });
    },
    [],
  );

  const profile = resolveProfile(settings.level, settings.customElo);

  return (
    <div className="app">
      <EngineBanner />

      {screen === 'setup' ? (
        <SetupScreen
          onStart={startGame}
          onOpenTrainer={() => setScreen('trainer')}
          onOpenOpenings={() => setScreen('openings')}
          onOpenProgress={() => setScreen('progress')}
          onOpenSettings={() => setSettingsOpen(true)}
          levelLabel={profile.label}
        />
      ) : null}

      {screen === 'game' ? (
        <GameScreen
          controller={controller}
          settings={settings}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackToMenu={() => {
            controller.reset();
            setScreen('setup');
          }}
          onNewGame={replay}
          onTryAnotherOpening={() => {
            controller.reset();
            setScreen('setup');
          }}
        />
      ) : null}

      {screen === 'openings' ? (
        <OpeningsScreen
          progression={progression}
          onBack={() => setScreen('setup')}
          onSetPreference={setPreference}
        />
      ) : null}

      {screen === 'progress' ? (
        <ProgressScreen progression={progression} onBack={() => setScreen('setup')} />
      ) : null}

      {screen === 'trainer' ? (
        <TrainerScreen settings={settings} onBack={() => setScreen('setup')} />
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
        reset={reset}
      />
    </div>
  );
}
