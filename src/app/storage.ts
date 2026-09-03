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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isBest(v: unknown): v is BestRecord {
  return (
    isRecord(v) && isFiniteNumber(v.score) && isFiniteNumber(v.seed) && typeof v.date === 'string'
  );
}

function isRun(v: unknown): v is RunSummary {
  return (
    isRecord(v) &&
    isFiniteNumber(v.seed) &&
    isFiniteNumber(v.score) &&
    isFiniteNumber(v.ticks) &&
    isFiniteNumber(v.distance) &&
    isFiniteNumber(v.topSpeed) &&
    typeof v.date === 'string'
  );
}

export class Storage {
  private readonly store: KeyValueStore | null;
  constructor(store: KeyValueStore | null) {
    this.store = store;
  }

  /** Parses a stored value and returns it only when it has the expected shape. */
  private read<T>(key: string, isT: (v: unknown) => v is T): T | null {
    try {
      const raw = this.store?.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isT(parsed) ? parsed : null;
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
    return this.read('best', isBest);
  }

  bestForSeed(seed: number): BestRecord | null {
    return this.read(`best.${seed >>> 0}`, isBest);
  }

  lastSeed(): number | null {
    return this.read('lastSeed', isFiniteNumber);
  }

  setLastSeed(seed: number): void {
    this.write('lastSeed', seed >>> 0);
  }

  runs(): RunSummary[] {
    return this.read('runs', Array.isArray)?.filter(isRun) ?? [];
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
