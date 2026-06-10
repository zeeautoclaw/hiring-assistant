/**
 * Data contracts for the screening harness.
 *
 * Every value that crosses a layer boundary has a schema here. LLM outputs are
 * validated against these at the call site, so malformed model output never
 * reaches aggregation or the UI. Deterministic layers (dedup, aggregate, gate)
 * consume and produce these same shapes, which is what makes them unit-testable.
 */
import { z } from "zod";

/** The frozen list of scoring dimensions. The JD is injected at runtime; this
 *  list is not. Weights are *defaults* — a JD-derived weighting can override
 *  them per run (that is the "dynamic" part; this list is the "frozen" part). */
export const DIMENSIONS = [
  "jd_fit",
  "ai_judgment",
  "impact",
  "complexity",
  "ownership",
  "reasoning",
  "pedigree",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Raw candidate as read off disk (L0). Contact info drives dedup (L2);
 *  resume + projects drive scoring (L3). */
export const CandidateInput = z.object({
  id: z.string(),
  folder: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  resumeText: z.string(),
  projectsText: z.string(),
});
export type CandidateInput = z.infer<typeof CandidateInput>;

/** A job description distilled once per run (L1). Replaces the raw JD in every
 *  downstream prompt so the JD is understood once, not C×D times. */
export const JDSpec = z.object({
  title: z.string(),
  archetype: z.string(),
  hardReqs: z.array(z.string()),
  preferredReqs: z.array(z.string()),
  /** Per-dimension, one line telling the scorer what *this* JD wants on that
   *  axis. This is where runtime JD content flows into each dimension. */
  perDimCues: z.record(z.string()),
  /** Weights derived from this JD. Must be present for every dimension. */
  weights: z.record(z.number()),
});
export type JDSpec = z.infer<typeof JDSpec>;

/** One dimension's verdict for one candidate (L3). `evidence` quotes the
 *  candidate's own text so a human can audit the number. `note` distinguishes a
 *  real low score from missing data or a harness error — the difference matters
 *  for fairness (a failed call must never masquerade as "weak candidate"). */
export const DimScore = z.object({
  dimension: z.enum(DIMENSIONS),
  // Tolerant parsing: a slightly-off model response (score as string, a 4th
  // evidence quote, an over-long justification) should be coerced into a valid
  // score, never hard-fail the whole candidate. The dimension name is the only
  // field kept strict — we need all seven, named correctly.
  score: z
    .coerce.number()
    .catch(0)
    .transform((n) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : 0)))),
  evidence: z.array(z.string()).catch([]).transform((a) => a.slice(0, 3)),
  anchor: z.string().catch(""),
  justification: z.string().catch("").transform((s) => s.slice(0, 240)),
  note: z.enum(["ok", "no_evidence", "error"]).catch("ok"),
});
export type DimScore = z.infer<typeof DimScore>;

/** What the scoring agent must return: every dimension, once. */
export const ScoreCard = z.object({
  scores: z.array(DimScore).length(DIMENSIONS.length),
});
export type ScoreCard = z.infer<typeof ScoreCard>;

export type CandidateStatus =
  | "scored" // ran end to end, has a total
  | "filtered_dup" // dropped at dedup, never scored
  | "below_threshold" // scored, under the line, no summary
  | "error"; // a layer failed; surfaced, never silently zeroed

/** Final per-candidate result (L4/L5) that the UI renders. */
export interface CandidateResult {
  candidateId: string;
  name: string;
  email: string;
  phone: string;
  status: CandidateStatus;
  total: number | null; // 0..10, null when filtered_dup or error
  dimScores: DimScore[];
  summary: string | null; // only generated when total >= threshold
  reason: string; // one line, always present, even for filtered/rejected
}
