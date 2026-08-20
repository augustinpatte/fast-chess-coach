import type { AnalysisRequest, AnalysisResult, EngineLine, EngineStatus } from '@/types';
import { isReadyOk, isUciOk, parseBestMove, parseInfoLine } from './uci';

/** Erreur levee lorsqu'une analyse est annulee par une analyse plus recente. */
export class AnalysisCancelledError extends Error {
  constructor() {
    super('Analyse annulee');
    this.name = 'AnalysisCancelledError';
  }
}

/** Erreur levee lorsque le moteur ne repond pas dans le delai imparti. */
export class EngineTimeoutError extends Error {
  constructor(message = 'Le moteur ne repond pas') {
    super(message);
    this.name = 'EngineTimeoutError';
  }
}

/** Options UCI detectees a l'initialisation. */
export interface EngineCapabilities {
  supportsLimitStrength: boolean;
  supportsSkillLevel: boolean;
  eloMin: number;
  eloMax: number;
}

export interface EngineOptions {
  threads: number;
  hashMb: number;
}

interface PendingSearch {
  id: number;
  request: AnalysisRequest;
  lines: Map<number, EngineLine>;
  maxDepth: number;
  startedAt: number;
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
}

/** Fabrique de Worker, injectable pour les tests. */
export type WorkerFactory = () => Promise<Worker>;

const DEFAULT_OPTIONS: EngineOptions = { threads: 1, hashMb: 32 };

