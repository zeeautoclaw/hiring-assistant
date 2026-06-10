import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeWeights, passesThreshold, weightedTotal } from "../../src/aggregate.js";
import { DIMENSIONS, type DimScore, type Dimension } from "../../src/types.js";

function card(scores: Partial<Record<Dimension, number>>, note: DimScore["note"] = "ok"): DimScore[] {
  return DIMENSIONS.map((d) => ({
    dimension: d,
    score: scores[d] ?? 0,
    evidence: [],
    anchor: "",
    justification: "",
    note,
  }));
}

test("normalizeWeights rescales to sum 1", () => {
  const w = normalizeWeights({ jd_fit: 2, ai_judgment: 2, impact: 0, complexity: 0, ownership: 0, reasoning: 0, pedigree: 0 }, DIMENSIONS);
  const sum = DIMENSIONS.reduce((a, d) => a + w[d], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(w.jd_fit - 0.5) < 1e-9);
});

test("all-zero weights fall back to equal weighting", () => {
  const w = normalizeWeights(Object.fromEntries(DIMENSIONS.map((d) => [d, 0])), DIMENSIONS);
  assert.ok(Math.abs(w.jd_fit - 1 / DIMENSIONS.length) < 1e-9);
});

test("uniform 10s yield a total of 10 regardless of weights", () => {
  const w = normalizeWeights({ jd_fit: 1, ai_judgment: 3, impact: 1, complexity: 1, ownership: 1, reasoning: 1, pedigree: 1 }, DIMENSIONS);
  const total = weightedTotal(card(Object.fromEntries(DIMENSIONS.map((d) => [d, 10]))), w);
  assert.equal(total, 10);
});

test("weighting actually shifts the total", () => {
  // jd_fit=10, everything else=0. Heavier jd_fit weight → higher total.
  const scores = card({ jd_fit: 10 });
  const light = weightedTotal(scores, normalizeWeights(Object.fromEntries(DIMENSIONS.map((d) => [d, 1])), DIMENSIONS));
  const heavy = weightedTotal(scores, normalizeWeights({ jd_fit: 10, ai_judgment: 1, impact: 1, complexity: 1, ownership: 1, reasoning: 1, pedigree: 1 }, DIMENSIONS));
  assert.ok(heavy > light, `expected heavy(${heavy}) > light(${light})`);
});

test("error dimensions are excluded, not treated as zero", () => {
  const w = normalizeWeights(Object.fromEntries(DIMENSIONS.map((d) => [d, 1])), DIMENSIONS);
  const scores = card(Object.fromEntries(DIMENSIONS.map((d) => [d, 8])));
  scores[0]!.note = "error"; // jd_fit failed
  scores[0]!.score = 0;
  // If error were treated as 0 the total would drop below 8; exclusion keeps it 8.
  assert.equal(weightedTotal(scores, w), 8);
});

test("recency modifier scales the total and clamps to [0,10]", () => {
  const w = normalizeWeights(Object.fromEntries(DIMENSIONS.map((d) => [d, 1])), DIMENSIONS);
  const scores = card(Object.fromEntries(DIMENSIONS.map((d) => [d, 10])));
  assert.equal(weightedTotal(scores, w, 0.9), 9);
  assert.equal(weightedTotal(scores, w, 2), 10); // clamped
});

test("threshold gate is inclusive", () => {
  assert.equal(passesThreshold(6, 6), true);
  assert.equal(passesThreshold(5.99, 6), false);
});
