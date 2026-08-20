import type {
  AnalysisResult,
  CoachDetails,
  CoachFeedback,
  CoachLevel,
  Color,
  Diagnostic,
  DiagnosticKind,
  PieceType,
} from '@/types';
import type { Move } from '@/chess/rules';
import { uciLineToSan, uciToSan } from '@/chess/rules';
import { sanToFrench } from '@/chess/pieces';
import { MATE_CP, scoreToCp } from '@/engine/uci';
import { classifyMove, qualityLabel } from './classification';
import { diagnose } from './diagnostics';
import { formatCoachText } from './format';
import { CONCEPT_BY_KIND, PHRASES, isKindAllowed, levelAdvice } from './phrases';

export interface CoachInput {
  fenBefore: string;
  fenAfter: string;
  move: Move;
  playerColor: Color;
  /** Analyse de la position AVANT le coup (trait au joueur). */
  before: AnalysisResult | null;
  /** Analyse de la position APRES le coup (trait a l'adversaire). */
  after: AnalysisResult | null;
  coachLevel: CoachLevel;
  playerMoveHistory: ReadonlyArray<{ from: string; to: string; piece: PieceType }>;
  opening: {
    active: boolean;
    inBookBefore: boolean;
    inBookAfter: boolean;
    variationName: string | null;
    suggestion: string | null;
  } | null;
}

/** Evaluation d'une analyse, du point de vue du joueur qui vient de jouer. */
function evalFromMoverPov(analysis: AnalysisResult | null, moverIsToPlay: boolean): number | null {
  const line = analysis?.lines[0];
  if (!line) return null;
  const cp = scoreToCp(line.score);
  return moverIsToPlay ? cp : -cp;
}

/** Genere le retour pedagogique complet d'un coup du joueur. */
export function buildFeedback(input: CoachInput): CoachFeedback {
  const evalBefore = evalFromMoverPov(input.before, true);
  const evalAfter = evalFromMoverPov(input.after, false);

  const bestUci = input.before?.bestMove ?? input.before?.lines[0]?.pv[0] ?? null;
  const playedUci = `${input.move.from}${input.move.to}${input.move.promotion ?? ''}`;
  const isBestMove = bestUci !== null && bestUci === playedUci;

  const cpLoss =
    evalBefore === null || evalAfter === null ? 0 : Math.max(0, Math.round(evalBefore - evalAfter));

  const bestScore = input.before?.lines[0]?.score;
  const hadForcedMate = bestScore?.mate !== null && bestScore !== undefined && bestScore.mate > 0;
  const stillMating = evalAfter !== null && evalAfter >= MATE_CP - 5000;
  const missedMate = Boolean(hadForcedMate) && !isBestMove && !stillMating;

  const bestMoveSan = bestUci && !isBestMove ? uciToSan(input.fenBefore, bestUci) : null;
  const deliversMate = input.move.san.endsWith('#');

  const quality = classifyMove({ cpLoss, isBestMove, missedMate, deliversMate });

  const all = diagnose({
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    move: input.move,
    playerColor: input.playerColor,
    cpLoss,
    quality,
    bestMoveSan,
    missedMate,
    playerMoveHistory: input.playerMoveHistory,
    opening: input.opening,
  }).filter((d) => isKindAllowed(d.kind, input.coachLevel));

  const selected = selectDiagnostics(all);
  const parts = selected.map((d) => d.text);

  if (parts.length === 0) {
    parts.push(isBestMove ? PHRASES.bestMoveConfirmed() : PHRASES.neutralGood());
  }
  if (parts.length === 1) {
    parts.push(secondSentence(quality, bestMoveSan, input.coachLevel));
  }

  const text = formatCoachText(parts);

  return {
    quality,
    qualityLabel: qualityLabel(quality),
    text,
    cpLoss,
    bestMoveSan: bestMoveSan ? sanToFrench(bestMoveSan) : null,
    diagnostics: selected.map((d) => d.kind),
    details: buildDetails(input, bestUci, selected),
  };
}

/**
 * Retient au maximum deux diagnostics, et jamais deux fois la meme categorie.
 * Le cahier des charges interdit d'enumerer cinq defauts.
 */
export function selectDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<DiagnosticKind>();
  const out: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (seen.has(diagnostic.kind)) continue;
    seen.add(diagnostic.kind);
    out.push(diagnostic);
    if (out.length === 2) break;
  }
  return out;
}

/** Deuxieme phrase par defaut : un conseil, jamais un jugement abstrait. */
function secondSentence(
  quality: CoachFeedback['quality'],
  bestMoveSan: string | null,
  level: CoachLevel,
): string {
  if (quality === 'blunder' || quality === 'mistake') {
    return bestMoveSan ? `${sanToFrench(bestMoveSan)} était plus solide.` : levelAdvice(level);
  }
  if (quality === 'inaccuracy') {
    return bestMoveSan ? `${sanToFrench(bestMoveSan)} était plus actif.` : PHRASES.slowMove();
  }
  if (quality === 'playable') return PHRASES.slowMove();
  return levelAdvice(level);
}

/** Contenu du bouton « Voir plus » : meilleur coup, variante courte, concept. */
function buildDetails(
  input: CoachInput,
  bestUci: string | null,
  selected: readonly Diagnostic[],
): CoachDetails | null {
  const line = input.before?.lines[0];
  if (!line || !bestUci) return null;
  const variation = uciLineToSan(input.fenBefore, line.pv, 4).map(sanToFrench);
  const concept = CONCEPT_BY_KIND[selected[0]?.kind ?? 'neutral'];
  const san = uciToSan(input.fenBefore, bestUci);
  return {
    bestMoveSan: san ? sanToFrench(san) : null,
    variation,
    concept,
  };
}
