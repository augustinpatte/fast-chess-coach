import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CoachFeedback, MoveRecord, Settings } from '@/types';
import { Board } from './Board';
import { EvalBar } from './EvalBar';
import { CoachPanel } from './CoachPanel';
import { MoveList } from './MoveList';
import { GameControls } from './GameControls';
import { SettingsDialog } from './SettingsDialog';
import { PromotionDialog } from './PromotionDialog';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { respectsCoachLimits } from '@/coaching/format';
import { POSITIONS } from '@/tests/positions';
import { clearAll } from '@/storage/localStore';

const square = (name: string): HTMLElement => {
  const element = document.querySelector(`[data-square="${name}"]`);
  if (!element) throw new Error(`Case ${name} introuvable`);
  return element as HTMLElement;
};

/** react-chessboard applique `squareStyles` a un conteneur interne. */
const squareMarkup = (name: string): string => square(name).innerHTML;

const boardProps = {
  fen: POSITIONS.start,
  orientation: 'white' as const,
  interactive: true,
  playerColor: 'w' as const,
  showLegalMoves: true,
  animate: false,
  lastMove: null,
  checkSquare: null,
};

beforeEach(() => {
  clearAll();
});

describe('echiquier', () => {
  it('affiche les 64 cases et les pieces', () => {
    render(<Board {...boardProps} onMove={() => true} />);
    expect(document.querySelectorAll('[data-square]')).toHaveLength(64);
    expect(within(square('e1')).getByRole('button')).toBeInTheDocument();
  });

  it('affiche les coups legaux quand une piece est selectionnee', () => {
    render(<Board {...boardProps} onMove={() => true} />);
    fireEvent.click(square('e2'));
    // Les cases e3 et e4 recoivent un fond indiquant un coup legal.
    expect(squareMarkup('e3')).toContain('radial-gradient');
    expect(squareMarkup('e4')).toContain('radial-gradient');
    expect(squareMarkup('e5')).not.toContain('radial-gradient');
  });

  it('n’affiche aucun point quand l’option est desactivee', () => {
    render(<Board {...boardProps} showLegalMoves={false} onMove={() => true} />);
    fireEvent.click(square('e2'));
    expect(squareMarkup('e4')).not.toContain('radial-gradient');
  });

  it('joue un coup legal en deux clics', () => {
    const onMove = vi.fn(() => true);
    render(<Board {...boardProps} onMove={onMove} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    expect(onMove).toHaveBeenCalledWith('e2', 'e4');
  });

  it('refuse un coup illegal sans appeler le controleur', () => {
    const onMove = vi.fn(() => true);
    render(<Board {...boardProps} onMove={onMove} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e5'));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ne laisse pas jouer les pieces adverses', () => {
    const onMove = vi.fn(() => true);
    render(<Board {...boardProps} onMove={onMove} />);
    fireEvent.click(square('e7'));
    fireEvent.click(square('e5'));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('surligne le dernier coup et le roi en echec', () => {
    render(
      <Board
        {...boardProps}
        fen={POSITIONS.checkmate}
        lastMove={{ from: 'd8', to: 'h4' }}
        checkSquare="e1"
        onMove={() => true}
      />,
    );
    expect(squareMarkup('h4')).toContain('rgba(255, 205, 65');
    expect(squareMarkup('e1')).toContain('radial-gradient');
  });

  it('ouvre la fenetre de promotion sur un coup de promotion', () => {
    const onMove = vi.fn(() => true);
    render(<Board {...boardProps} fen={POSITIONS.promotion} onMove={onMove} />);
    fireEvent.click(square('e7'));
    fireEvent.click(square('e8'));
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /promotion/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Promouvoir en dame'));
    expect(onMove).toHaveBeenCalledWith('e7', 'e8', 'q');
  });

  it('ne bouge pas quand l’echiquier n’est pas interactif', () => {
    const onMove = vi.fn(() => true);
    render(<Board {...boardProps} interactive={false} onMove={onMove} />);
    fireEvent.click(square('e2'));
    fireEvent.click(square('e4'));
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('barre d’evaluation', () => {
  it('affiche la valeur numerique quand elle est activee', () => {
    render(<EvalBar score={{ cp: 120, mate: null }} showValue orientation="white" />);
    expect(screen.getByText('+1.2')).toBeInTheDocument();
    expect(screen.getByTestId('eval-bar')).toHaveAttribute('aria-valuenow');
  });

  it('masque la valeur numerique quand elle est desactivee', () => {
    render(<EvalBar score={{ cp: 120, mate: null }} showValue={false} orientation="white" />);
    expect(screen.queryByText('+1.2')).not.toBeInTheDocument();
  });

  it('affiche un mat', () => {
    render(<EvalBar score={{ cp: null, mate: 2 }} showValue orientation="white" />);
    expect(screen.getByText('M2')).toBeInTheDocument();
  });
});

describe('zone pedagogique', () => {
  const feedback: CoachFeedback = {
    quality: 'inaccuracy',
    qualityLabel: 'Imprécision',
    text: 'Ton fou est développé, mais il bloque la défense du pion d4. Cc3 était plus actif.',
    cpLoss: 120,
    bestMoveSan: 'Cc3',
    diagnostics: ['misplaced_piece'],
    details: { bestMoveSan: 'Cc3', variation: ['Cc3', 'Cf6', 'd4'], concept: 'Développement.' },
  };

  it('affiche la classification et un texte de deux lignes maximum', () => {
    render(<CoachPanel feedback={feedback} placeholder="" thinking={false} />);
    expect(screen.getByTestId('coach-quality')).toHaveTextContent('Imprécision');
    expect(respectsCoachLimits(screen.getByTestId('coach-text').textContent ?? '')).toBe(true);
  });

  it('cache le detail tant que « Voir plus » n’est pas clique', () => {
    render(<CoachPanel feedback={feedback} placeholder="" thinking={false} />);
    expect(screen.queryByTestId('coach-details')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));
    expect(screen.getByTestId('coach-details')).toHaveTextContent('Cc3');
  });

  it('affiche le message d’attente sans retour', () => {
    render(<CoachPanel feedback={null} placeholder="Joue un coup." thinking={false} />);
    expect(screen.getByTestId('coach-text')).toHaveTextContent('Joue un coup.');
  });
});

describe('historique des coups', () => {
  const move = (san: string, uci: string): MoveRecord => ({
    san,
    uci,
    fenBefore: POSITIONS.start,
    fenAfter: POSITIONS.start,
    color: 'w',
    feedback: null,
    evalAfterCp: null,
    mateAfter: null,
  });

  it('affiche les coups en notation francaise', () => {
    render(<MoveList moves={[move('e4', 'e2e4'), move('Nf3', 'g1f3')]} />);
    expect(screen.getByTestId('move-list')).toHaveTextContent('e4');
    expect(screen.getByTestId('move-list')).toHaveTextContent('Cf3');
  });

  it('indique quand aucun coup n’a ete joue', () => {
    render(<MoveList moves={[]} />);
    expect(screen.getByText('Aucun coup joué.')).toBeInTheDocument();
  });
});

describe('commandes de partie', () => {
  const props = {
    canUndo: true,
    analysisVisible: true,
    confirmResign: true,
    disabled: false,
    onNewGame: vi.fn(),
    onUndo: vi.fn(),
    onResign: vi.fn(),
    onOfferDraw: vi.fn(),
    onFlip: vi.fn(),
    onSettings: vi.fn(),
    onToggleAnalysis: vi.fn(),
    onShowLastTip: vi.fn(),
    onBackToMenu: vi.fn(),
    onKeyboardMove: vi.fn(() => true),
  };

  it('demande une confirmation avant d’abandonner', () => {
    const onResign = vi.fn();
    render(<GameControls {...props} onResign={onResign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(onResign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer ?' }));
    expect(onResign).toHaveBeenCalled();
  });

  it('accepte un coup saisi au clavier', () => {
    const onKeyboardMove = vi.fn(() => true);
    render(<GameControls {...props} onKeyboardMove={onKeyboardMove} />);
    fireEvent.change(screen.getByLabelText('Coup au clavier'), { target: { value: 'e4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(onKeyboardMove).toHaveBeenCalledWith('e4');
  });

  it('signale un coup illegal saisi au clavier', () => {
    render(<GameControls {...props} onKeyboardMove={() => false} />);
    fireEvent.change(screen.getByLabelText('Coup au clavier'), { target: { value: 'zz9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Coup illégal.');
  });
});

describe('reglages', () => {
  it('remonte les changements et sauvegarde', () => {
    const update = vi.fn();
    let settings: Settings = { ...DEFAULT_SETTINGS };
    render(
      <SettingsDialog open onClose={vi.fn()} settings={settings} update={update} reset={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText('Barre d’évaluation'));
    expect(update).toHaveBeenCalledWith('showEvalBar', false);
    fireEvent.change(screen.getByLabelText('Niveau de l’adversaire'), {
      target: { value: '1400' },
    });
    expect(update).toHaveBeenCalledWith('level', 1400);
    settings = { ...settings, showEvalBar: false };
    expect(settings.showEvalBar).toBe(false);
  });

  it('propose les trois niveaux d’aide au prochain coup', () => {
    const update = vi.fn();
    render(
      <SettingsDialog
        open
        onClose={vi.fn()}
        settings={DEFAULT_SETTINGS}
        update={update}
        reset={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('Aide au prochain coup');
    expect(select).toHaveValue('on_demand');
    fireEvent.change(select, { target: { value: 'plan' } });
    expect(update).toHaveBeenCalledWith('nextMoveHelp', 'plan');
  });

  it('permet de masquer le tableau de lecture de position', () => {
    const update = vi.fn();
    render(
      <SettingsDialog
        open
        onClose={vi.fn()}
        settings={DEFAULT_SETTINGS}
        update={update}
        reset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Tableau de lecture de position'));
    expect(update).toHaveBeenCalledWith('showPositionDashboard', false);
  });

  it('permet de choisir un niveau personnalise', () => {
    const update = vi.fn();
    render(
      <SettingsDialog
        open
        onClose={vi.fn()}
        settings={{ ...DEFAULT_SETTINGS, level: 'custom' }}
        update={update}
        reset={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Elo personnalisé/)).toBeInTheDocument();
  });
});

describe('promotion', () => {
  it('propose les quatre pieces', () => {
    render(<PromotionDialog color="w" onSelect={vi.fn()} onCancel={vi.fn()} />);
    for (const name of ['dame', 'tour', 'fou', 'cavalier']) {
      expect(screen.getByLabelText(`Promouvoir en ${name}`)).toBeInTheDocument();
    }
  });
});
