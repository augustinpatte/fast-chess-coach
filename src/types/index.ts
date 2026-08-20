/** Types partages par toute l'application. Aucun `any`. */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = string; // 'e4' ; chess.js valide la valeur reelle

/* ------------------------------------------------------------------ */
/* Moteur                                                              */
/* ------------------------------------------------------------------ */

/** Score renvoye par Stockfish, toujours du point de vue du trait. */
export interface EngineScore {
  /** Centipions ; null si le score est un mat. */
  cp: number | null;
  /** Nombre de coups avant mat (positif = le trait mate) ; null sinon. */
  mate: number | null;
}

/** Une ligne (variante) renvoyee par le moteur. */
export interface EngineLine {
  multipv: number;
  depth: number;
  score: EngineScore;
  /** Coups UCI, ex. ['e2e4', 'e7e5']. */
  pv: string[];
}

/** Resultat complet d'une analyse. */
export interface AnalysisResult {
  fen: string;
  /** Meilleur coup en notation UCI, ou null (mat / pat). */
  bestMove: string | null;
  lines: EngineLine[];
  depth: number;
  /** Duree de la recherche, en ms. */
  elapsedMs: number;
}

export interface AnalysisRequest {
  fen: string;
  multiPV: number;
  movetime?: number;
  depth?: number;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'searching' | 'error';

/* ------------------------------------------------------------------ */
/* Niveaux / difficulte                                                */
/* ------------------------------------------------------------------ */

export type LevelId = 600 | 800 | 1000 | 1200 | 1400 | 1500 | 1700 | 1900 | 3000;

/** Profil de difficulte applique au moteur et au choix du coup. */
export interface DifficultyProfile {
  id: LevelId | 'custom';
  label: string;
  /** Elo affiche ; 'custom' utilise la valeur choisie par l'utilisateur. */
  elo: number;
  /** Option UCI_LimitStrength utilisable (moteur >= 1320). */
  useLimitStrength: boolean;
  /** Skill Level UCI (0-20). */
  skillLevel: number;
  /** Profondeur maximale de recherche. */
  depth: number;
  /** Temps de reflexion maximal, en ms. */
  movetime: number;
  /** Nombre de lignes demandees pour le choix pondere. */
  multiPV: number;
  /** Probabilite de ne pas jouer le meilleur coup. */
  mistakeChance: number;
  /** Perte maximale toleree, en centipions, pour un coup "imparfait". */
  maxLossCp: number;
  /** Temperature du tirage pondere : plus haut = plus aleatoire. */
  temperature: number;
}

export type AnalysisSpeed = 'fast' | 'normal' | 'accurate';

export interface SpeedProfile {
  id: AnalysisSpeed;
  label: string;
  /** Temps alloue a l'analyse pedagogique (ms). */
  coachMovetime: number;
  /** Profondeur maximale de l'analyse pedagogique. */
  coachDepth: number;
  /** Temps alloue a la barre d'evaluation (ms). */
  evalMovetime: number;
}

/* ------------------------------------------------------------------ */
/* Coaching                                                            */
/* ------------------------------------------------------------------ */

export type MoveQuality =
  'best' | 'excellent' | 'good' | 'playable' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed_mate';

export type CoachLevel = 'beginner' | 'intermediate' | 'progress';

/** Categorie de diagnostic, par ordre de priorite decroissante. */
export type DiagnosticKind =
  | 'mate_delivered'
  | 'mate_missed'
  | 'piece_lost'
  | 'piece_hanging'
  | 'free_capture_available'
  | 'check_or_threat'
  | 'fork'
  | 'pin'
  | 'double_attack'
  | 'king_exposed'
  | 'development_lag'
  | 'no_castle'
  | 'center_control'
  | 'misplaced_piece'
  | 'bad_trade'
  | 'pawn_structure'
  | 'rook_activity'
  | 'passed_pawn'
  | 'endgame_plan'
  | 'opening_deviation'
  | 'opening_ok'
  | 'neutral';

export interface Diagnostic {
  kind: DiagnosticKind;
  /** Plus la valeur est haute, plus le diagnostic est prioritaire. */
  priority: number;
  /** Phrase courte, deja redigee. */
  text: string;
  /** Cases concernees (surbrillance eventuelle). */
  squares?: Square[];
}

export interface CoachFeedback {
  quality: MoveQuality;
  /** Etiquette francaise de la qualite ("Imprecision", ...). */
  qualityLabel: string;
  /** Texte final : 2 phrases maximum, 2 lignes maximum. */
  text: string;
  /** Perte en centipions par rapport au meilleur coup. */
  cpLoss: number;
  /** Meilleur coup en SAN, si different du coup joue. */
  bestMoveSan: string | null;
  /** Diagnostics retenus (au plus 2). */
  diagnostics: DiagnosticKind[];
  /** Details facultatifs affiches via "Voir plus". */
  details: CoachDetails | null;
}

export interface CoachDetails {
  bestMoveSan: string | null;
  /** Variante courte : 3 ou 4 demi-coups en SAN. */
  variation: string[];
  /** Concept principal en une phrase. */
  concept: string;
}

/* ------------------------------------------------------------------ */
/* Lecture de position (tableau de bord)                               */
/* ------------------------------------------------------------------ */

/** Phase de partie, detectee approximativement. */
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/**
 * Confiance accordee a une information affichee.
 * `high`  : fait verifiable sur l'echiquier ou confirme par le moteur.
 * `medium`: heuristique solide, formulee prudemment.
 * `low`   : piste de reflexion, jamais presentee comme une certitude.
 */
export type Confidence = 'high' | 'medium' | 'low';

export type PositionFactorId = 'material' | 'king_safety' | 'activity' | 'center' | 'pawns';

/** Une jauge du tableau de bord. */
export interface PositionFactor {
  id: PositionFactorId;
  label: string;
  /** Echelle bornee : -2 = avantage noirs, 0 = equilibre, +2 = avantage blancs. */
  value: number;
  /** true si la jauge est prioritaire dans la phase courante. */
  highlighted: boolean;
  /** Complement factuel court ("+1 blancs"), ou null s'il n'apporte rien. */
  detail: string | null;
}

/** Categorie d'un element de « Ce qui compte maintenant ». */
export type CriticalFeatureKind =
  | 'mate'
  | 'mate_threat'
  | 'piece_hanging'
  | 'forced_tactic'
  | 'opponent_threat'
  | 'material_gain'
  | 'king_safety'
  | 'development'
  | 'piece_activity'
  | 'center'
  | 'pawn_structure'
  | 'plan';

export interface CriticalFeature {
  kind: CriticalFeatureKind;
  /** Plus la valeur est haute, plus l'element est prioritaire. */
  priority: number;
  /** Une ligne courte, deja redigee. */
  text: string;
  squares: Square[];
  confidence: Confidence;
  /** true si l'element s'appuie sur une donnee du moteur. */
  fromEngine: boolean;
}

/** Evenement susceptible de faire basculer la partie. */
export interface SwingFactor {
  text: string;
  confidence: Confidence;
  squares: Square[];
  fromEngine: boolean;
}

/** Priorite unique proposee au joueur. Une phrase, jamais un coup impose. */
export interface PositionPlan {
  text: string;
  confidence: Confidence;
  squares: Square[];
}

export interface PositionAssessment {
  fen: string;
  phase: GamePhase;
  /** Couleur du joueur : les textes sont ecrits de son point de vue. */
  perspective: Color;
  factors: PositionFactor[];
  /** Au plus trois elements, tries par priorite. */
  critical: CriticalFeature[];
  /** Au plus deux points de bascule ; vide si rien de fiable. */
  swings: SwingFactor[];
  /** true si l'analyse moteur a ete prise en compte. */
  engineBacked: boolean;
  /** Camp qui dispose d'un mat force, si l'information est fiable. */
  forcedMate: Color | null;
}

/** Explication deterministe du meilleur coup. */
export interface BestMoveExplanation {
  uci: string;
  /** Notation SAN francaise (Cc3, Txe5…). */
  san: string;
  from: Square;
  to: Square;
  /** Deux phrases maximum. */
  text: string;
  confidence: Confidence;
  /** Autres coups pratiquement equivalents, en SAN francais. */
  alternatives: string[];
}

/** Piste de lecture proposee par « Que regarder ? ». */
export interface WatchFocus {
  text: string;
  squares: Square[];
  confidence: Confidence;
}

/* ------------------------------------------------------------------ */
/* Aides visuelles sur l'echiquier                                     */
/* ------------------------------------------------------------------ */

export type BoardArrowKind = 'best' | 'threat';
export type BoardHighlightKind = 'focus' | 'threat' | 'strategic';

export interface BoardArrow {
  from: Square;
  to: Square;
  kind: BoardArrowKind;
}

export interface BoardHighlight {
  square: Square;
  kind: BoardHighlightKind;
}

/* ------------------------------------------------------------------ */
/* Ouvertures                                                          */
/* ------------------------------------------------------------------ */

export type OpeningSide = 'white' | 'black-e4' | 'black-d4';
export type OpeningStyle = 'solide' | 'actif' | 'tactique' | 'positionnel';
export type OpeningDifficulty = 'facile' | 'moyen' | 'exigeant';

export interface OpeningVariation {
  name: string;
  /** Coups SAN de la ligne principale, dans l'ordre. */
  moves: string[];
  /** Idee de la variante, une phrase. */
  idea: string;
}

export interface OpeningEntry {
  id: string;
  name: string;
  side: OpeningSide;
  style: OpeningStyle;
  difficulty: OpeningDifficulty;
  /** Objectif principal, une phrase courte. */
  goal: string;
  variations: OpeningVariation[];
  /** Erreurs frequentes des debutants dans cette ouverture. */
  commonMistakes: string[];
}

export interface BookLookupResult {
  /** Coups SAN theoriques jouables dans la position courante. */
  moves: string[];
  /** Nom de la variante la plus proche. */
  variation: string | null;
  /** Idee associee. */
  idea: string | null;
  /** true si la position appartient encore au repertoire. */
  inBook: boolean;
}

/* ------------------------------------------------------------------ */
/* Partie                                                              */
/* ------------------------------------------------------------------ */

export type GameResult = 'win' | 'loss' | 'draw';
export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold'
  | 'fifty_moves'
  | 'resignation'
  | 'agreement';

export interface MoveRecord {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  color: Color;
  /** Renseigne uniquement pour les coups du joueur. */
  feedback: CoachFeedback | null;
  /** Evaluation apres le coup, du point de vue des blancs (centipions). */
  evalAfterCp: number | null;
  mateAfter: number | null;
}

export interface GameSummary {
  id: string;
  date: number;
  playerColor: Color;
  opponentElo: number;
  result: GameResult;
  reason: GameEndReason;
  openingId: string | null;
  openingName: string | null;
  moveCount: number;
  /** Perte moyenne en centipions sur les coups du joueur. */
  averageCpLoss: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  /** Nombre de fois ou le joueur a laisse une piece en prise. */
  hangingPieces: number;
  /** Tactiques adverses manquees. */
  missedTactics: number;
  /** Numero du coup ou le joueur a roque, null sinon. */
  castledOnMove: number | null;
  /** Erreurs commises pendant les 10 premiers coups. */
  openingMistakes: number;
  /** Evaluation apres 10 coups, du point de vue du joueur (centipions). */
  evalAfterTenMoves: number | null;
}

/* ------------------------------------------------------------------ */
/* Reglages                                                            */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'light' | 'dark' | 'system';

/** Niveau d'aide accorde pour le prochain coup. */
export type NextMoveHelp = 'plan' | 'on_demand' | 'always';

export interface Settings {
  level: LevelId | 'custom';
  customElo: number;
  coachLevel: CoachLevel;
  analysisSpeed: AnalysisSpeed;
  showEvalBar: boolean;
  showEvalValue: boolean;
  showLegalMoves: boolean;
  showCoach: boolean;
  /** Affiche le tableau de lecture de position. */
  showPositionDashboard: boolean;
  /** Politique d'affichage du meilleur coup. */
  nextMoveHelp: NextMoveHelp;
  sound: boolean;
  boardOrientation: 'auto' | 'white' | 'black';
  confirmResign: boolean;
  allowUndo: boolean;
  theme: ThemeMode;
  reduceAnimations: boolean;
}

/* ------------------------------------------------------------------ */
/* Progression                                                         */
/* ------------------------------------------------------------------ */

export interface OpeningStat {
  openingId: string;
  openingName: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Somme des erreurs d'ouverture, pour calculer une moyenne. */
  totalOpeningMistakes: number;
  /** Somme des evaluations apres 10 coups (centipions, point de vue joueur). */
  totalEvalAfterTen: number;
  evalSamples: number;
  /** Appreciation declaree par le joueur. */
  preference: 'like' | 'neutral' | 'dislike' | null;
  /** Style ressenti de la partie obtenue. */
  style: OpeningStyle | null;
}

export interface ProgressionState {
  games: GameSummary[];
  openings: Record<string, OpeningStat>;
  /** Identifiant de la priorite d'entrainement courante. */
  currentPriority: string | null;
}

export interface TrainingPriority {
  id: string;
  text: string;
}

export interface EstimatedLevel {
  /** Niveau estime dans l'application (pas un Elo officiel). */
  value: number;
  /** Confiance 0-1, basee sur le nombre de parties. */
  confidence: number;
  /** Nombre de parties prises en compte. */
  sample: number;
}
