// Fills a chunk grid through the wasm field (ADR 0009). Per row the JS side
// blends parameters, computes spines and gathers features exactly as fillGrid
// does; the wasm side evaluates the samples. Output is bit-identical to
// fillGrid, which the differential test proves.
import type { ChunkScratch } from '../terrain/chunk.ts';
import { FieldContext } from '../terrain/field.ts';
import type { Feature } from '../terrain/features.ts';
import { CELL_SIZE, CHUNK_SIZE, GRID_LENGTH, SAMPLES } from '../terrain/march.ts';
import { shellBound } from '../terrain/params.ts';
import type { Spine } from '../terrain/spine.ts';
import {
  FEATURE_CAPACITY,
  FEATURE_FLOATS,
  LAYOUT_VERSION,
  packParams,
  PARAM_COUNT,
  PARAM_SLOTS,
  ROW_FLOATS,
  SLOT_BA,
  SLOT_BB,
  SLOT_MIX,
  SLOT_PA,
  SLOT_PB,
  SPINE_FLOATS,
  SPINE_SLOTS,
} from '../terrain/wasmLayout.ts';

interface FieldExports {
  memory: WebAssembly.Memory;
  layout_version(): number;
  param_count(): number;
  grid_ptr(): number;
  params_ptr(): number;
  spines_ptr(): number;
  feats_ptr(list: number): number;
  row_ptr(): number;
  begin_chunk(ox: number, oy: number, oz: number): void;
  /** Fills row zi; returns the number of full evaluations in the row. */
  fill_row(zi: number): number;
}

export class WasmField {
  private readonly ex: FieldExports;
  readonly grid: Float64Array;
  private readonly params: Float64Array;
  private readonly spines: Float64Array;
  private readonly feats: [Float64Array, Float64Array];
  private readonly row: Float64Array;
  private ctx: FieldContext | null = null;
  private ctxSeed = -1;
  private ctxMode = -1;
  private readonly written: [Feature[] | null, Feature[] | null] = [null, null];
  private readonly writtenSeg: [number, number] = [-1, -1];

  constructor(instance: WebAssembly.Instance) {
    const ex = instance.exports as unknown as FieldExports;
    if (ex.layout_version() !== LAYOUT_VERSION) {
      throw new Error(`field.wasm layout ${ex.layout_version()} != ${LAYOUT_VERSION}`);
    }
    if (ex.param_count() !== PARAM_COUNT) {
      throw new Error(`field.wasm params ${ex.param_count()} != ${PARAM_COUNT}`);
    }
    this.ex = ex;
    const buf = ex.memory.buffer;
    this.grid = new Float64Array(buf, ex.grid_ptr(), GRID_LENGTH);
    this.params = new Float64Array(buf, ex.params_ptr(), PARAM_COUNT * PARAM_SLOTS);
    this.spines = new Float64Array(buf, ex.spines_ptr(), SPINE_FLOATS * SPINE_SLOTS);
    this.feats = [
      new Float64Array(buf, ex.feats_ptr(0), FEATURE_FLOATS * FEATURE_CAPACITY),
      new Float64Array(buf, ex.feats_ptr(1), FEATURE_FLOATS * FEATURE_CAPACITY),
    ];
    this.row = new Float64Array(buf, ex.row_ptr(), ROW_FLOATS);
  }

  /** Instantiates from bytes or a fetch; no streaming, so any MIME type will do. */
  static async load(source: BufferSource | Response | Promise<Response>): Promise<WasmField> {
    const bytes =
      source instanceof ArrayBuffer || ArrayBuffer.isView(source)
        ? (source as BufferSource)
        : await (await source).arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, {});
    return new WasmField(result.instance);
  }

  private writeSpine(slot: number, sp: Spine): void {
    const o = slot * SPINE_FLOATS;
    this.spines[o] = sp.cx;
    this.spines[o + 1] = sp.floorY;
    this.spines[o + 2] = sp.ceilY;
    this.spines[o + 3] = sp.coreY;
    this.spines[o + 4] = sp.hw;
  }

  private writeFeatures(list: number, feats: Feature[], seg: number): number {
    if (this.written[list] === feats && this.writtenSeg[list] === seg) return feats.length;
    if (feats.length > FEATURE_CAPACITY) throw new Error(`too many features: ${feats.length}`);
    const buf = this.feats[list]!;
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i]!;
      const o = i * FEATURE_FLOATS;
      buf[o] = f.kind;
      buf[o + 1] = f.x;
      buf[o + 2] = f.y;
      buf[o + 3] = f.z;
      buf[o + 4] = f.r;
      buf[o + 5] = f.big;
      buf[o + 6] = f.reach;
      buf[o + 7] = f.dx;
      buf[o + 8] = f.dy;
      buf[o + 9] = f.dz;
      buf[o + 10] = f.big2;
      buf[o + 11] = f.tint;
    }
    this.written[list] = feats;
    this.writtenSeg[list] = seg;
    return feats.length;
  }

  /** Same contract as fillGrid: fills `this.grid` for chunk (cx, cy, cz) and reports the stats. */
  fillGrid(seed: number, cx: number, cy: number, cz: number, s: ChunkScratch, mode = 0): void {
    if (!this.ctx || this.ctxSeed !== seed || this.ctxMode !== mode) {
      this.ctx = new FieldContext(seed, mode);
      this.ctxSeed = seed;
      this.ctxMode = mode;
      this.written[0] = this.written[1] = null;
    }
    const ctx = this.ctx;
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    ctx.setBox(ox, ox + CHUNK_SIZE, oz, oz + CHUNK_SIZE);
    this.written[0] = this.written[1] = null;
    this.ex.begin_chunk(ox, oy, oz);
    let full = 0;
    for (let z = 0; z < SAMPLES; z++) {
      const wz = oz + z * CELL_SIZE;
      ctx.at(wz);
      const { a, b, t, pa, pb, segA, segB } = ctx.blend;
      packParams(pa, this.params, SLOT_PA * PARAM_COUNT);
      packParams(a.params, this.params, SLOT_BA * PARAM_COUNT);
      this.writeSpine(0, ctx.spA);
      let nB = 0;
      if (t > 0) {
        packParams(pb, this.params, SLOT_PB * PARAM_COUNT);
        packParams(b.params, this.params, SLOT_BB * PARAM_COUNT);
        packParams(ctx.blend.params, this.params, SLOT_MIX * PARAM_COUNT);
        this.writeSpine(1, ctx.spB);
        this.writeSpine(2, ctx.spMix);
        nB = this.writeFeatures(1, ctx.featsB, segB);
      }
      const nA = this.writeFeatures(0, ctx.featsA, segA);
      this.row[0] = t;
      this.row[1] = Math.max(shellBound(pa), t > 0 ? shellBound(pb) : 0);
      this.row[2] = seed >>> 0;
      this.row[3] = nA;
      this.row[4] = nB;
      this.row[5] = a === b ? 1 : 0;
      full += this.ex.fill_row(z);
    }
    s.full = full;
    s.baseOnly = GRID_LENGTH - full;
  }
}
