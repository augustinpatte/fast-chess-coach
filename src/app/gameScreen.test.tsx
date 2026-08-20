import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { DEFAULT_SETTINGS, saveSettings } from '@/settings/defaults';
import { clearAll } from '@/storage/localStore';
import type { Settings } from '@/types';

/**
 * Parcours complet de l'ecran de jeu.
 *
 * Le moteur n'est pas disponible dans cet environnement (pas de Worker) : c'est
 * exactement la garantie que l'on veut verifier ici, l'application doit rester
 * jouable et le tableau de position doit s'afficher sans attendre Stockfish.
 */

const square = (name: string): HTMLElement => {
  const element = document.querySelector(`[data-square="${name}"]`);
  if (!element) throw new Error(`Case ${name} introuvable`);
  return element as HTMLElement;
};

function startGame(settings: Partial<Settings> = {}, color: 'Blancs' | 'Noirs' = 'Blancs'): void {
  saveSettings({ ...DEFAULT_SETTINGS, ...settings });
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole('radio', { name: color }));
  fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
}

beforeEach(() => {
  clearAll();
  vi.restoreAllMocks();
});

describe('partie complete avec le tableau de position', () => {
  it('affiche l’echiquier et le tableau des le premier coup, sans le moteur', () => {
    startGame();
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-gauges').children).toHaveLength(5);
    expect(screen.getByTestId('dashboard-critical')).toHaveTextContent('pièces mineures');
    expect(screen.getByTestId('dashboard-plan')).toBeInTheDocument();
    // Le coach existant reste present et distinct du nouveau tableau.
    expect(screen.getByTestId('coach-panel')).toBeInTheDocument();
  });

  it('laisse jouer immediatement, meme sans analyse', () => {
    startGame();
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    expect(screen.getByTestId('move-list')).toHaveTextContent('e4');
    // Le tableau suit la nouvelle position.
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
  });

  it('efface les aides des qu’un coup est joue', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: 'Que regarder ?' }));
    expect(screen.getByTestId('dashboard-watch')).toBeInTheDocument();

    fireEvent.click(square('d2'));
    fireEvent.click(square('d4'));
    expect(screen.queryByTestId('dashboard-watch')).not.toBeInTheDocument();
  });

  it('n’affiche le meilleur coup qu’a la demande, et patiente sans bloquer', () => {
    startGame();
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('show-best-move'));
    expect(screen.getByTestId('dashboard-best-move')).toHaveTextContent('Analyse du moteur');
    // L'echiquier reste jouable pendant l'attente.
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    expect(screen.getByTestId('move-list')).toHaveTextContent('e4');
  });

  it('masque le bouton du meilleur coup en mode « Plan seulement »', () => {
    startGame({ nextMoveHelp: 'plan' });
    expect(screen.queryByTestId('show-best-move')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-plan')).toBeInTheDocument();
  });

  it('masque tout le tableau quand le reglage est desactive', () => {
    startGame({ showPositionDashboard: false });
    expect(screen.queryByTestId('position-dashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('coach-panel')).toBeInTheDocument();
  });

  it('ecrit les conseils du point de vue des noirs', () => {
    startGame({}, 'Noirs');
    expect(screen.getByTestId('dashboard-critical')).toHaveTextContent('Il te reste');
    fireEvent.click(screen.getByRole('button', { name: 'Que regarder ?' }));
    expect(screen.getByTestId('dashboard-watch')).toBeInTheDocument();
  });

  it('laisse le coach du dernier coup et la barre d’evaluation intacts', () => {
    startGame();
    // Les deux panneaux coexistent et repondent a des questions differentes.
    expect(screen.getByTestId('coach-panel')).toBeInTheDocument();
    expect(screen.getByTestId('coach-text')).toBeInTheDocument();
    expect(screen.getByTestId('eval-bar')).toBeInTheDocument();
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
    // Aucune phrase n'est reprise a l'identique d'un panneau a l'autre.
    const coach = screen.getByTestId('coach-text').textContent ?? '';
    const critical = screen.getByTestId('dashboard-critical').textContent ?? '';
    expect(critical).not.toBe(coach);
  });

  it('ne casse pas la navigation entre les ecrans', () => {
    saveSettings(DEFAULT_SETTINGS);
    render(
      <SettingsProvider>
        <App />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mes ouvertures' }));
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));

    fireEvent.click(screen.getByRole('button', { name: 'Progression' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));

    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
  });

  it('conserve le choix du niveau et les reglages existants', () => {
    startGame({ level: 1400, showEvalBar: false });
    expect(screen.queryByTestId('eval-bar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(screen.getByLabelText('Niveau de l’adversaire')).toHaveValue('1400');
    expect(screen.getByLabelText('Aide au prochain coup')).toHaveValue('on_demand');
  });

  it('joue une ouverture guidee avec le tableau de position', () => {
    saveSettings(DEFAULT_SETTINGS);
    render(
      <SettingsProvider>
        <App />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Tester une ouverture' }));
    const openings = screen.getAllByRole('button', { name: /Italienne|Espagnole|Londres|Gambit/i });
    expect(openings.length).toBeGreaterThan(0);
    fireEvent.click(openings[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
  });

  it('ne produit aucune erreur de rendu', () => {
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    startGame();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Que regarder ?' }));
      fireEvent.click(screen.getByTestId('show-best-move'));
    });
    // Seules les erreurs du moteur absent sont tolerees.
    const rendering = errors.filter((entry) => !String(entry).includes('[moteur]'));
    expect(rendering).toEqual([]);
  });
});
