import type { CoachLevel, DiagnosticKind, MoveQuality, PieceType } from '@/types';
import { PIECE_NAME_FR } from '@/chess/pieces';

/**
 * Tous les modeles de phrases du coach sont centralises ici.
 * Aucun texte pedagogique ne doit etre ecrit ailleurs dans le code.
 */

export const QUALITY_LABEL: Record<MoveQuality, string> = {
  best: 'Meilleur coup',
  excellent: 'Excellent',
  good: 'Bon',
  playable: 'Jouable',
  inaccuracy: 'Imprécision',
  mistake: 'Erreur',
  blunder: 'Grosse erreur',
  missed_mate: 'Mat manqué',
};

/** Couleur d'accent associee a chaque qualite (utilisee par l'interface). */
export const QUALITY_TONE: Record<MoveQuality, 'good' | 'neutral' | 'warn' | 'bad'> = {
  best: 'good',
  excellent: 'good',
  good: 'good',
  playable: 'neutral',
  inaccuracy: 'warn',
  mistake: 'bad',
  blunder: 'bad',
  missed_mate: 'bad',
};

/** Concept principal affiche dans « Voir plus ». */
export const CONCEPT_BY_KIND: Record<DiagnosticKind, string> = {
  mate_delivered: 'Concrétiser une attaque par le mat.',
  mate_missed: 'Chercher le mat avant de compter le matériel.',
  piece_lost: 'Vérifier que chaque pièce est défendue avant de jouer.',
  piece_hanging: 'Une pièce sans défenseur est une pièce en danger.',
  free_capture_available: 'Regarder toutes les prises avant de choisir un coup.',
  check_or_threat: 'Créer une menace force l’adversaire à répondre.',
  fork: 'Une pièce qui attaque deux cibles gagne du matériel.',
  pin: 'Un clouage immobilise une pièce adverse.',
  double_attack: 'Attaquer deux cibles à la fois est la tactique la plus rentable.',
  king_exposed: 'Un roi au centre est une cible.',
  development_lag: 'Sortir toutes ses pièces avant d’attaquer.',
  no_castle: 'Roquer tôt met le roi à l’abri.',
  center_control: 'Le centre donne de l’espace à toutes les pièces.',
  misplaced_piece: 'Une pièce sur le bord contrôle moins de cases.',
  bad_trade: 'Un échange doit gagner du matériel ou de la position.',
  pawn_structure: 'Les pions ne reculent jamais : leurs faiblesses restent.',
  rook_activity: 'Les tours aiment les colonnes ouvertes.',
  passed_pawn: 'Un pion passé doit avancer, soutenu par le roi en finale.',
  endgame_plan: 'En finale, le roi devient une pièce active.',
  opening_deviation: 'Connaître les premiers coups fait gagner du temps.',
  opening_ok: 'Suivre un plan d’ouverture simplifie la partie.',
  neutral: 'Jouer un coup utile à chaque tour.',
};

const article = (type: PieceType): string => PIECE_NAME_FR[type];

/* ------------------------------------------------------------------ */
/* Phrases par diagnostic                                              */
/* ------------------------------------------------------------------ */

