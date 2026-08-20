# Fast Chess Coach

Application locale d'apprentissage des échecs : jouer vite contre Stockfish, comprendre
chaque coup en **deux lignes maximum**, et progresser de 800 vers 1500 Elo.

Tout fonctionne **hors ligne** après l'installation : pas de compte, pas d'abonnement,
pas d'API externe, pas de backend, aucun modèle de langage. Les parties, les réglages et
la progression restent dans le `localStorage` du navigateur.

---

## 1. Objectif

Après chaque coup du joueur, l'application affiche :

- une **classification** du coup (Meilleur coup, Excellent, Bon, Jouable, Imprécision,
  Erreur, Grosse erreur, Mat manqué) ;
- une **explication de deux phrases et deux lignes maximum**, concrète (pièce, case,
  menace, principe) ;
- un bouton facultatif **« Voir plus »** avec le meilleur coup, une variante de 3-4
  demi-coups et le concept concerné.

**Avant** de jouer, un panneau séparé donne le meilleur coup et une phrase qui explique
pourquoi c'est le meilleur, sans avoir à jouer puis annuler. Il se règle dans
*Réglages → Aide au prochain coup* (désactivée, sur demande, ou toujours affichée) et
fonctionne en partie libre, en test d'ouverture et à l'entraînement d'ouverture, où le
coup montré est celui du répertoire.

Exemples réellement produits par l'application :

```
Meilleur coup   Bon coup au centre : e4 ouvre tes pièces. Vérifie tes pièces en prise.
Imprécision     Ton pion e4 est en prise, sans défenseur. Cc3 était plus actif.
Grosse erreur   Ton cavalier d4 n’est plus défendu : Cxd4 le gagne. Fe3 était plus solide.
```

Les explications ne sont **jamais** générées par un modèle de langage : elles viennent de
Stockfish, de chess.js et de règles déterministes.

---

## 2. Stack

| Rôle             | Choix                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Interface        | React 19 + TypeScript strict                                     |
| Build / dev      | Vite 8                                                           |
| Règles d'échecs  | `chess.js` 1.4                                                   |
| Échiquier        | `react-chessboard` 5 (pièces SVG intégrées, aucun asset distant) |
| Moteur           | Stockfish 17.1 WebAssembly, build **lite-single** (mono-thread)  |
| Isolation moteur | Web Worker classique                                             |
| Stockage         | `localStorage`                                                   |
| Tests            | Vitest + React Testing Library (jsdom)                           |
| Qualité          | ESLint 10 (+ règles React Compiler), Prettier                    |

Pas d'Electron ni de Tauri dans cette version.

---

## 3. Architecture

```
src/
  app/                Racine et écrans
    App.tsx           Aiguillage entre les écrans (aucune logique métier)
    screens/          SetupScreen, GameScreen, OpeningsScreen, ProgressScreen, TrainerScreen
  components/         Board, EvalBar, MoveList, CoachPanel, GameControls, dialogues…
  chess/              Règles et lecture de position (chess.js)
    rules.ts          Coups légaux, UCI <-> SAN, fin de partie
    fen.ts            Utilitaires FEN (validation, trait, numéro de coup)
    positionFeatures.ts  Pièces en prise, fourchettes, clouages, développement, finale
    pieces.ts         Valeurs, noms français, notation algébrique française
  engine/             Communication avec Stockfish
    uci.ts            Analyse pure des lignes UCI (info / bestmove / score)
    StockfishEngine.ts Service UCI : init, isready, position, go, stop, annulation
    engineInstance.ts Instance unique (un seul Worker pour toute l'application)
    analysisService.ts Analyse + cache + bascule de force du moteur
    analysisCache.ts  Cache LRU borné (200 positions)
    difficulty.ts     Niveaux, adaptateur de force, choix du coup de l'IA, vitesses
  coaching/           Génération des explications
    classification.ts Perte en centipions -> qualité du coup
    diagnostics.ts    18 diagnostics ordonnés par priorité
    phrases.ts        TOUS les modèles de phrases (centralisés ici)
    coach.ts          Assemblage du retour final
    format.ts         Garde-fou : 2 phrases, 2 lignes, 110 caractères
  openings/           Répertoire local
    repertoire.json   14 ouvertures, 48 variantes
    book.ts           Index de positions, sortie de théorie, exercices
  progression/        store.ts, priority.ts, estimate.ts
  storage/            localStore.ts (accès tolérant au localStorage)
  settings/           defaults.ts, SettingsProvider.tsx, settingsContext.ts
  hooks/              useGameController (boucle de partie), useSettings, useLatest
  workers/            createEngineWorker.ts (fabrique du Web Worker)
  types/              Types partagés
  utils/              sound.ts (Web Audio, aucun fichier son)
  tests/              setup.ts, positions.ts (positions de test partagées)
```

