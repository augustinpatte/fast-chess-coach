import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { AnalysisResult, CriticalFeature } from '@/types';
import { BENCHMARK } from '@/tests/benchmark';
import recorded from '@/tests/benchmarkAnalyses.json';
import { assessPosition, detectPhase, isTacticalKind, usefulOpenFile } from './positionAssessment';
import { buildPlan } from './positionPlan';
import { explainBestMove } from './bestMoveExplanation';
import { watchFocusCandidates } from './watchFocus';
import { respectsExplanationLimits } from './format';
import { uciToMove } from '@/chess/rules';

/**
 * Banc d'essai adosse a de vraies analyses Stockfish (profondeur 18, MultiPV 3)
 * enregistrees par `npm run benchmark`. Aucun moteur ne tourne ici : ces tests
 * verifient que le coach reste coherent face a des donnees reelles.
 */
const analyses = recorded as unknown as Record<string, AnalysisResult>;

interface Snapshot {
  id: string;
  fen: string;
  perspective: 'w' | 'b';
  chess: Chess;
  myTurn: boolean;
  analysis: AnalysisResult;
  critical: CriticalFeature[];
  planText: string;
  phase: ReturnType<typeof detectPhase>;
}

const SNAPSHOTS: Snapshot[] = BENCHMARK.map((position) => {
  const analysis = analyses[position.id];
  if (!analysis) throw new Error(`Analyse manquante pour ${position.id}`);
  const assessment = assessPosition({
    fen: position.fen,
    perspective: position.perspective,
    analysis,
  });
  if (!assessment) throw new Error(`Position invalide : ${position.id}`);
  const chess = new Chess(position.fen);
  return {
    id: position.id,
    fen: position.fen,
    perspective: position.perspective,
    chess,
    myTurn: chess.turn() === position.perspective,
    analysis,
    critical: assessment.critical,
    planText:
      buildPlan({
        fen: position.fen,
        perspective: position.perspective,
        phase: assessment.phase,
        forcedMate: assessment.forcedMate,
      })?.text ?? '',
    phase: assessment.phase,
  };
});

const byId = (id: string): Snapshot => {
  const found = SNAPSHOTS.find((s) => s.id === id);
  if (!found) throw new Error(`Position inconnue : ${id}`);
  return found;
};

const topText = (id: string): string => byId(id).critical[0]?.text ?? '';
const allText = (id: string): string =>
  byId(id)
    .critical.map((c) => c.text)
    .join(' | ');

