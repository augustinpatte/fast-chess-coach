import type { Color, GamePhase, PieceType, PositionFactorId } from '@/types';
import { PIECE_GENDER, PIECE_NAME_FR } from '@/chess/pieces';

/**
 * Tous les textes du tableau de lecture de position.
 *
 * Le coach existant (`phrases.ts`) repond a « mon dernier coup etait-il bon ? ».
 * Ce catalogue-ci repond a « qu'est-ce qui est important maintenant ? » :
 * les deux vocabulaires restent volontairement separes.
 */

export const FACTOR_LABEL: Record<PositionFactorId, string> = {
  material: 'Matériel',
  king_safety: 'Roi',
  activity: 'Activité',
  center: 'Centre',
  pawns: 'Pions',
};

/** Libelle long, utilise pour l'accessibilite. */
export const FACTOR_FULL_LABEL: Record<PositionFactorId, string> = {
  material: 'Matériel',
  king_safety: 'Sécurité du roi',
  activity: 'Activité et développement',
  center: 'Contrôle du centre et espace',
  pawns: 'Structure de pions',
};

export const PHASE_LABEL: Record<GamePhase, string> = {
  opening: 'Ouverture',
  middlegame: 'Milieu de jeu',
  endgame: 'Finale',
};

/** Nom du camp precede de la preposition contractee ("aux Noirs"). */
export function sideNameTo(color: Color): string {
  return color === 'w' ? 'aux Blancs' : 'aux Noirs';
}

/** Nom du camp en sujet de phrase, avec majuscule. */
export function sideSubject(color: Color): string {
  return color === 'w' ? 'Les Blancs' : 'Les Noirs';
}

/** Adjectif de couleur ("blanc" / "noir"), accorde au masculin singulier. */
export function sideAdjective(color: Color): string {
  return color === 'w' ? 'blanc' : 'noir';
}

const piece = (type: PieceType): string => PIECE_NAME_FR[type];
const feminine = (type: PieceType): boolean => PIECE_GENDER[type] === 'f';

/** « ton cavalier f3 » / « ta tour a1 », avec le bon possessif. */
export function yourPiece(type: PieceType, square?: string): string {
  return `${feminine(type) ? 'ta' : 'ton'} ${piece(type)}${square ? ` ${square}` : ''}`;
}

/** « le cavalier f3 » / « la tour a1 », avec le bon article defini. */
export function thePiece(type: PieceType, square?: string): string {
  return `${feminine(type) ? 'la' : 'le'} ${piece(type)}${square ? ` ${square}` : ''}`;
}

/** « un cavalier » / « une tour ». */
export function aPiece(type: PieceType): string {
  return `${feminine(type) ? 'une' : 'un'} ${piece(type)}`;
}

/** Accorde un participe passe au genre de la piece ("attaqué" / "attaquée"). */
export function agreed(type: PieceType, participle: string): string {
  return feminine(type) ? `${participle}e` : participle;
}

/** Pronom sujet correspondant a la piece ("il" / "elle"). */
export function pronoun(type: PieceType): string {
  return feminine(type) ? 'elle' : 'il';
}

/** Pronom complement correspondant a la piece ("-le" / "-la"). */
export function objectPronoun(type: PieceType): string {
  return feminine(type) ? 'la' : 'le';
}

/** Accord du nombre : « une fois » / « deux fois » / « 3 fois ». */
export function times(count: number): string {
  if (count === 1) return 'une fois';
  if (count === 2) return 'deux fois';
  return `${count} fois`;
}

