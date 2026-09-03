// localStorage persistence, every access guarded (private mode, quotas, no storage).

export interface BestRecord {
  score: number;
  seed: number;
  date: string;
}

export interface RunSummary {
  seed: number;
  score: number;
  ticks: number;
  distance: number;
  topSpeed: number;
  date: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'canyon.';

export class Storage {
  private readonly store: KeyValueStore | null;
  constructor(store: KeyValueStore | null) {
    this.store = store;
  }

  private read<T>(key: string): T | null {
    try {
      const raw = this.store?.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.store?.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable or full */
    }
  }

  best(): BestRecord | null {
    return this.read<BestRecord>('best');
  }

  bestForSeed(seed: number): BestRecord | null {
    return this.read<BestRecord>(`best.${seed >>> 0}`);
  }

  lastSeed(): number | null {
    return this.read<number>('lastSeed');
  }

  setLastSeed(seed: number): void {
    this.write('lastSeed', seed >>> 0);
  }

  runs(): RunSummary[] {
    return this.read<RunSummary[]>('runs') ?? [];
  }

  /** Records a finished run; returns which bests it beat. */
  recordRun(run: RunSummary): { newBest: boolean; newSeedBest: boolean } {
    const record: BestRecord = { score: run.score, seed: run.seed, date: run.date };
    const best = this.best();
    const seedBest = this.bestForSeed(run.seed);
    const newBest = !best || run.score > best.score;
    const newSeedBest = !seedBest || run.score > seedBest.score;
    if (newBest) this.write('best', record);
    if (newSeedBest) this.write(`best.${run.seed >>> 0}`, record);
    this.write('runs', [run, ...this.runs()].slice(0, 10));
    return { newBest, newSeedBest };
  }
}

export function browserStorage(): Storage {
  try {
    return new Storage(typeof localStorage === 'undefined' ? null : localStorage);
  } catch {
    return new Storage(null);
  }
}
