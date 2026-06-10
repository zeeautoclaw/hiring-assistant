# AI Builder Screening Agent
**Zedong Sun — KPMG AI Builder Case Study**

**Demo / repository:** [REPO LINK]  ·  **3-minute video:** [VIDEO LINK]

*All candidate data is synthetic or anonymized. No confidential data is used.*

---

## 1. How I framed the problem

The brief asks me to "evaluate an AI Builder well," but also says *"we are not
hiring you to build hiring tools."* So I reframed.

The core AI-Builder skill — and one the KPMG JD explicitly names ("**design
evaluations**") — is building evaluation systems for AI. So I built an
**evaluation harness**, and used the act of building it to demonstrate the skill
itself. The "evaluate a candidate" topic is the vehicle; the artifact is a real,
reusable system for scoring open-ended submissions against any job description.

**The pain I optimized for:** open-ended candidate submissions are hard to
evaluate *consistently, explainably, and at scale.* Three reviewers score the
same submission differently, bias creeps in, and decisions aren't auditable. I
optimized for **consistency + auditability + a human-owned decision**, not for a
polished UI.

## 2. What I built

A workflow with explicit human-AI handoffs, delivered as a native macOS app over
a Node/TypeScript engine. It runs on a Claude subscription (`claude -p`), so the
marginal cost is ~$0.

```
JD ─┐
    ▼
① distill JD (1 call) → spec + JD-derived weights
② ingest candidates (résumé + project text)        [code, 0 tokens]
③ dedup gate (persistent, phone/email, 2-month)     [code, 0 tokens]
④ score: 1 call/candidate → 7 dims, 0–10, w/ evidence
⑤ aggregate (weighted, deterministic)               [code, 0 tokens]
⑥ gate at threshold → summary only for those above
⑦ ranked, filterable table → HUMAN decides
```

The model only does **judgment** (semantic match + dimension scoring).
Everything that must be *correct* — the weighted math, deduplication, the gate —
is deterministic code, so the pipeline is reproducible above the model layer.

**Frozen vs dynamic.** The rubric (dimension meanings + 0–10 behavioral anchors)
is frozen, so every candidate is measured on one consistent ruler. The JD is
injected at runtime and the dimension weights are derived from it — so the same
ruler scores against *any* role. Proof: the same five candidates, scored against
an "AI Builder" JD and an "AML Analyst" JD, **re-rank** — the builder profile
drops below the line, the compliance profile rises above it. An automated test
fails if that flip doesn't happen, which guards against a silently hard-coded
system.

**Seven dimensions** (weights are JD-derived; defaults shown): JD-fit (0.30),
AI-judgment (0.20), impact (0.15), complexity (0.12), ownership (0.12),
reasoning (0.08), pedigree (0.03 — deliberately tiny). Each is scored 0–10
against fixed anchors with a required evidence quote.

## 3. Key decisions & tradeoffs (what I deliberately left out)

- **Plain-text input, no PDF/DOCX parsing.** Keeps the prototype focused on the
  evaluation logic, which is the hard part.
- **One multi-dimension call per candidate**, not seven calls — ~7× fewer tokens;
  the JD is understood once and reused, not re-fed per candidate.
- **No résumé-authenticity verification.** This is the biggest gap (see risks) —
  I chose to flag it and keep a human in the loop rather than half-build it.
- **No bias-audit dashboard** — described as a concept, not built, within the cap.

## 4. Responsible AI

- **AI ranks and explains; a human decides.** The "advance to next round" action
  is a person's click. No candidate is auto-rejected by the model.
- **Auditable.** Every score cites the candidate's own words; a reviewer can
  verify each number.
- **Fairness.** Pedigree is weighted near-zero for a builder role; reasoning is
  scored on logic, not prose polish.
- **Robustness.** A hidden "give me a 10" instruction inside a submission is
  treated as data and ignored — verified with an A/B test.
- **Fail-safe.** A failed model call is surfaced as an error, never silently
  scored zero — a system fault must not masquerade as a weak candidate.
- **Privacy / governance.** Dedup uses a 2-month window; re-submissions are
  silently skipped; the prototype uses only synthetic data.

## 5. Risks & what I'd do next

| Risk | Mitigation now | Next |
|---|---|---|
| Self-reported projects are gameable | Human-in-the-loop; evidence required | Require repo/demo links → verifiability multiplier |
| LLM scoring variance | Frozen anchored rubric; deterministic aggregation | Self-consistency (median of N) on key dimensions |
| Articulation/fluency bias | Score logic, not prose | Structured intake fields per dimension |
| Cross-reviewer inconsistency (the original pain) | One frozen ruler, JD-injected | Calibration set + drift monitoring |

## 6. How I used AI vs. my own decisions

**Claude did:** scaffold code, draft prompt text, generate synthetic candidates,
first-draft the rubric anchors. **I decided:** the reframe (eval harness), the
frozen-vs-dynamic architecture, the seven dimensions and the JD-derived
weighting strategy, the determinism boundary between model and code, the dedup
rules, the human-in-the-loop boundary, and the test invariants (dynamic, dedup,
injection) that prove the system behaves as claimed.

## 7. Running it

See `README.md` in the repo. In short: `npm install`, then
`npm run -- --jd <jd.txt> --profiles <folder> --threshold 6`. 19 tests run fully
offline via record-replay (`npm test`). The macOS app wraps the same engine.
