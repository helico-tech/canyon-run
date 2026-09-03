// Pure planner for the resident slab ring (spec §6.4): which slabs to request,
// in which order, and which to evict. Testable without a worker.

export const SLABS_BEHIND = 1;
export const SLABS_AHEAD = 10;

export class SlabRing {
  private readonly requested = new Set<number>();
  private readonly done = new Set<number>();
  private current = Number.NaN;

  /** Slabs to request now, nearest ahead first, then the one behind. */
  setSlab(s: number): { request: number[]; cancelBelow: number | null; evictBelow: number } {
    const moved = s !== this.current;
    this.current = s;
    const low = s - SLABS_BEHIND;
    const request: number[] = [];
    for (let cz = s; cz <= s + SLABS_AHEAD; cz++) if (!this.requested.has(cz)) request.push(cz);
    for (let cz = s - SLABS_BEHIND; cz < s; cz++) if (!this.requested.has(cz)) request.push(cz);
    for (const cz of request) this.requested.add(cz);
    let cancelBelow: number | null = null;
    if (moved) {
      for (const cz of this.requested) if (cz < low) this.requested.delete(cz);
      for (const cz of this.done) if (cz < low) this.done.delete(cz);
      cancelBelow = low;
    }
    return { request, cancelBelow, evictBelow: low };
  }

  markDone(cz: number): void {
    if (this.requested.has(cz)) this.done.add(cz);
  }

  /** True when every requested slab in the window has been delivered. */
  get idle(): boolean {
    for (const cz of this.requested) if (!this.done.has(cz)) return false;
    return true;
  }

  get pending(): number {
    let n = 0;
    for (const cz of this.requested) if (!this.done.has(cz)) n++;
    return n;
  }

  get residentSlabs(): number {
    return this.done.size;
  }
}