export const PHRASES = {
  mateDelivered: (): string => 'Échec et mat, la partie est gagnée.',

  mateMissed: (bestSan: string): string =>
    `Tu avais un mat forcé avec ${bestSan} : cherche les échecs.`,

  pieceLost: (type: PieceType, square: string, by: string): string =>
    `Ton ${article(type)} ${square} n’est plus défendu : ${by} le gagne.`,

  pieceHanging: (type: PieceType, square: string): string =>
    `Ton ${article(type)} ${square} est en prise, sans défenseur.`,

  pieceHangingMultiple: (count: number): string => `Tu laisses ${count} pièces sans défense.`,

  freeCaptureMissed: (san: string, type: PieceType): string =>
    `Tu pouvais gagner un ${article(type)} avec ${san}.`,

  freeCaptureNow: (san: string, type: PieceType): string =>
    `L’adversaire laisse un ${article(type)} en prise : ${san} le gagne.`,

  checkThreat: (san: string): string => `${san} crée une menace directe à parer.`,

  forkCreated: (type: PieceType, square: string, count: number): string =>
    `Fourchette : ton ${article(type)} ${square} attaque ${count} pièces.`,

  forkAllowed: (type: PieceType, square: string): string =>
    `Attention : un ${article(type)} adverse peut fourcher en ${square}.`,

  pinCreated: (type: PieceType, square: string): string =>
    `Bon clouage : le ${article(type)} ${square} adverse est bloqué.`,

  pinSuffered: (type: PieceType, square: string): string =>
    `Ton ${article(type)} ${square} est cloué et ne défend plus.`,

  doubleAttack: (square: string): string =>
    `Double attaque depuis ${square} : deux cibles à la fois.`,

  kingExposed: (): string => 'Ton roi est encore au centre : il devient une cible.',

  developmentLag: (type: PieceType, square: string): string =>
    `Tu rejoues ton ${article(type)} alors que ${square} dort encore.`,

  developmentGood: (type: PieceType): string =>
    `Bon développement : ton ${article(type)} sort vers le centre.`,

  noCastle: (): string => 'Termine ton développement et roque vite.',

  castleGood: (): string => 'Roque effectué : ton roi est à l’abri.',

  centerGood: (square: string): string => `Bon coup au centre : ${square} ouvre tes pièces.`,

  centerLost: (): string => 'Tu abandonnes le centre à l’adversaire.',

  misplacedPiece: (type: PieceType, square: string): string =>
    `Ton ${article(type)} ${square} est sur le bord, peu actif.`,

  badTrade: (lost: PieceType, gained: PieceType): string =>
    `Échange défavorable : un ${article(lost)} pour un ${article(gained)}.`,

  goodTrade: (gained: PieceType): string =>
    `Tu gagnes un ${article(gained)} : échange les pièces maintenant.`,

  pawnStructure: (file: string): string => `Tes pions se doublent sur la colonne ${file}.`,

  rookActivity: (square: string): string => `Ta tour ${square} tient une colonne ouverte.`,

  passedPawn: (square: string): string => `Ton pion ${square} est passé : pousse-le.`,

  endgamePlan: (): string => 'En finale, active ton roi et pousse tes pions.',

  slowMove: (): string => 'Coup jouable, mais lent : gagne du temps.',

  openingInBook: (variation: string): string => `Tu suis la théorie : ${variation}.`,

  openingLeftBook: (suggestion: string | null): string =>
    suggestion
      ? `Tu quittes la théorie : ${suggestion} est plus naturel.`
      : 'Tu quittes la ligne principale, mais ton coup reste jouable.',

  openingBadDeviation: (suggestion: string | null): string =>
    suggestion
      ? `Ce coup sort de l’ouverture : ${suggestion} est plus naturel.`
      : 'Ce coup sort de l’ouverture et gêne tes pièces.',

  bestMoveConfirmed: (): string => 'C’est le coup le plus fort ici.',

  keepGoing: (): string => 'Continue : développe et sécurise ton roi.',

  neutralGood: (): string => 'Coup correct, la position reste saine.',
} as const;

/* ------------------------------------------------------------------ */
/* Adaptation au niveau pedagogique                                    */
/* ------------------------------------------------------------------ */

/**
 * Diagnostics juges trop avances pour un debutant : ils sont filtres afin de
 * garder des conseils concrets (pieces en prise, menaces, developpement).
 */
const ADVANCED_KINDS: DiagnosticKind[] = [
  'pawn_structure',
  'rook_activity',
  'misplaced_piece',
  'endgame_plan',
];

const INTERMEDIATE_ONLY: DiagnosticKind[] = ['endgame_plan'];

/** true si le diagnostic est pertinent pour le niveau pedagogique choisi. */
export function isKindAllowed(kind: DiagnosticKind, level: CoachLevel): boolean {
  if (level === 'beginner') return !ADVANCED_KINDS.includes(kind);
  if (level === 'intermediate') return !INTERMEDIATE_ONLY.includes(kind);
  return true;
}

/** Conseil final adapte au niveau, utilise comme deuxieme phrase par defaut. */
export function levelAdvice(level: CoachLevel): string {
  switch (level) {
    case 'beginner':
      return 'Vérifie tes pièces en prise.';
    case 'intermediate':
      return 'Active ta pièce la moins utile.';
    case 'progress':
      return 'Choisis un plan avant de jouer.';
    default:
      return 'Continue ton développement.';
  }
}