Séparation stricte : `App.tsx` ne contient aucune logique d'échecs, de moteur ni de
coaching. Toute la boucle de partie vit dans `hooks/useGameController.ts`.

---

## 4. Installation

```bash
npm install
```

Le script `postinstall` copie automatiquement le binaire Stockfish
(`stockfish-17.1-lite-single-*.js` + `.wasm`, ~7 Mo) de `node_modules/stockfish` vers
`public/engine/`, avec un `manifest.json` qui évite de coder en dur le nom haché.

Pour le refaire manuellement :

```bash
npm run engine:setup
```

`public/engine/` est ignoré par git : le moteur est régénéré à chaque installation.

---

## 5. Lancement

```bash
npm run dev          # http://localhost:5173
```

## 6. Build et prévisualisation

```bash
npm run build        # tsc -b puis vite build  -> dist/
npm run preview      # sert dist/ sur http://localhost:4173
```

## 7. Tests et qualité

```bash
npm test             # Vitest (144 tests)
npm run test:watch
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm run validate     # lint + build + tests
npm run licenses     # régénère LICENSES.md
```

---

## 8. Fonctionnement de Stockfish

- **Un seul Worker** pour toute l'application (`engineInstance.ts`), créé à la demande et
  fermé sur `pagehide`.
- Options par défaut : `Threads 1`, `Hash 32`, `Ponder false`.
- **Une seule recherche active** : toute nouvelle analyse envoie `stop` sur la précédente,
  et chaque recherche porte un identifiant — une réponse tardive ne peut jamais écraser une
  analyse plus récente (`AnalysisCancelledError`).
- Chaque recherche a un **délai de sécurité** : si `bestmove` n'arrive pas, la partie n'est
  jamais bloquée.
- Les capacités du moteur sont lues au démarrage (`option name UCI_LimitStrength`,
  `UCI_Elo min/max`) au lieu d'être supposées.
- **Cache LRU** de 200 positions, clé = FEN + MultiPV + profondeur + temps + force. Videz-le
  depuis les réglages.
- L'analyse pédagogique tourne **toujours à pleine force** (`Skill Level 20`,
  `UCI_LimitStrength false`), même quand l'adversaire joue à 600 Elo : seule la recherche
  qui produit le coup de l'IA est bridée.

### Vitesses d'analyse

| Vitesse             | Temps coach | Profondeur | Usage                         |
| ------------------- | ----------- | ---------- | ----------------------------- |
| **Rapide** (défaut) | 220 ms      | 10         | parties rapides, 800-1500 Elo |
| Normale             | 450 ms      | 14         | analyse plus sûre             |
| Précise             | 900 ms      | 18         | vérification d'une position   |

---

## 9. Système de niveaux

| Niveau  | Skill | Profondeur | MultiPV | Erreur volontaire | Perte max tolérée |
| ------- | ----- | ---------- | ------- | ----------------- | ----------------- |
| 600     | 0     | 2          | 5       | 45 %              | 330 cp            |
| 800     | 1     | 3          | 5       | 33 %              | 280 cp            |
| 1000    | 3     | 4          | 4       | 26 %              | 240 cp            |
| 1200    | 5     | 5          | 4       | 19 %              | 190 cp            |
| 1400    | 8     | 8          | 3       | 12 %              | 150 cp            |
| 1500    | 10    | 9          | 3       | 9 %               | 130 cp            |
| 1700    | 13    | 10         | 2       | 5 %               | 100 cp            |
| 1900    | 16    | 12         | 2       | 2 %               | 70 cp             |
| Maximum | 20    | 18         | 1       | 0 %               | —                 |

Un mode **personnalisé** (400-3000) interpole entre les deux niveaux encadrants.

`UCI_LimitStrength` / `UCI_Elo` ne sont utilisés qu'à partir de 1400, car Stockfish 17.1
refuse un Elo inférieur à 1320. En dessous, la faiblesse est **simulée** :

1. `Skill Level` bas ;
2. profondeur et temps réduits ;
3. tirage pondéré (softmax) parmi les lignes MultiPV ;
4. erreurs occasionnelles.

Garde-fous, appliqués à tous les niveaux :

- jamais un coup perdant plus que `maxLossCp` (pas de dame donnée sans raison) ;
- jamais deux erreurs volontaires consécutives ;
- un mat forcé disponible est toujours joué ;
- jamais un coup qui offre un mat à l'adversaire.

**Variété entre les parties** : pendant les 8 premiers demi-coups, le tirage est plus large
mais borné à 60 cp de perte — les parties diffèrent sans que le jeu s'affaiblisse. Le niveau
maximal reste parfaitement déterministe.

---

## 10. Système d'ouvertures

