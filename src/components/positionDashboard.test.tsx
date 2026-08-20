import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AnalysisResult, NextMoveHelp } from '@/types';
import { Board } from './Board';
import { PositionDashboard } from './PositionDashboard';
import { usePositionInsight } from '@/hooks/usePositionInsight';
import { getEngine } from '@/engine/engineInstance';
import assessmentSource from '@/coaching/positionAssessment.ts?raw';
import bestMoveSource from '@/coaching/bestMoveExplanation.ts?raw';
import dashboardSource from '@/components/PositionDashboard.tsx?raw';
import insightSource from '@/hooks/usePositionInsight.ts?raw';
import planSource from '@/coaching/positionPlan.ts?raw';
import watchSource from '@/coaching/watchFocus.ts?raw';
import { POSITIONS } from '@/tests/positions';

const analysis = (fen: string, pv: string[]): AnalysisResult => ({
  fen,
  bestMove: pv[0],
  depth: 14,
  elapsedMs: 100,
  lines: [{ multipv: 1, depth: 14, score: { cp: 25, mate: null }, pv }],
});

interface HarnessProps {
  fen?: string;
  nextFen?: string;
  perspective?: 'w' | 'b';
  help?: NextMoveHelp;
  withAnalysis?: boolean;
  bestPv?: string[];
  /** Fige l'analyse sur la position de depart, comme une reponse moteur en retard. */
  staleAnalysis?: boolean;
}

/**
 * Assemble le hook, le tableau de bord et l'echiquier comme le fait l'ecran de
 * jeu, avec un bouton permettant de simuler un coup joue (changement de FEN).
 */
function Harness(props: HarnessProps): React.JSX.Element {
  const first = props.fen ?? POSITIONS.needsCastle;
  const [fen, setFen] = useState(first);
  const analysisFen = props.staleAnalysis ? first : fen;
  const insight = usePositionInsight({
    fen,
    perspective: props.perspective ?? 'w',
    analysis: props.withAnalysis === false ? null : analysis(analysisFen, props.bestPv ?? ['e1g1']),
    help: props.help ?? 'on_demand',
    active: true,
  });

  return (
    <>
      <button type="button" onClick={() => setFen(props.nextFen ?? POSITIONS.italian)}>
        Jouer un coup
      </button>
      <Board
        fen={fen}
        orientation="white"
        interactive={false}
        playerColor="w"
        showLegalMoves={false}
        animate={false}
        lastMove={null}
        checkSquare={null}
        arrows={insight.arrows}
        highlights={insight.highlights}
        onMove={() => true}
      />
      <PositionDashboard insight={insight} />
    </>
  );
}

const arrowPaths = (): number =>
  document.querySelectorAll('svg[viewBox="0 0 2048 2048"] path').length;