/**
 * Service de communication UCI avec Stockfish.
 *
 * Garanties :
 *  - une seule instance de Worker (voir `engineInstance.ts`) ;
 *  - une seule recherche active a la fois ;
 *  - toute recherche possede un identifiant : une reponse tardive appartenant
 *    a une recherche annulee est ignoree ;
 *  - une nouvelle analyse interrompt immediatement la precedente (`stop`).
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private status: EngineStatus = 'idle';
  private initPromise: Promise<void> | null = null;
  private search: PendingSearch | null = null;
  private searchCounter = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readyResolvers: Array<() => void> = [];
  private uciOkResolvers: Array<() => void> = [];
  private lastError: string | null = null;
  private statusListeners = new Set<(status: EngineStatus) => void>();

  private capabilities: EngineCapabilities = {
    supportsLimitStrength: false,
    supportsSkillLevel: false,
    eloMin: 1320,
    eloMax: 3190,
  };

  /** Derniers reglages de force appliques, pour eviter des setoption inutiles. */
  private appliedStrength = '';
  private appliedMultiPV = -1;

  constructor(
    private readonly createWorker: WorkerFactory,
    private readonly options: EngineOptions = DEFAULT_OPTIONS,
  ) {}

  getStatus(): EngineStatus {
    return this.status;
  }

  getCapabilities(): EngineCapabilities {
    return { ...this.capabilities };
  }

  getLastError(): string | null {
    return this.lastError;
  }

  onStatusChange(listener: (status: EngineStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  /** Initialise le Worker et joue la sequence UCI. Idempotent. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((error: unknown) => {
        this.initPromise = null;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.setStatus('error');
        throw error;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.setStatus('loading');
    const worker = await this.createWorker();
    this.worker = worker;
    worker.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data === 'string') this.handleLine(data);
    };
    worker.onerror = (event: ErrorEvent) => {
      this.lastError = event.message || 'Erreur du Worker Stockfish';
      this.setStatus('error');
      this.failCurrentSearch(new Error(this.lastError));
    };

    this.send('uci');
    await this.waitFor(this.uciOkResolvers, 20000, 'uciok');

    this.send(`setoption name Threads value ${this.options.threads}`);
    this.send(`setoption name Hash value ${this.options.hashMb}`);
    this.send('setoption name Ponder value false');
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor(this.readyResolvers, 20000, 'readyok');
    this.setStatus('ready');
  }

  private waitFor(bucket: Array<() => void>, timeoutMs: number, what: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = bucket.indexOf(onDone);
        if (index >= 0) bucket.splice(index, 1);
        reject(new EngineTimeoutError(`Stockfish : ${what} non recu`));
      }, timeoutMs);
      const onDone = (): void => {
        clearTimeout(timer);
        resolve();
      };
      bucket.push(onDone);
    });
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  /** Traite une ligne UCI recue du Worker. */
  private handleLine(line: string): void {
    if (isUciOk(line)) {
      const resolvers = this.uciOkResolvers.splice(0);
      for (const r of resolvers) r();
      return;
    }
    if (isReadyOk(line)) {
      const resolvers = this.readyResolvers.splice(0);
      for (const r of resolvers) r();
      return;
    }
    if (line.startsWith('option name ')) {
      this.readOption(line);
      return;
    }

    const search = this.search;
    if (!search) return;

    if (line.startsWith('info')) {
      const info = parseInfoLine(line);
      if (info) {
        search.lines.set(info.multipv, info);
        if (info.depth > search.maxDepth) search.maxDepth = info.depth;
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      this.finishSearch(parseBestMove(line));
    }
  }

  /** Lit les capacites annoncees par le moteur (`option name ...`). */
  private readOption(line: string): void {
    if (line.startsWith('option name UCI_LimitStrength')) {
      this.capabilities.supportsLimitStrength = true;
    } else if (line.startsWith('option name Skill Level')) {
      this.capabilities.supportsSkillLevel = true;
    } else if (line.startsWith('option name UCI_Elo')) {
      const min = /\bmin (-?\d+)/.exec(line);
      const max = /\bmax (-?\d+)/.exec(line);
      if (min) this.capabilities.eloMin = Number(min[1]);
      if (max) this.capabilities.eloMax = Number(max[1]);
    }
  }

  private finishSearch(bestMove: string | null): void {
    const search = this.search;
    if (!search) return;
    this.search = null;
    if (search.timer) clearTimeout(search.timer);
    this.setStatus('ready');

    if (search.cancelled) {
      search.reject(new AnalysisCancelledError());
      return;
    }

    const lines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv);
    search.resolve({
      fen: search.request.fen,
      bestMove,
      lines,
      depth: search.maxDepth,
      elapsedMs: Date.now() - search.startedAt,
    });
  }

  private failCurrentSearch(error: Error): void {
    const search = this.search;
    if (!search) return;
    this.search = null;
    if (search.timer) clearTimeout(search.timer);
    search.reject(error);
  }

  /**
   * Applique les reglages de force. Les setoption ne sont envoyes que si les
   * valeurs ont change, pour ne pas relancer inutilement le moteur.
   */
  async applyStrength(strength: {
    limitStrength: boolean;
    elo: number;
    skillLevel: number;
  }): Promise<void> {
    await this.init();
    const key = `${strength.limitStrength}|${strength.elo}|${strength.skillLevel}`;
    if (key === this.appliedStrength) return;
    this.appliedStrength = key;

    if (this.capabilities.supportsSkillLevel) {
      const skill = Math.max(0, Math.min(20, Math.round(strength.skillLevel)));
      this.send(`setoption name Skill Level value ${skill}`);
    }
    if (this.capabilities.supportsLimitStrength) {
      this.send(`setoption name UCI_LimitStrength value ${strength.limitStrength}`);
      if (strength.limitStrength) {
        const elo = Math.max(
          this.capabilities.eloMin,
          Math.min(this.capabilities.eloMax, Math.round(strength.elo)),
        );
        this.send(`setoption name UCI_Elo value ${elo}`);
      }
    }
  }

  /** Signale au moteur qu'une nouvelle partie commence (vide ses tables). */
  async newGame(): Promise<void> {
    await this.init();
    await this.cancelCurrentSearch();
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor(this.readyResolvers, 10000, 'readyok');
  }

  /** Interrompt la recherche en cours, s'il y en a une. */
  private async cancelCurrentSearch(): Promise<void> {
    if (!this.search) return;
    this.search.cancelled = true;
    this.send('stop');
  }

  /**
   * Lance une analyse. Toute analyse precedente est immediatement annulee.
   * Les analyses sont serialisees : le moteur ne traite qu'une recherche.
   */
  analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    void this.cancelCurrentSearch();
    const run = this.queue.then(
      () => this.runSearch(request),
      () => this.runSearch(request),
    );
    // La file ne doit jamais rester rejetee.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runSearch(request: AnalysisRequest): Promise<AnalysisResult> {
    await this.init();

    const multiPV = Math.max(1, Math.min(8, request.multiPV));
    if (multiPV !== this.appliedMultiPV) {
      this.send(`setoption name MultiPV value ${multiPV}`);
      this.appliedMultiPV = multiPV;
    }

    this.searchCounter += 1;
    const id = this.searchCounter;

    return new Promise<AnalysisResult>((resolve, reject) => {
      const budget = request.movetime ?? 400;
      const search: PendingSearch = {
        id,
        request,
        lines: new Map(),
        maxDepth: 0,
        startedAt: Date.now(),
        cancelled: false,
        timer: null,
        resolve,
        reject,
      };
      // Filet de securite : si `bestmove` n'arrive jamais, on ne bloque pas la partie.
      search.timer = setTimeout(() => {
        if (this.search?.id === id) {
          this.send('stop');
          setTimeout(() => {
            if (this.search?.id === id) {
              this.failCurrentSearch(new EngineTimeoutError());
              this.setStatus('ready');
            }
          }, 1500);
        }
      }, budget + 6000);

      this.search = search;
      this.setStatus('searching');
      this.send(`position fen ${request.fen}`);
      const go: string[] = ['go'];
      if (request.depth) go.push(`depth ${request.depth}`);
      if (request.movetime) go.push(`movetime ${request.movetime}`);
      if (go.length === 1) go.push('movetime 400');
      this.send(go.join(' '));
    });
  }

  /** Arrete la recherche courante sans detruire le moteur. */
  stop(): void {
    if (this.search) {
      this.search.cancelled = true;
      this.send('stop');
    }
  }

  /** Termine proprement le Worker et libere la memoire. */
  dispose(): void {
    this.failCurrentSearch(new AnalysisCancelledError());
    if (this.worker) {
      try {
        this.send('quit');
      } catch {
        /* le worker peut deja etre mort */
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.initPromise = null;
    this.appliedStrength = '';
    this.appliedMultiPV = -1;
    this.setStatus('idle');
  }
}
