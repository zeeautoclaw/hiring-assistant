# 3-Minute Video Script — AI Builder Screening Agent

Total ≈ 3:00. `[SHOW]` = what's on screen. Spoken lines are tight on purpose —
read at a natural pace and you'll land near 3:00. Record the demo first, then
voice the explanation over the app + a couple of slides.

---

## PART 1 — DEMO (0:00 – 1:00)  ·  show, don't explain yet

**[SHOW: the Mac app open, candidate folders + a job description selected]**

> "This is a screening agent. I give it one job description and a folder of
> candidate submissions — each is just a résumé and a write-up of their AI
> projects. I click Run."

**[SHOW: click Run → the ranked results table fills in]**

> "It scores every candidate against that JD on seven dimensions, ranks them,
> and writes a short summary for everyone above the bar."

**[SHOW: click View on the top candidate → the per-dimension panel]**

> "Every score is backed by a quote from the candidate's own words — so a human
> reviewer can audit exactly why the number is what it is. Nothing is a black box."

**[SHOW: swap the JD from 'AI Builder' to 'AML Analyst' → Run again]**

> "Here's the key part. Same five candidates, different job description — and the
> ranking flips. The AI-builder profile drops below the line; the compliance
> profile rises above it. The system re-matches to whatever role you load. It is
> dynamic, not hard-coded."

**[SHOW: run the same candidates a second time → they vanish from the table]**

> "And if someone was already submitted in the last two months, it's recognized
> and skipped automatically — no duplicate review."

---

## PART 2 — THINKING (1:00 – 3:00)  ·  voice over app / slides

**Reframe (1:00–1:25)**

> "The brief says 'evaluate an AI Builder' — but it also says don't build a
> hiring tool. So I reframed it. The actual AI-Builder skill is *designing
> evaluations for AI systems*. So I built an evaluation harness — and used the
> act of building it to demonstrate the skill itself. The KPMG JD literally
> lists 'design evaluations' as the job."

**How it works — think in workflows (1:25–1:55)**

> "It's a workflow with clear human-AI handoffs: dedup gate, the JD is distilled
> once into a spec, each candidate is scored in a single call, then a summary —
> and the human makes the decision. The model only does judgment. Everything
> that must be *correct* — the weighted math, deduplication, the pass/fail gate —
> is deterministic code, so the pipeline is reproducible above the model."

**Frozen vs dynamic (1:55–2:15)**

> "The rubric — what each dimension means, what a 9 versus a 3 looks like — is
> frozen, so candidates are measured on one consistent ruler. The job
> description is injected at runtime, and the dimension *weights* are derived
> from it. That's why the ranking flipped earlier — and I wrote an automated
> test that fails if it doesn't, to prove the system isn't secretly frozen."

**Responsible AI (2:15–2:40)**

> "Responsible AI is built in, not bolted on. AI ranks and explains — humans
> decide. Every score cites evidence. Pedigree is deliberately a tiny weight, so
> it doesn't reward the wrong signal. Hidden 'give me a 10' instructions inside a
> submission are ignored — I A/B tested that. And a failed model call is
> surfaced as an error, never silently scored zero, because that would punish a
> good candidate for a system fault."

**Tradeoffs, risk, AI use (2:40–3:00)**

> "Tradeoffs: plain-text input, one call per candidate to save tokens, and I
> deliberately left out résumé-authenticity verification — which is the biggest
> risk, since self-reported projects are gameable, so a human stays in the loop.
> I used Claude to scaffold code, draft prompts, and generate the synthetic
> candidates — but the architecture, the dimensions, the determinism boundary,
> and the test strategy were my calls. With more time: self-consistency scoring
> and a bias-audit dashboard."

**[END ~3:00]**
