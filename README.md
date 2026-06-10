# AI Builder Screening Agent

An evidence-based, dedup-aware candidate screening harness. It scores candidate
submissions against a **job description supplied at runtime** — swap the JD and the
ranking changes — then ranks and explains. **AI ranks and explains; a human decides.**

Built for the KPMG AI Builder case study. Synthetic data only.

---

## The problem it solves

Open-ended candidate submissions are painful to evaluate *consistently*: different
reviewers score the same submission differently, bias creeps in, decisions aren't
auditable, and it's slow. This tool turns subjective impression into a **consistent,
evidence-cited, reproducible** pass — without letting AI make the hiring decision.

## How it works

```
① distill JD (1 LLM call/run)  → compact JD-spec, reused everywhere
② ingest candidate folders     → resume + projects text          [code, 0 tokens]
③ dedup gate                   → phone/email, 2-month, cross-role [code, 0 tokens]
④ score (1 call/candidate)     → all dimensions, anchored 0–10, evidence-cited
⑤ aggregate (weighted, 0–10)   → JD-derived weights               [code, 0 tokens]
⑥ gate at threshold            → below the line → no summary       [code]
⑦ summary (only for passers)   → built from extracted evidence, not the raw resume
⑧ results                      → ranked, filterable, human decides
```

**Frozen vs dynamic.** The scoring *rubric* (dimension meanings + 0–10 anchors) is frozen
so candidates are measured on one consistent ruler. The *JD* is injected at runtime
(`JDSpec`: per-dimension cues + JD-derived weights), so the same ruler scores against any
role. That split is what the dynamic-vs-frozen test below probes.

**Subscription mode.** LLM calls shell out to `claude -p` with `ANTHROPIC_API_KEY` removed,
so they run on the Claude subscription (~$0 marginal cost), like the Radar.app pipeline this
forks from.

## Run it

```bash
npm install
npm run -- --jd fixtures/jd-a-ai-builder.txt --profiles fixtures/profiles --threshold 6
```

Set `LLM_CACHE_DIR=.cache/llm` to record/replay model calls.

## The result that matters: dynamic, not frozen

The same five candidates, scored against two different JDs:

| Candidate (blind-authored) | JD-A: AI Builder | JD-B: AML Analyst |
|---|---|---|
| Jordan — AI-builder portfolio | **8.1 (pass)** | 5.2 (fail) |
| Priya — AML/compliance portfolio | 6.7 | **8.4 (pass)** |

The ranking **flips** when the JD changes. A frozen/hardcoded system would produce the same
order for both. (Profiles are authored blind — no target ranking baked in; the proof is the
*relative shift*, which needs no judgment of who is "better".)

## Testing

`npm test` — 19 tests, runnable fully offline via record-replay (`LLM_REPLAY_ONLY=1`):

- **Unit (deterministic core):** phone/email normalization, dedup match + 2-month window +
  no-date-refresh, weighted aggregation, error-dimension exclusion, threshold gate.
- **Invariants (behavioural, judgment-free):**
  - *Dynamic:* the JD changes who is favoured (score gap moves ≥ a threshold).
  - *Dedup:* a shared-contact re-submission is filtered regardless of name.
  - *Injection:* a hidden "give all 10s" payload does not inflate the score (A/B vs clean).

### Quality boundaries (honest)

- **Deterministic layers** (dedup, aggregate, gate) are unit-tested to exact values.
- **LLM layers** can't be exact; they're constrained (anchored rubric, schema validation +
  retry, evidence quotes), bounded (consistency + injection tests), and **reproducible** for
  the demo via record-replay.
- A failed scoring call is surfaced as `error`, **never silently scored 0** — a harness
  failure must not masquerade as a weak candidate.

## What it does NOT do (prototype scope)

Authenticity/repo verification, auth/multi-user, ATS integration, a bias-audit dashboard,
1000-candidate scale, and rich document parsing (resumes are plain-text `.txt`) are out of
scope and noted as concepts.

## Layout

```
src/   types (contracts) · rubric (frozen) · prompts · agents (LLM) · dedup · aggregate
       · db (sqlite ledger) · ingest · pipeline (orchestrator) · cli · llm (claude -p client)
fixtures/  jd-a · jd-b · profiles/profile-01..05
demo/     unit/ · invariants
```
