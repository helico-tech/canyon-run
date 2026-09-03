// Difficulty by segment index: literal tables (no exp at runtime, ADR 0002), applied to
// the biome parameters in force. Values beyond the table repeat the last entry.

export const WIDTH_FACTOR = [1.0, 0.95, 0.9, 0.85, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6];
export const FEATURE_FACTOR = [0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
export const ROUGHNESS_FACTOR = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
/** Adversary station probability × and motion speed ÷ (period divisor) per segment. */
export const ADVERSARY_FACTOR = [0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
export const ADVERSARY_SPEED = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
/** Feature-free zone on each side of a segment boundary, where the gate stands. */
export const CLEAR_HALF = 75;

export function tableAt(table: readonly number[], index: number): number {
  const i = index < 0 ? 0 : index >= table.length ? table.length - 1 : index;
  return table[i]!;
}
