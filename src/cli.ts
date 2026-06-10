/**
 * CLI entry: run the screening pipeline over a JD + a folder of candidates.
 *
 *   npm run -- --jd fixtures/jd-a-ai-builder.txt \
 *              --profiles fixtures/profiles --threshold 6
 *
 * Prints a ranked table (passing first), then the full JSON. Set LLM_CACHE_DIR
 * to record/replay model calls.
 */
import { Ledger } from "./db.js";
import { readJd, readProfiles } from "./ingest.js";
import { run } from "./pipeline.js";

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (def !== undefined) return def;
  throw new Error(`missing --${name}`);
}

async function main() {
  const jdPath = arg("jd");
  const profilesDir = arg("profiles");
  const threshold = Number(arg("threshold", "6"));
  // Persistent by default so a candidate submitted in a prior run is remembered
  // and silently skipped on re-run. Pass --db :memory: for an ephemeral ledger.
  const dbPath = arg("db", "ledger.db");
  const now = Number(arg("now", String(Date.now())));

  const rawJd = readJd(jdPath);
  const candidates = await readProfiles(profilesDir);
  const ledger = new Ledger(dbPath);

  const { spec, results } = await run({
    rawJd,
    candidates,
    ledger,
    threshold,
    now,
    onEvent: (e) => process.stderr.write(`· ${JSON.stringify(e)}\n`),
  });

  const rank = { scored: 0, below_threshold: 1, filtered_dup: 2, error: 3 } as const;
  const ordered = [...results].sort(
    (a, b) => rank[a.status] - rank[b.status] || (b.total ?? -1) - (a.total ?? -1),
  );

  // --json: emit only the machine-readable result on stdout (events still go to
  // stderr). This is what the SwiftUI app consumes.
  if (process.argv.includes("--json")) {
    ledger.close();
    process.stdout.write(JSON.stringify({ spec, threshold, results: ordered }));
    return;
  }

  console.log(`\nJD: ${spec.title}  (threshold ${threshold}/10)\n`);
  console.log("RANK  CANDIDATE        SCORE  STATUS            REASON");
  ordered.forEach((r, i) => {
    const score = r.total === null ? "  –  " : r.total.toFixed(1).padStart(4);
    console.log(
      `${String(i + 1).padStart(2)}.   ${r.name.padEnd(15)}  ${score}  ${r.status.padEnd(16)}  ${r.reason.slice(0, 70)}`,
    );
    if (r.summary) console.log(`       └ ${r.summary}`);
  });

  ledger.close();
  console.log("\n--- JSON ---");
  console.log(JSON.stringify({ spec, results: ordered }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