export const POSITION_PHRASES = {
  /* --- Ce qui compte maintenant ------------------------------------ */

  mateAvailable: (san: string): string => `Tu as un mat en un : ${san}.`,

  mateThreat: (color: Color, san: string): string =>
    `${sideSubject(color)} menacent mat par ${san}.`,

  engineMateFor: (color: Color, plies: number): string =>
    `${sideSubject(color)} ont un mat forcé en ${plies} coups dans la variante principale.`,

  pieceAttacked: (type: PieceType, square: string, attackers: number, defenders: number): string =>
    defenders === 0
      ? `${capitalize(yourPiece(type, square))} est ${agreed(type, 'attaqué')} ${times(
          attackers,
        )} et n’est pas ${agreed(type, 'défendu')}.`
      : `${capitalize(yourPiece(type, square))} est ${agreed(type, 'attaqué')} ${times(
          attackers,
        )} et ${agreed(type, 'défendu')} ${times(defenders)}.`,

  opponentThreat: (color: Color, san: string): string => `${sideSubject(color)} menacent ${san}.`,

  inCheck: (): string => 'Tu es en échec : trouve la parade avant tout le reste.',

  materialGain: (san: string, type: PieceType): string =>
    `Tu peux gagner ${thePiece(type)} en ${san}.`,

  tacticPin: (type: PieceType, square: string): string =>
    `${capitalize(thePiece(type, square))} adverse est ${agreed(type, 'cloué')} et ne peut pas bouger.`,

  tacticPinned: (type: PieceType, square: string): string =>
    `${capitalize(yourPiece(type, square))} est ${agreed(type, 'cloué')} : ${pronoun(
      type,
    )} ne défend plus rien.`,

  tacticFork: (type: PieceType, square: string, count: number): string =>
    `${capitalize(yourPiece(type, square))} attaque ${count} pièces à la fois.`,

  kingInCenter: (openFile: string | null): string =>
    openFile
      ? `Ton roi est encore au centre alors que la colonne ${openFile} peut s’ouvrir.`
      : 'Ton roi est encore au centre : il faut le mettre à l’abri.',

  kingUnderPressure: (attackers: number): string =>
    `${attackers} pièces adverses visent déjà les cases autour de ton roi.`,

  enemyKingExposed: (color: Color, square: string): string =>
    `Le roi ${sideAdjective(color)} en ${square} est exposé : cherche les échecs.`,

  developmentLate: (count: number): string =>
    count === 1
      ? 'Il te reste une pièce mineure à développer.'
      : `Il te reste ${count} pièces mineures à développer.`,

  inactivePiece: (type: PieceType, square: string): string =>
    `${capitalize(yourPiece(type, square))} est ta pièce la moins active.`,

  weakSquare: (square: string, type: PieceType): string =>
    `La case ${square} est faible : ${yourPiece(type)} peut l’occuper.`,

  centerLoss: (color: Color): string =>
    `${sideSubject(color)} contrôlent le centre : conteste e4, d4, e5 et d5.`,

  openFileFree: (file: string): string =>
    `La colonne ${file} est ouverte et aucune tour ne l’occupe.`,

  passedPawnMine: (square: string): string => `Ton pion ${square} est passé.`,

  passedPawnTheirs: (color: Color, square: string): string =>
    `${sideSubject(color)} ont un pion passé en ${square}.`,

  pawnWeakness: (square: string): string => `Ton pion ${square} est isolé et difficile à défendre.`,

  quietPosition: (): string => 'Aucune menace immédiate : suis ton plan.',

  /* --- Points de bascule -------------------------------------------- */

  swingLosingPiece: (type: PieceType, square: string, color: Color): string =>
    `Perdre ${yourPiece(type, square)} ferait passer l’avantage ${sideNameTo(color)}.`,

  swingWinningPiece: (type: PieceType, square: string): string =>
    `Gagner ${thePiece(type, square)} te donnerait un avantage matériel net.`,

  swingOnlyMove: (): string =>
    'Le moteur ne trouve qu’un seul bon coup : les autres sont nettement moins bons.',

  swingPassedPawn: (square: string, next: string): string =>
    `Le pion passé ${square} devient très dangereux s’il atteint ${next}.`,

  /* --- Ton plan ------------------------------------------------------ */

  planAnswerCheck: (): string => 'Tu es en échec : commence par trouver la parade.',

  planFinishMate: (): string => 'Le mat est là : cherche l’échec qui termine la partie.',

  planStopMate: (): string => 'Pare la menace de mat avant de penser à autre chose.',

  planDefendPawn: (square: string): string =>
    `Défends ton pion ${square} ou accepte de le lâcher pour un coup utile.`,

  planCastle: (): string => 'Sécurise ton roi avant de commencer une attaque.',

  planSaveHanging: (type: PieceType, square: string): string =>
    `${capitalize(yourPiece(type, square))} est ${agreed(
      type,
      'attaqué',
    )} : trouve un coup qui ${objectPronoun(type)} sauve, ou qui gagne davantage.`,

  planTakeMaterial: (type: PieceType): string =>
    `Gagne ${thePiece(type)} disponible avant de continuer ton plan.`,

  planAttackKing: (color: Color): string =>
    `Cherche les échecs contre le roi ${sideAdjective(color)} exposé.`,

  planBlockPassed: (square: string): string => `Bloque d’abord le pion passé ${square}.`,

  planDevelop: (): string => 'Termine ton développement avant de chercher une attaque.',

  planRookOpenFile: (file: string): string => `Mets une tour sur la colonne ouverte ${file}.`,

  planImprovePiece: (type: PieceType, square: string): string =>
    `Améliore ${yourPiece(type, square)}, actuellement ta pire pièce.`,

  planPushPassed: (square: string): string =>
    `Pousse ton pion passé ${square}, soutenu par tes pièces.`,

  planActivateKing: (): string => 'Active ton roi : en finale il doit avancer vers le centre.',

  planTakeCenter: (): string => 'Reprends le contrôle du centre avec tes pions.',

  planDefault: (): string => 'Garde tes pièces défendues et améliore la moins active.',

  /* --- Que regarder ? ------------------------------------------------ */

  watchOwnPiece: (type: PieceType, square: string): string =>
    `Regarde ${yourPiece(type, square)} : combien de fois est-${pronoun(type)} ${agreed(
      type,
      'attaqué',
    )} et ${agreed(type, 'défendu')} ?`,

  watchEnemyPiece: (type: PieceType, square: string): string =>
    `Regarde ${thePiece(type, square)} adverse : est-${pronoun(type)} vraiment ${agreed(
      type,
      'défendu',
    )} ?`,

  watchOwnKing: (square: string): string =>
    `Regarde les cases autour de ton roi ${square} : combien de pièces adverses y arrivent ?`,

  watchEnemyKing: (color: Color, square: string): string =>
    `Regarde le roi ${sideAdjective(color)} en ${square} : quelles lignes mènent jusqu’à lui ?`,

  watchPassedPawn: (square: string): string =>
    `Regarde le pion passé ${square} : qui peut encore l’arrêter ?`,

  watchOpenFile: (file: string): string =>
    `Regarde la colonne ouverte ${file} : qui peut l’occuper en premier ?`,

  watchWeakSquare: (square: string): string =>
    `Regarde la case ${square} : aucun pion adverse ne la défend, qui peut l’occuper ?`,

  watchInactivePiece: (type: PieceType, square: string): string =>
    `Regarde ${yourPiece(type, square)} : combien de cases contrôle-t-${pronoun(type)} ?`,

  watchCenter: (): string => 'Regarde le centre : qui contrôle e4, d4 et d5 ?',

  /* --- Explication du meilleur coup ---------------------------------- */

  moveMate: (): string => 'donne échec et mat',

  moveForcedMate: (plies: number): string => `mène à un mat forcé en ${plies} coups`,

  moveCheck: (): string => 'met le roi adverse en échec',

  moveWinsPiece: (type: PieceType): string => `gagne ${aPiece(type)}`,

  moveTrades: (type: PieceType): string => `échange contre ${thePiece(type)}`,

  moveSacrifices: (type: PieceType): string => `sacrifie ${yourPiece(type)}`,

  moveSacrificesForAttack: (type: PieceType): string =>
    `sacrifie ${yourPiece(type)} pour ouvrir le roi adverse`,

  moveStopsMate: (san: string): string => `pare la menace de mat ${san}`,

  moveEscapesCheck: (): string => 'sort de l’échec',

  moveGivesLuft: (): string => 'ouvre une case de fuite à ton roi',

  moveApproachesPawn: (square: string): string => `rapproche ton roi du pion passé ${square}`,

  moveQuiet: (): string => 'il n’y a rien à gagner immédiatement : c’est un coup de préparation',

  moveFavourableTrade: (type: PieceType): string =>
    `échange favorablement contre ${thePiece(type)}`,

  moveSavesPiece: (type: PieceType): string => `met ${yourPiece(type)} à l’abri`,

  moveParriesThreat: (san: string): string => `pare la menace ${san}`,

  moveFork: (count: number): string => `attaque ${count} pièces à la fois`,

  movePins: (type: PieceType, square: string): string => `cloue ${thePiece(type, square)}`,

  moveDoubleAttack: (): string => 'crée une double attaque',

  moveDeflects: (square: string): string => `chasse le seul défenseur de ${square}`,

  moveCastles: (): string => 'met ton roi à l’abri',

  moveDevelops: (type: PieceType): string => `développe ${yourPiece(type)}`,

  moveControls: (squares: string[]): string => `contrôle ${squares.join(' et ')}`,

  moveAttacks: (type: PieceType, square: string): string => `attaque ${thePiece(type, square)}`,

  moveRookOpenFile: (file: string): string => `place ta tour sur la colonne ouverte ${file}`,

  moveCreatesPassed: (): string => 'crée un pion passé',

  movePushesPassed: (square: string): string => `pousse ton pion passé en ${square}`,

  moveOccupiesCenter: (square: string): string => `occupe le centre en ${square}`,

  movePromotes: (): string => 'promeut ton pion',

  moveStopsPassed: (square: string): string => `contrôle l’avance du pion passé ${square}`,

  movePreparesCastle: (): string => 'prépare le roque',

  moveImprovesKing: (): string => 'améliore la sécurité de ton roi',

  moveActivates: (type: PieceType, from: string, to: string): string =>
    `active ${yourPiece(type)} de ${from} vers ${to}`,

  movePvConsequence: (reply: string, follow: string, type: PieceType): string =>
    `Après ${reply}, ${follow} gagne ${aPiece(type)}.`,

  moveAlternatives: (best: string, others: string[]): string =>
    `${best} est le premier choix, mais ${others.join(' et ')} ${
      others.length > 1 ? 'sont' : 'est'
    } également très bon${others.length > 1 ? 's' : ''}.`,

  /* --- Etats --------------------------------------------------------- */

  waitingForEngine: (): string => 'Analyse du moteur en cours…',

  noBestMove: (): string => 'Le moteur n’a proposé aucun coup pour cette position.',
} as const;

/** Compose une phrase a partir d'un verbe principal et de complements. */
export function composeMoveSentence(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return capitalize(`${parts[0]}.`);
  const [first, ...rest] = parts;
  return capitalize(`${first} et ${rest.join(', ')}.`);
}

/** Met la premiere lettre en majuscule. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}
