/**
 * Aggregation + gating (L4) — pure, deterministic, fully unit-tested.
 *
 * Turns the per-dimension scores into one 0–10 total via a weighted average,
 * applies an optional recency modifier, and decides pass/fail against the HR
 * threshold. No LLM here: same scores in → same total out, which is what makes
 * the pipeline reproducible above the model layer.
 */
import type { DimScore, Dimension } from "./types.js";

/** Normalize an arbitrary weight map to sum to 1 (defensive: a JD-derived map
 *  may not sum cleanly). If all weights are zero, fall back to equal weights. */
export function normalizeWeights(
  weights: Record<string, number>,
  dims: readonly Dimension[],
): Record<Dimension, number> {
  const present = dims.map((d) => Math.max(0, weights[d] ?? 0));
  const sum = present.reduce((a, b) => a + b, 0);
  const out = {} as Record<Dimension, number>;
  dims.forEach((d, i) => {
    out[d] = sum > 0 ? present[i]! / sum : 1 / dims.length;
  });
  return out;
}

/**
 * Weighted average of dimension scores, in [0,10]. `note: "error"` dimensions
 * are excluded from both numerator and denominator so a single failed axis does
 * not silently drag the candidate down — the weights of the surviving axes are
 * renormalized over what actually scored.
 */
export function weightedTotal(
  dimScores: DimScore[],
  weights: Record<Dimension, number>,
  recencyModifier = 1,
): number {
  let num = 0;
  let den = 0;
  for (const ds of dimScores) {
    if (ds.note === "error") continue;
    const w = weights[ds.dimension] ?? 0;
    num += w * ds.score;
    den += w;
  }
  if (den === 0) return 0;
  const base = num / den; // 0..10
  return round2(clamp(base * recencyModifier, 0, 10));
}

export function passesThreshold(total: number, threshold: number): boolean {
  return total >= threshold;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Round to 2 decimals — kills float noise and matches how a 0–10 score is shown. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
