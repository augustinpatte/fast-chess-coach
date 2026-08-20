# Licences des dépendances

Généré par `npm run licenses` à partir de `node_modules`.

## Application

**Fast Chess Coach** — licence MIT.

## Moteur d'échecs

Le moteur **Stockfish** (build WebAssembly `stockfish.js` de Chess.com / nmrugg)
est distribué sous **GPL v3**. Il est chargé tel quel, sans modification, dans un
Web Worker depuis `public/engine/`. Le texte complet de la licence est fourni
dans `node_modules/stockfish/Copying.txt`.

> Conséquence pratique : si tu redistribues une version compilée de cette
> application, tu dois respecter les obligations de la GPL v3 pour la partie
> Stockfish (mise à disposition des sources du moteur).

Les pièces d'échecs affichées proviennent de `react-chessboard` (jeu Cburnett,
domaine public / CC BY-SA 3.0 selon la source d'origine).

## Dépendances d'exécution

| Paquet             | Version | Licence      |
| ------------------ | ------- | ------------ |
| `chess.js`         | 1.4.0   | BSD-2-Clause |
| `react`            | 19.2.8  | MIT          |
| `react-chessboard` | 5.11.0  | MIT          |
| `react-dom`        | 19.2.8  | MIT          |
| `stockfish`        | 17.1.0  | GPL          |

## Dépendances de développement

| Paquet                        | Version | Licence      |
| ----------------------------- | ------- | ------------ |
| `@eslint/js`                  | 10.0.1  | MIT          |
| `@testing-library/jest-dom`   | 7.0.0   | MIT          |
| `@testing-library/react`      | 16.3.2  | MIT          |
| `@testing-library/user-event` | 14.6.1  | MIT          |
| `@types/node`                 | 26.1.2  | MIT          |
| `@types/react`                | 19.2.18 | MIT          |
| `@types/react-dom`            | 19.2.4  | MIT          |
| `@vitejs/plugin-react`        | 6.0.5   | MIT          |
| `@vitest/coverage-v8`         | 4.1.10  | MIT          |
| `eslint`                      | 10.8.0  | MIT          |
| `eslint-config-prettier`      | 10.1.8  | MIT          |
| `eslint-plugin-react-hooks`   | 7.1.1   | MIT          |
| `eslint-plugin-react-refresh` | 0.5.3   | MIT          |
| `globals`                     | 17.8.0  | MIT          |
| `jsdom`                       | 30.0.1  | MIT          |
| `license-checker-rseidelsohn` | 5.0.1   | BSD-3-Clause |
| `prettier`                    | 3.9.6   | MIT          |
| `typescript`                  | 6.0.3   | Apache-2.0   |
| `typescript-eslint`           | 8.65.0  | MIT          |
| `vite`                        | 8.2.0   | MIT          |
| `vitest`                      | 4.1.10  | MIT          |