describe('banc d’essai : couverture', () => {
  it('couvre au moins trente positions representatives', () => {
    expect(BENCHMARK.length).toBeGreaterThanOrEqual(30);
    expect(new Set(BENCHMARK.map((p) => p.id)).size).toBe(BENCHMARK.length);
  });

  it('dispose d’une analyse Stockfish enregistree pour chacune', () => {
    for (const snapshot of SNAPSHOTS) {
      expect(snapshot.analysis.fen, snapshot.id).toBe(snapshot.fen);
      expect(snapshot.analysis.lines.length, snapshot.id).toBeGreaterThan(0);
      expect(snapshot.analysis.depth, snapshot.id).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('banc d’essai : invariants d’affichage', () => {
  it('n’affiche jamais plus de trois priorites ni deux points de bascule', () => {
    for (const snapshot of SNAPSHOTS) {
      expect(snapshot.critical.length, snapshot.id).toBeLessThanOrEqual(3);
      expect(snapshot.critical.length, snapshot.id).toBeGreaterThan(0);
    }
  });

  it('donne toujours un plan d’une seule phrase', () => {
    for (const snapshot of SNAPSHOTS) {
      expect(snapshot.planText, snapshot.id).not.toBe('');
      expect(snapshot.planText.split(/(?<=[.!?])\s+/).filter(Boolean), snapshot.id).toHaveLength(1);
    }
  });

  it('ne pose que des questions dans « Que regarder ? »', () => {
    for (const snapshot of SNAPSHOTS) {
      for (const focus of watchFocusCandidates({
        fen: snapshot.fen,
        perspective: snapshot.perspective,
      })) {
        expect(focus.text, `${snapshot.id} → ${focus.text}`).toMatch(/\?$/);
      }
    }
  });
});

describe('banc d’essai : la tactique passe avant tout', () => {
  it('annonce le mat en un plutot que le developpement', () => {
    expect(byId('mate-in-one').critical).toHaveLength(1);
    expect(topText('mate-in-one')).toContain('mat en un');
    expect(byId('mate-in-one').planText).toContain('mat');
  });

  it('annonce la menace de mat plutot que la pire piece', () => {
    expect(topText('mate-threat')).toContain('menacent mat');
    expect(byId('mate-threat').planText).toContain('menace de mat');
  });

  it('signale un mat force plus long confirme par le moteur', () => {
    expect(topText('mate-in-two')).toContain('mat forcé');
    expect(byId('mate-in-two').planText).toContain('mat');
  });

  it('fait passer l’echec subi avant toute idee strategique', () => {
    expect(topText('in-check')).toContain('échec');
    expect(byId('in-check').planText).toContain('échec');
  });

  it('signale la piece en prise plutot que de conseiller de roquer', () => {
    for (const id of ['hanging-knight', 'hanging-queen', 'space-but-losing-piece']) {
      expect(byId(id).critical[0].kind, id).toBe('piece_hanging');
      expect(byId(id).planText, id).not.toContain('Sécurise ton roi');
    }
  });

  it('propose le gain materiel plutot que la structure', () => {
    for (const id of ['king-in-center', 'balanced-middlegame', 'space-advantage']) {
      expect(byId(id).critical[0].kind, id).toBe('material_gain');
    }
  });

  it('n’affiche aucun conseil strategique derriere une alerte tactique', () => {
    for (const snapshot of SNAPSHOTS) {
      if (!isTacticalKind(snapshot.critical[0].kind)) continue;
      for (const feature of snapshot.critical) {
        expect(isTacticalKind(feature.kind), `${snapshot.id} → ${feature.text}`).toBe(true);
      }
    }
  });
});

describe('banc d’essai : diagnostics positionnels', () => {
  it('reconnait un roi reste au centre', () => {
    expect(allText('castle-urgent')).toContain('roi est encore au centre');
    expect(byId('castle-urgent').planText).toContain('Sécurise ton roi');
    expect(allText('weak-structure')).toContain('roi est encore au centre');
  });

  it('reconnait un developpement en retard', () => {
    expect(topText('opening-start')).toContain('pièces mineures');
    expect(allText('opening-italian')).toContain('pièces mineures');
  });

  it('reconnait un pion passe des deux cotes', () => {
    expect(allText('passed-pawn-mine')).toContain('b6');
    expect(allText('passed-pawn-to-block')).toContain('b3');
    expect(byId('passed-pawn-to-block').planText).toContain('Bloque');
  });

  it('reconnait une colonne ouverte inoccupee', () => {
    expect(allText('open-file')).toContain('colonne e');
    expect(byId('open-file').planText).toContain('colonne ouverte e');
  });

  it('reconnait une piece totalement enfermee', () => {
    expect(allText('trapped-piece')).toContain('fou a1');
    expect(byId('trapped-piece').planText).toContain('fou a1');
  });

  it('n’invente pas de colonne ouverte sans pions', () => {
    for (const id of ['mate-in-two', 'rook-endgame']) {
      expect(usefulOpenFile(byId(id).chess, byId(id).perspective), id).toBeNull();
    }
  });
});

describe('banc d’essai : phases', () => {
  it('classe correctement les finales', () => {
    for (const id of ['pawn-endgame', 'rook-endgame', 'passed-pawn-mine', 'promotion-soon']) {
      expect(byId(id).phase, id).toBe('endgame');
    }
  });

  it('ne prend pas un milieu de jeu charge pour une finale', () => {
    for (const id of ['weak-structure', 'queenless-middlegame', 'material-up-weak-king']) {
      expect(byId(id).phase, id).not.toBe('endgame');
    }
  });

  it('ne parle pas d’ouverture sans piece mineure a developper', () => {
    expect(byId('material-up-weak-king').phase).not.toBe('opening');
    expect(byId('losing-defensive').phase).not.toBe('opening');
  });
});

describe('banc d’essai : meilleur coup', () => {
  const playable = SNAPSHOTS.filter((s) => s.myTurn);

  it('reprend exactement le coup de la derniere analyse', () => {
    for (const snapshot of playable) {
      const explanation = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis });
      expect(explanation, snapshot.id).not.toBeNull();
      expect(explanation?.uci, snapshot.id).toBe(snapshot.analysis.bestMove);
    }
  });

  it('propose toujours un coup legal, avec une fleche fidele', () => {
    for (const snapshot of playable) {
      const explanation = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!;
      const move = uciToMove(snapshot.fen, explanation.uci);
      expect(move, snapshot.id).not.toBeNull();
      // La fleche part et arrive exactement sur les cases du coup joue.
      expect(explanation.from, snapshot.id).toBe(move?.from);
      expect(explanation.to, snapshot.id).toBe(move?.to);
      expect(explanation.san, snapshot.id).not.toBe('');
    }
  });

  it('tient toujours en deux phrases', () => {
    for (const snapshot of playable) {
      const explanation = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!;
      expect(
        respectsExplanationLimits(explanation.text),
        `${snapshot.id} → ${explanation.text}`,
      ).toBe(true);
    }
  });

  it('n’invoque jamais le moteur comme seule raison', () => {
    for (const snapshot of playable) {
      const text = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!.text;
      expect(text.toLowerCase(), snapshot.id).not.toContain('stockfish');
      expect(text.length, snapshot.id).toBeGreaterThan(10);
    }
  });

  it('nomme un sacrifice au lieu de le decrire comme un coup ordinaire', () => {
    for (const id of ['sacrifice-sound', 'fork-available']) {
      const snapshot = byId(id);
      const text = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!.text;
      expect(text, id).toContain('acrifie');
    }
  });

  it('explique une parade plutot qu’un benefice accessoire', () => {
    const mateThreat = byId('mate-threat');
    expect(explainBestMove({ fen: mateThreat.fen, analysis: mateThreat.analysis })!.text).toContain(
      'menace de mat',
    );

    const check = byId('in-check');
    expect(explainBestMove({ fen: check.fen, analysis: check.analysis })!.text).toContain('échec');
  });

  it('ne pretend pas gagner du materiel sur un simple echange', () => {
    for (const id of ['no-castling-rights', 'queenless-middlegame']) {
      const snapshot = byId(id);
      const text = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!.text;
      expect(text, id).toContain('échange');
    }
  });

  it('reste factuel quand le coup ne gagne rien', () => {
    for (const id of ['winning-no-tactic', 'bad-bishop']) {
      const snapshot = byId(id);
      const explanation = explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!;
      expect(explanation.text, id).toContain('préparation');
      expect(explanation.confidence, id).toBe('low');
    }
  });

  it('signale les coups pratiquement equivalents', () => {
    const start = byId('opening-start');
    const explanation = explainBestMove({ fen: start.fen, analysis: start.analysis })!;
    expect(explanation.alternatives.length).toBeGreaterThan(0);
    expect(explanation.alternatives).not.toContain(explanation.san);
  });

  it('ne cite aucune alternative quand le meilleur coup est seul', () => {
    for (const id of ['mate-in-one', 'king-in-center']) {
      const snapshot = byId(id);
      expect(
        explainBestMove({ fen: snapshot.fen, analysis: snapshot.analysis })!.alternatives,
        id,
      ).toEqual([]);
    }
  });

  it('gere roque, promotion et prise en passant', () => {
    const castle = byId('weak-structure');
    const castleMove = explainBestMove({ fen: castle.fen, analysis: castle.analysis })!;
    expect(castleMove.san).toBe('O-O-O');
    expect(castleMove.from).toBe('e1');
    expect(castleMove.to).toBe('c1');

    const promotion = byId('promotion-soon');
    const promoted = explainBestMove({
      fen: promotion.fen,
      analysis: promotion.analysis,
      uci: 'e7e8q',
    })!;
    expect(promoted.san).toBe('e8=D+');
    expect(promoted.text).toContain('romeut');

    const ep = byId('en-passant');
    const enPassant = explainBestMove({ fen: ep.fen, analysis: ep.analysis, uci: 'e5d6' })!;
    expect(enPassant.san).toBe('exd6');
    expect(enPassant.to).toBe('d6');
  });
});
