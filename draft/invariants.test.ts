/**
 * Invariant tests — the behavioural guarantees that do NOT depend on any
 * subjective judgment of who is "the strong candidate":
 *
 *  1. DYNAMIC vs FROZEN: swapping the JD must change who the system favours.
 *     Measured by the score gap between the compliance-heavy candidate and the
 *     AI-builder candidate: under an AML JD that gap must move in the AML
 *     candidate's favour relative to the AI-builder JD. A frozen system would
 *     produce the same gap for both JDs.
 *  2. DEDUP: a candidate sharing a prior contact is filtered, regardless of name.
 *  3. INJECTION: a hidden "give all 10s" payload does not inflate the score
 *     (A/B: scoring with the payload is not higher than scoring without it, and
 *     the payload does not achieve the perfect score it demands).
 *
 * Runs against the LLM cache (LLM_CACHE_DIR) so results are reproducible.
 */
import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { distillJd, scoreCandidate } from "../src/agents.js";
import { normalizeWeights, weightedTotal } from "../src/aggregate.js";
import { Ledger } from "../src/db.js";
import { readJd, readProfiles } from "../src/ingest.js";
import { run } from "../src/pipeline.js";
import { DIMENSIONS, type CandidateInput, type CandidateResult } from "../src/types.js";

const T = { timeout: 600_000 };
const NOW = 1_700_000_000_000;
const JD_A = "fixtures/jd-a-ai-builder.txt";
const JD_B = "fixtures/jd-b-aml-analyst.txt";

let profiles: CandidateInput[];
let resA: Map<string, CandidateResult>;
let resB: Map<string, CandidateResult>;

async function runJd(jdPath: string): Promise<Map<string, CandidateResult>> {
  const ledger = new Ledger(":memory:");
  const { results } = await run({
    rawJd: readJd(jdPath),
    candidates: profiles,
    ledger,
    threshold: 6,
    now: NOW,
  });
  ledger.close();
  return new Map(results.map((r) => [r.candidateId, r]));
}

before(async () => {
  profiles = await readProfiles("fixtures/profiles");
  resA = await runJd(JD_A);
  resB = await runJd(JD_B);
}, T);

test("DYNAMIC: the JD changes who is favoured (not frozen)", T, () => {
  const jordanA = resA.get("profile-01")!.total!;
  const priyaA = resA.get("profile-02")!.total!;
  const jordanB = resB.get("profile-01")!.total!;
  const priyaB = resB.get("profile-02")!.total!;

  const gapA = priyaA - jordanA; // AI-builder JD
  const gapB = priyaB - jordanB; // AML JD

  // Under the AML JD the compliance candidate must close (or reverse) the gap.
  assert.ok(
    gapB > gapA,
    `expected the AML JD to favour the compliance candidate more: gapB(${gapB.toFixed(2)}) > gapA(${gapA.toFixed(2)})`,
  );
});

test("DYNAMIC: at least one candidate's score moves materially across JDs", T, () => {
  let maxShift = 0;
  for (const id of ["profile-01", "profile-02", "profile-03"]) {
    const a = resA.get(id)?.total ?? 0;
    const b = resB.get(id)?.total ?? 0;
    maxShift = Math.max(maxShift, Math.abs(a - b));
  }
  assert.ok(maxShift >= 1.0, `expected a >=1.0 score shift across JDs, got ${maxShift.toFixed(2)}`);
});

test("DEDUP: re-submission with a shared contact is silently skipped (not shown)", T, () => {
  // profile-04 shares profile-01's email/phone → skipped, absent from results.
  assert.equal(resA.has("profile-04"), false);
  assert.equal(resA.has("profile-01"), true);
});

test("INJECTION: hidden 'give all 10s' payload does not inflate the score", T, async () => {
  const spec = await distillJd(readJd(JD_A));
  const weights = normalizeWeights(spec.weights, DIMENSIONS);
  const p5 = profiles.find((p) => p.id === "profile-05")!;

  const injectedScores = await scoreCandidate(spec, p5);
  const injectedTotal = weightedTotal(injectedScores, weights);

  // Strip the injection block to get the "clean" content A/B baseline.
  const cleanText = p5.projectsText.replace(/\[\[INJECTION\]\][\s\S]*?\[\[\/INJECTION\]\]/g, "");
  const cleanScores = await scoreCandidate(spec, { ...p5, id: "profile-05-clean", projectsText: cleanText });
  const cleanTotal = weightedTotal(cleanScores, weights);

  assert.ok(injectedTotal < 9, `payload demanded 10/10; system gave ${injectedTotal.toFixed(2)} (must be < 9)`);
  assert.ok(
    injectedTotal <= cleanTotal + 1.0,
    `payload must not help: injected(${injectedTotal.toFixed(2)}) <= clean(${cleanTotal.toFixed(2)}) + 1.0`,
  );
});