Répertoire local (`src/openings/repertoire.json`) : **14 ouvertures, 48 variantes**, 10 à 12
demi-coups au maximum. Volontairement petit : mémoriser des idées, pas une base de données.

- **Blancs** : Italienne, Écossaise, Système de Londres, Gambit dame, Espagnole, Anglaise.
- **Noirs contre 1.e4** : 1…e5, Caro-Kann, Française, Sicilienne.
- **Noirs contre 1.d4** : Gambit dame refusé, Slave, Est-indienne, Nimzo-indienne.

Chaque ouverture porte un nom, un style, une difficulté, un objectif en une phrase et les
erreurs fréquentes de débutant.

Modes :

- **Partie libre** — le joueur joue librement. S'il a les noirs, l'IA suit une ouverture
  crédible et variée.
- **Tester une ouverture** — l'application guide les premiers coups, accepte **plusieurs**
  coups théoriques dans une même position, et signale brièvement la sortie de théorie
  (« Tu quittes la théorie : Cf3 est plus naturel. ») avant de laisser la partie continuer.
- **Entraîner une ouverture** — exercices position par position, plusieurs bonnes réponses
  acceptées, correction en deux lignes.

L'IA ne suit le répertoire que dans le mode ouverture ou lorsqu'elle a les blancs, et sur une
profondeur limitée par son niveau (4 demi-coups à 600 Elo, 12 à partir de 1700) : un
adversaire faible ne joue pas dix coups de théorie parfaite.

**Mes ouvertures** compare les ouvertures jouées (parties, résultats, erreurs d'ouverture
moyennes, évaluation moyenne après 10 coups, appréciation personnelle) et refuse
explicitement de conclure avant **5 parties**.

---

## 11. Stockage local

| Clé                  | Contenu                                                  |
| -------------------- | -------------------------------------------------------- |
| `fcc.settings.v1`    | Réglages (niveau, pédagogie, vitesse, affichage, thème…) |
| `fcc.progression.v1` | 100 dernières parties + statistiques par ouverture       |

- Lecture tolérante : une valeur corrompue ou d'une version antérieure retombe sur les
  valeurs par défaut sans casser l'application.
- Bornage : 100 parties maximum, cache d'analyses de 200 positions maximum.
- Les réglages affichent l'espace occupé et permettent de **tout effacer**.
- Aucune donnée ne quitte la machine.

La page **Progression** affiche les parties, le niveau moyen affronté, la perte moyenne en
centipions, les pièces laissées en prise, les tactiques manquées, les roques tardifs, les
erreurs d'ouverture, la série récente, **une seule priorité d'entraînement** et un
« Niveau estimé dans l'application » accompagné de la mention :

> Cette estimation n'est pas un classement officiel.

---

## 12. Accessibilité

- Navigation clavier sur tous les contrôles, focus visible (contour 3 px).
- Saisie d'un coup **au clavier** en notation algébrique française (`e4`, `Cf3`, `O-O`).
- Zone du coach en `aria-live="polite"`, barre d'évaluation en `role="meter"`.
- Les coups légaux sont indiqués par des points/cercles **et** l'infobulle de la case ; les
  qualités de coup ont un libellé texte en plus de la couleur.
- Cibles tactiles de 40 px minimum, thème clair/sombre/système, désactivation des animations
  (réglage ou `prefers-reduced-motion`).

---

## 13. Limites connues

- Le moteur pèse ~7 Mo : le premier chargement prend environ 0,6 s en local, puis il est
  mis en cache par le navigateur.
- L'estimation de niveau est **indicative** : elle n'a rien d'un Elo officiel et reste tirée
  vers 800 tant que peu de parties ont été jouées.
- La détection des pièces en prise utilise un test d'échange **simplifié** (pas un SEE
  complet) : elle peut manquer une ressource tactique profonde. Les diagnostics matériels
  sont donc supprimés quand le moteur valide le coup (perte < 50 cp).
- `hasCastled` est déduit de la position du roi, pas de l'historique complet.
- Sur un écran de moins de 360 px de large, une explication très longue peut être tronquée
  par le garde-fou d'affichage (deux lignes maximum).
- Un seul thread : sur les positions très complexes, le mode « Précise » reste plus lent
  qu'un Stockfish multi-thread. C'est un choix assumé (pas de `SharedArrayBuffer`, donc
  aucun en-tête COOP/COEP nécessaire).
- La reprise d'une partie interrompue n'est pas conservée : seul le résumé est enregistré.

---

## 14. Licences

- **Fast Chess Coach** : MIT.
- **Stockfish** (WebAssembly) : **GPL v3** — chargé tel quel dans un Web Worker.
- Détail complet des dépendances : [`LICENSES.md`](./LICENSES.md), régénérable avec
  `npm run licenses`.
