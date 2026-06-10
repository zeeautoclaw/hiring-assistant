/**
 * Orchestrator. Wires the layers into one run and owns all concurrency, gating,
 * and failure handling. The model only ever produces validated DimScores and a
 * summary string; everything that decides outcomes (dedup, weighting, gate) is
 * deterministic code here and in dedup.ts / aggregate.ts.
 */
import { distillJd, scoreCandidate, writeSummary } from "./agents.js";
import { normalizeWeights, passesThreshold, weightedTotal } from "./aggregate.js";
import type { Ledger } from "./db.js";
import { checkDuplicate, normalizeEmail, normalizePhone } from "./dedup.js";
import { DIMENSIONS, type CandidateInput, type CandidateResult, type JDSpec } from "./types.js";

export interface RunOpts {
  rawJd: string;
  candidates: CandidateInput[];
  ledger: Ledger;
  threshold: number;
  now: number;
  concurrency?: number;
  model?: string;
  onEvent?: (e: Record<string, unknown>) => void;
}

export interface RunResult {
  spec: JDSpec;
  results: CandidateResult[];
}

export async function run(opts: RunOpts): Promise<RunResult> {
  const { rawJd, candidates, ledger, threshold, now } = opts;
  const model = opts.model ?? "sonnet";
  const emit = opts.onEvent ?? (() => {});

  emit({ type: "start", total: candidates.length });

  // L1 — distill the JD once; reused by every candidate this run.
  const spec = await distillJd(rawJd, model);
  const weights = normalizeWeights(spec.weights, DIMENSIONS);
  emit({ type: "jd_distilled", title: spec.title });

  // L2 — dedup gate, sequential so duplicates *within this batch* are caught
  // (a later candidate must see an earlier one that was just inserted).
  const survivors: CandidateInput[] = [];
  const results: CandidateResult[] = [];
  for (const c of candidates) {
    const emailNorm = normalizeEmail(c.email);
    const phoneNorm = normalizePhone(c.phone);
    const verdict = checkDuplicate({ emailNorm, phoneNorm }, ledger.all(), now);
    if (verdict.isDuplicate) {
      // Already submitted within the window: silently skip — not scored, not
      // shown. The existing ledger record stays and its submit date is not
      // refreshed (no insert here).
      emit({ type: "dedup_skip", id: c.id, on: verdict.matchedOn });
      continue;
    }
    // First submission in the window — record it now, so below-threshold
    // candidates are still in the ledger after scoring.
    ledger.insert({ emailNorm, phoneNorm, name: c.name, firstSubmit: now });
    survivors.push(c);
  }

  // L3 — score survivors in parallel (bounded). The JD weighting was derived
  // once above; per candidate we only pay for their own materials.
  const scored = await pool(survivors, opts.concurrency ?? 5, async (c) => {
    emit({ type: "score_start", id: c.id });
    try {
      const dimScores = await scoreCandidate(spec, c, model);
      return { c, dimScores, error: null as string | null };
    } catch (e) {
      return { c, dimScores: [], error: String(e) };
    }
  });

  // L4/L5 — aggregate, gate, summarize.
  for (const { c, dimScores, error } of scored) {
    if (error) {
      results.push({
        candidateId: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: "error",
        total: null,
        dimScores: [],
        summary: null,
        reason: `Scoring failed (surfaced, not scored 0): ${error.slice(0, 160)}`,
      });
      emit({ type: "score_error", id: c.id });
      continue;
    }

    const total = weightedTotal(dimScores, weights);
    const passed = passesThreshold(total, threshold);
    let summary: string | null = null;
    if (passed) {
      summary = await writeSummary(spec, total, dimScores, model);
    }
    results.push({
      candidateId: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      status: passed ? "scored" : "below_threshold",
      total,
      dimScores,
      summary,
      reason: passed
        ? `Above the ${threshold}/10 line.`
        : `Below the ${threshold}/10 line (${total.toFixed(1)}). Recorded; no summary generated.`,
    });
    emit({ type: "score_done", id: c.id, total, passed });
  }

  emit({ type: "done" });
  return { spec, results };
}

/** Bounded-concurrency map that preserves input order in the output. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}