describe('tableau de lecture de position', () => {
  it('affiche les cinq jauges, les priorites et le plan', () => {
    render(<Harness />);
    expect(screen.getByTestId('position-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-gauges').children).toHaveLength(5);
    for (const id of ['material', 'king_safety', 'activity', 'center', 'pawns']) {
      expect(screen.getByTestId(`gauge-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('dashboard-critical').children.length).toBeGreaterThan(0);
    expect(screen.getByTestId('dashboard-plan')).toHaveTextContent('Sécurise ton roi');
  });

  it('n’affiche jamais plus de trois priorites', () => {
    render(<Harness fen={POSITIONS.hangingQueen} />);
    expect(screen.getByTestId('dashboard-critical').children.length).toBeLessThanOrEqual(3);
  });

  it('s’affiche sans attendre l’analyse du moteur', () => {
    render(<Harness withAnalysis={false} />);
    expect(screen.getByTestId('dashboard-gauges').children).toHaveLength(5);
    expect(screen.getByTestId('dashboard-plan')).toBeInTheDocument();
  });

  it('masque la section « Points de bascule » quand rien de fiable n’existe', () => {
    render(<Harness fen={POSITIONS.start} bestPv={['e2e4']} />);
    expect(screen.queryByTestId('dashboard-swings')).not.toBeInTheDocument();
  });

  it('affiche les points de bascule quand ils sont etayes', () => {
    render(<Harness fen={POSITIONS.passedPawn} bestPv={['b6b7']} />);
    expect(screen.getByTestId('dashboard-swings')).toHaveTextContent('b7');
  });
});

describe('que regarder', () => {
  it('met en evidence des cases sans donner le meilleur coup', () => {
    render(<Harness fen={POSITIONS.hangingQueen} bestPv={['c6d5']} perspective="w" />);
    expect(screen.queryByTestId('dashboard-watch')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Que regarder ?' }));
    expect(screen.getByTestId('dashboard-watch')).toHaveTextContent('dame d5');
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(document.querySelector('[data-square="d5"]')?.innerHTML).toContain('inset');
  });

  it('propose une autre piste a chaque appui', () => {
    render(<Harness fen={POSITIONS.hangingQueen} bestPv={['c6d5']} />);
    const button = screen.getByRole('button', { name: 'Que regarder ?' });
    fireEvent.click(button);
    const first = screen.getByTestId('dashboard-watch').textContent;
    fireEvent.click(button);
    expect(screen.getByTestId('dashboard-watch').textContent).not.toBe(first);
  });
});

describe('meilleur coup', () => {
  it('n’affiche rien tant que le bouton n’est pas utilise', () => {
    render(<Harness />);
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('affiche la SAN, l’explication et une fleche apres demande', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('show-best-move'));
    const panel = screen.getByTestId('dashboard-best-move');
    expect(panel).toHaveTextContent('O-O');
    expect(panel).toHaveTextContent('roi à l’abri');
    expect(arrowPaths()).toBeGreaterThan(0);
  });

  it('masque le bouton en mode « Plan seulement »', () => {
    render(<Harness help="plan" />);
    expect(screen.queryByTestId('show-best-move')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-plan')).toBeInTheDocument();
  });

  it('affiche le meilleur coup d’office en mode « Toujours »', () => {
    render(<Harness help="always" />);
    expect(screen.getByTestId('dashboard-best-move')).toHaveTextContent('O-O');
    expect(screen.queryByTestId('show-best-move')).not.toBeInTheDocument();
    expect(arrowPaths()).toBeGreaterThan(0);
  });

  it('desactive le bouton quand ce n’est pas au joueur de jouer', () => {
    // hangingQueen : les noirs ont le trait, le joueur a les blancs.
    render(<Harness fen={POSITIONS.hangingQueen} bestPv={['c6d5']} perspective="w" />);
    expect(screen.getByTestId('show-best-move')).toBeDisabled();
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
  });

  it('n’explique jamais le coup de l’adversaire en mode « Toujours »', () => {
    render(
      <Harness fen={POSITIONS.hangingQueen} bestPv={['c6d5']} perspective="w" help="always" />,
    );
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('patiente sans bloquer quand l’analyse n’est pas encore arrivee', () => {
    render(<Harness withAnalysis={false} />);
    fireEvent.click(screen.getByTestId('show-best-move'));
    expect(screen.getByTestId('dashboard-best-move')).toHaveTextContent('Analyse du moteur');
    expect(arrowPaths()).toBe(0);
  });
});

describe('analyse en retard', () => {
  it('n’utilise jamais l’analyse d’une position precedente', () => {
    render(<Harness staleAnalysis nextFen={POSITIONS.italian} />);
    fireEvent.click(screen.getByTestId('show-best-move'));
    expect(screen.getByTestId('dashboard-best-move')).toHaveTextContent('O-O');

    // Un coup est joue : l'analyse encore en memoire porte sur l'ancienne position.
    fireEvent.click(screen.getByRole('button', { name: 'Jouer un coup' }));
    fireEvent.click(screen.getByTestId('show-best-move'));
    expect(screen.getByTestId('dashboard-best-move')).toHaveTextContent('Analyse du moteur');
    expect(screen.getByTestId('dashboard-best-move')).not.toHaveTextContent('O-O');
    expect(arrowPaths()).toBe(0);
  });

  it('n’adosse pas les jauges a une analyse perimee', () => {
    render(<Harness staleAnalysis nextFen={POSITIONS.italian} help="always" />);
    fireEvent.click(screen.getByRole('button', { name: 'Jouer un coup' }));
    expect(screen.getByTestId('dashboard-gauges').children).toHaveLength(5);
    expect(arrowPaths()).toBe(0);
  });
});

describe('disparition des aides', () => {
  it('efface fleche et surbrillance des que la position change', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('show-best-move'));
    fireEvent.click(screen.getByRole('button', { name: 'Que regarder ?' }));
    expect(screen.getByTestId('dashboard-best-move')).toBeInTheDocument();
    expect(arrowPaths()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Jouer un coup' }));
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-watch')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('efface les aides quand le joueur les masque', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('show-best-move'));
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByTestId('dashboard-best-move')).not.toBeInTheDocument();
    expect(arrowPaths()).toBe(0);
  });

  it('conserve l’affichage automatique en mode « Toujours » apres un coup', () => {
    render(<Harness help="always" nextFen={POSITIONS.italian} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jouer un coup' }));
    expect(screen.getByTestId('dashboard-best-move')).toBeInTheDocument();
  });
});

describe('echiquier', () => {
  it('ne dessine jamais plus d’une fleche ni plus de trois cases', () => {
    render(
      <Board
        fen={POSITIONS.start}
        orientation="white"
        interactive={false}
        playerColor="w"
        showLegalMoves={false}
        animate={false}
        lastMove={null}
        checkSquare={null}
        arrows={[
          { from: 'e2', to: 'e4', kind: 'best' },
          { from: 'd2', to: 'd4', kind: 'threat' },
        ]}
        highlights={[
          { square: 'a1', kind: 'focus' },
          { square: 'b1', kind: 'focus' },
          { square: 'c1', kind: 'threat' },
          { square: 'd1', kind: 'strategic' },
        ]}
        onMove={() => true}
      />,
    );
    expect(arrowPaths()).toBe(1);
    expect(document.querySelector('[data-square="c1"]')?.innerHTML).toContain('inset');
    expect(document.querySelector('[data-square="d1"]')?.innerHTML).not.toContain('inset');
  });
});

describe('reutilisation du moteur', () => {
  it('n’expose qu’une seule instance de Stockfish', () => {
    expect(getEngine()).toBe(getEngine());
  });

  it('n’ouvre aucun acces au moteur depuis la lecture de position', () => {
    // Le tableau de bord consomme l'analyse deja calculee : aucun de ses modules
    // ne doit pouvoir demarrer une recherche ni instancier un Worker.
    const modules: Array<[string, string]> = [
      ['usePositionInsight', insightSource],
      ['positionAssessment', assessmentSource],
      ['positionPlan', planSource],
      ['bestMoveExplanation', bestMoveSource],
      ['watchFocus', watchSource],
      ['PositionDashboard', dashboardSource],
    ];
    for (const [name, source] of modules) {
      for (const forbidden of [
        'engineInstance',
        'createEngineWorker',
        'analysisService',
        'StockfishEngine',
      ]) {
        expect(source, `${name} importe ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
