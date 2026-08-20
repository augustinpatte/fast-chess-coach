import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NextMoveHelp } from '@/types';
import { TrainerScreen } from './screens/TrainerScreen';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { REPERTOIRE, trainingPositions } from '@/openings/book';
import { sanToUci } from '@/chess/rules';
import { sanToFrench } from '@/chess/pieces';

/**
 * Aide au prochain coup pendant l'entrainement d'ouverture.
 *
 * Le moteur n'est pas disponible ici : c'est voulu, la reponse theorique est
 * deja connue par le repertoire et l'explication se lit sur l'echiquier.
 */

const FIRST = REPERTOIRE[0];
const FIRST_EXERCISE = trainingPositions(FIRST)[0];

function openTrainer(help: NextMoveHelp): void {
  render(
    <TrainerScreen
      settings={{ ...DEFAULT_SETTINGS, nextMoveHelp: help }}
      onBack={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(FIRST.name, 'i') }));
}

const arrowPaths = (): number =>
  document.querySelectorAll('svg[viewBox="0 0 2048 2048"] path').length;

describe('entrainement d’ouverture : coup theorique', () => {
  it('n’affiche rien tant que le coup n’est pas demande', () => {
    openTrainer('on_demand');
    expect(screen.getByTestId('best-move-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('best-move-detail')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('donne le coup theorique et la raison, sans moteur', () => {
    openTrainer('on_demand');
    fireEvent.click(screen.getByTestId('show-best-move'));
    const panel = screen.getByTestId('best-move-detail');
    expect(panel).toHaveTextContent(sanToFrench(FIRST_EXERCISE.answers[0]));
    expect(panel).toHaveTextContent('Pourquoi ce coup ?');
    expect(panel).toHaveTextContent(FIRST_EXERCISE.idea.slice(0, 20));
    // Une fleche pointe le coup a jouer.
    expect(arrowPaths()).toBeGreaterThan(0);
  });

  it('affiche le coup d’office en mode « Toujours »', () => {
    openTrainer('always');
    expect(screen.getByTestId('best-move-detail')).toHaveTextContent(
      sanToFrench(FIRST_EXERCISE.answers[0]),
    );
    expect(screen.queryByTestId('show-best-move')).not.toBeInTheDocument();
  });

  it('ne propose aucune aide en mode « Plan seulement »', () => {
    openTrainer('plan');
    expect(screen.queryByTestId('best-move-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('show-best-move')).not.toBeInTheDocument();
  });

  it('cache a nouveau le coup a la demande', () => {
    openTrainer('on_demand');
    fireEvent.click(screen.getByTestId('show-best-move'));
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByTestId('best-move-detail')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('oublie le coup revele en passant a l’exercice suivant', () => {
    openTrainer('on_demand');
    fireEvent.click(screen.getByTestId('show-best-move'));
    expect(screen.getByTestId('best-move-detail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));
    expect(screen.queryByTestId('best-move-detail')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('montre exactement le coup que l’exercice attend', () => {
    openTrainer('always');
    const uci = sanToUci(FIRST_EXERCISE.fen, FIRST_EXERCISE.answers[0]) ?? '';
    const square = (name: string): HTMLElement =>
      document.querySelector(`[data-square="${name}"]`) as HTMLElement;
    // Jouer le coup revele valide bien l'exercice.
    fireEvent.click(square(uci.slice(0, 2)));
    fireEvent.click(square(uci.slice(2, 4)));
    expect(screen.getByTestId('trainer-message')).toHaveTextContent('Correct');
  });
});
