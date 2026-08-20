import { useState } from 'react';
import type { GameSummary, MoveRecord } from '@/types';
import { sanToFrench } from '@/chess/pieces';
import { Dialog } from './Dialog';

export interface GameOverDialogProps {
  open: boolean;
  summary: GameSummary;
  keyMoments: readonly MoveRecord[];
  onClose: () => void;
  onReplay: () => void;
  onTryAnotherOpening: () => void;
}

const RESULT_LABEL: Record<GameSummary['result'], string> = {
  win: 'Victoire',
  loss: 'Défaite',
  draw: 'Partie nulle',
};

const REASON_LABEL: Record<GameSummary['reason'], string> = {
  checkmate: 'échec et mat',
  stalemate: 'pat',
  insufficient_material: 'matériel insuffisant',
  threefold: 'triple répétition',
  fifty_moves: 'règle des 50 coups',
  resignation: 'abandon',
  agreement: 'accord mutuel',
};

/** Qualite approximative de la partie a partir de la perte moyenne. */
function qualityLabel(averageCpLoss: number): string {
  if (averageCpLoss < 30) return 'très propre';
  if (averageCpLoss < 60) return 'solide';
  if (averageCpLoss < 100) return 'correcte';
  if (averageCpLoss < 160) return 'irrégulière';
  return 'difficile';
}

/** Point fort principal, deduit des statistiques de la partie. */
function strength(summary: GameSummary): string {
  if (summary.blunders === 0 && summary.mistakes === 0) {
    return 'Aucune grosse erreur : ta vigilance a été constante.';
  }
  if (summary.castledOnMove !== null && summary.castledOnMove <= 8) {
    return 'Tu as mis ton roi à l’abri rapidement.';
  }
  if (summary.openingMistakes === 0) {
    return 'Ton ouverture a été jouée proprement.';
  }
  return 'Tu es allé au bout de la partie sans abandonner ton plan.';
}

/** Principal point a travailler. */
function weakness(summary: GameSummary): string {
  if (summary.hangingPieces >= 2) return 'Tu as laissé plusieurs pièces sans défense.';
  if (summary.blunders >= 1)
    return 'Une grosse erreur a changé la partie : vérifie les prises adverses.';
  if (summary.castledOnMove === null) return 'Tu n’as pas roqué : ton roi est resté exposé.';
  if (summary.missedTactics >= 1) return 'Tu as laissé passer du matériel gratuit.';
  if (summary.openingMistakes >= 2) return 'Les premiers coups manquent de précision.';
  return 'Cherche à activer ta pièce la moins utile à chaque coup.';
}

/** Resume court de fin de partie. Jamais un rapport de plusieurs pages. */
export function GameOverDialog(props: GameOverDialogProps): React.JSX.Element {
  const [showMoments, setShowMoments] = useState(false);
  const s = props.summary;

  return (
    <Dialog
      title={`${RESULT_LABEL[s.result]} — ${REASON_LABEL[s.reason]}`}
      open={props.open}
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={props.onReplay}>
            Rejouer
          </button>
          <button type="button" className="btn" onClick={props.onTryAnotherOpening}>
            Tester une autre ouverture
          </button>
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>
            Fermer
          </button>
        </>
      }
    >
      <p className="summary-line">
        Partie <strong>{qualityLabel(s.averageCpLoss)}</strong> · perte moyenne {s.averageCpLoss} cp
        · {s.mistakes} erreur{s.mistakes > 1 ? 's' : ''} · {s.blunders} grosse
        {s.blunders > 1 ? 's' : ''} erreur{s.blunders > 1 ? 's' : ''}.
      </p>
      <p className="summary-line">
        Ouverture : <strong>{s.openingName ?? 'partie libre'}</strong>
      </p>
      <p className="summary-good">Point positif : {strength(s)}</p>
      <p className="summary-bad">À travailler : {weakness(s)}</p>

      <button type="button" className="btn btn-link" onClick={() => setShowMoments((v) => !v)}>
        {showMoments ? 'Masquer' : 'Voir'} les 3 moments importants
      </button>
      {showMoments ? (
        <ul className="moments">
          {props.keyMoments.length === 0 ? <li>Pas de moment marquant.</li> : null}
          {props.keyMoments.map((move) => (
            <li key={move.uci + move.fenBefore}>
              <strong>{sanToFrench(move.san)}</strong> — {move.feedback?.qualityLabel} :{' '}
              {move.feedback?.text}
            </li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}
