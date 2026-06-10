/**
 * LLM client — drives the Claude Code CLI as a subprocess.
 *
 * Subscription mode: ANTHROPIC_API_KEY is removed from the child env so the CLI
 * authenticates via the user's Claude subscription (marginal cost ~$0), exactly
 * like the Radar.app / career-ops pipeline this is forked from.
 *
 * Record-replay: set LLM_CACHE_DIR to make calls deterministic. On a cache miss
 * the real model runs and the response is written keyed by a hash of the prompt;
 * on a hit the cached response is replayed. Tests run against replays so they
 * are reproducible and never burn subscription quota or hit rate limits. Set
 * LLM_REPLAY_ONLY=1 to fail instead of calling the model on a miss.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";

export interface CallOpts {
  model?: string;
  retries?: number;
  /** Stable key for record-replay; defaults to a hash of the prompt. */
  cacheKey?: string;
}

const CACHE_DIR = process.env.LLM_CACHE_DIR;
const REPLAY_ONLY = process.env.LLM_REPLAY_ONLY === "1";

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

function cachePath(key: string): string | null {
  if (!CACHE_DIR) return null;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  // Sanitize: a cacheKey may embed a JD title containing "/" or other path-
  // unsafe characters. Keep it readable but never let it escape the dir.
  const safe = key.replace(/[^A-Za-z0-9_.-]/g, "_");
  return join(CACHE_DIR, `${safe}.txt`);
}

/** Raw text completion from `claude -p`. Prompt is sent on stdin so length is
 *  not bounded by argv limits. */
export function callRaw(prompt: string, opts: CallOpts = {}): Promise<string> {
  const key = opts.cacheKey ?? hash((opts.model ?? "sonnet") + "\n" + prompt);
  const cp = cachePath(key);
  if (cp && existsSync(cp)) return Promise.resolve(readFileSync(cp, "utf8"));
  if (REPLAY_ONLY) {
    return Promise.reject(new Error(`LLM_REPLAY_ONLY: no cached response for ${key}`));
  }

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const args = ["-p", "--output-format", "text", "--model", opts.model ?? "sonnet"];
    const child = spawn("claude", args, { env });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited ${code}: ${err.slice(0, 500)}`));
        return;
      }
      if (cp) writeFileSync(cp, out);
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Pull the first complete JSON object out of model output, tolerating prose or
 *  ```json fences around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object found in model output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Call the model and validate the result against a schema. Retries on transport
 * failure, unparseable output, or schema violation. The retried prompt is
 * identical, so under record-replay the cache key is stable.
 */
export async function callJson<T>(
  prompt: string,
  schema: ZodType<T>,
  opts: CallOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await callRaw(prompt, {
        ...opts,
        cacheKey: opts.cacheKey ? `${opts.cacheKey}` : undefined,
      });
      return schema.parse(extractJson(raw));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`callJson failed after ${retries + 1} attempts: ${String(lastErr)}`);
}
