/**
 * The frozen scoring rubric: what each dimension means and what each 0–10 band
 * looks like. This is deliberately JD-agnostic. The JD enters scoring only
 * through the injected JDSpec (perDimCues + weights), never by editing this
 * file. That separation is what lets the same rubric score against any JD while
 * staying consistent across candidates.
 */
import type { Dimension } from "./types.js";

export interface DimDef {
  key: Dimension;
  label: string;
  /** What this axis measures. */
  measures: string;
  /** Band guidance shared shape: 9-10 / 7-8 / 5-6 / 3-4 / 0-2. */
  anchors: string;
  /** Default weight (sums to 1 across dimensions). A JD may re-derive these. */
  defaultWeight: number;
}

export const RUBRIC: DimDef[] = [
  {
    key: "jd_fit",
    label: "JD fit",
    measures:
      "Whether the candidate's projects/resume demonstrate the SKILLS and METHODOLOGIES this JD asks for. Judge transferable skill, not keyword overlap (process automation in finance ≡ in healthcare).",
    anchors:
      "9-10 hits the JD's hard requirements with concrete evidence; 7-8 most hard reqs covered; 5-6 partial / adjacent; 3-4 weak or only superficial overlap; 0-2 off-domain or no relevant evidence.",
    defaultWeight: 0.3,
  },
  {
    key: "ai_judgment",
    label: "AI judgment",
    measures:
      "HOW the candidate uses AI: clear human/AI decision boundaries, evidence they corrected or rejected AI output, mention of evals/verification/guardrails.",
    anchors:
      "9-10 clear boundary AND a concrete 'I overrode the AI on X' instance AND verification; 7-8 fluent, clear boundary, no correction instance; 5-6 used AI but cannot locate own judgment; 3-4 vague 'used AI to be productive'; 0-2 no evidence, or 'AI did everything' / 'used no AI' (both low for this role).",
    defaultWeight: 0.2,
  },
  {
    key: "impact",
    label: "Impact",
    measures:
      "Real-world outcome: shipped to users vs internal tool vs demo vs concept; quantified results.",
    anchors:
      "9-10 shipped to real users with quantified outcome; 7-8 shipped, outcome described; 5-6 internal tool or unquantified; 3-4 demo only; 0-2 concept or no outcome.",
    defaultWeight: 0.15,
  },
  {
    key: "complexity",
    label: "Complexity",
    measures:
      "Difficulty of the problem solved, on an absolute ladder — independent of JD relevance.",
    anchors:
      "9-10 built something new under ambiguity/constraints; 7-8 solved a hard, well-defined problem with real tradeoffs; 5-6 assembled existing components; 3-4 followed a tutorial-level path; 0-2 trivial or unclear.",
    defaultWeight: 0.12,
  },
  {
    key: "ownership",
    label: "Ownership",
    measures:
      "How much the candidate personally drove the work: first-person specific actions vs vague collective 'we'.",
    anchors:
      "9-10 built it solo or led, with specific personal decisions; 7-8 core contributor with named personal work; 5-6 contributor, some 'we'; 3-4 mostly vague collective language; 0-2 no individual action evident.",
    defaultWeight: 0.12,
  },
  {
    key: "reasoning",
    label: "Reasoning",
    measures:
      "Clarity of reasoning under ambiguity: alternatives considered, why chosen, limits acknowledged. Score the LOGIC, not the prose polish.",
    anchors:
      "9-10 names alternatives, justifies tradeoffs, states limits; 7-8 explains decisions with some tradeoff awareness; 5-6 describes what but not why; 3-4 assertions without reasoning; 0-2 none. Ignore grammar/eloquence.",
    defaultWeight: 0.08,
  },
  {
    key: "pedigree",
    label: "Pedigree",
    measures:
      "School prestige and academic level. Deliberately a TINY signal for a builder role — present so it is auditable, not influential.",
    anchors:
      "9-10 top school + advanced degree directly relevant; 7-8 strong academic background; 5-6 typical; 3-4 limited; 0-2 none stated. (Low weight by design.)",
    defaultWeight: 0.03,
  },
];

/** Default weights as a record, used when a run does not derive JD weights. */
export const DEFAULT_WEIGHTS: Record<Dimension, number> = Object.fromEntries(
  RUBRIC.map((d) => [d.key, d.defaultWeight]),
) as Record<Dimension, number>;
