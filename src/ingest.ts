/**
 * Ingest (L0) — deterministic, no LLM. Reads a JD file and a directory of
 * candidate folders into validated CandidateInput objects.
 *
 * Each candidate folder contains exactly two text files:
 *   resume.txt     — the resume (name/email/phone are extracted from its text)
 *   projects.txt   — the AI-projects writeup
 *
 * (.md is accepted as a convenience.) A folder without a resume is skipped with
 * a warning rather than crashing the whole run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractContact } from "./contact.js";
import { CandidateInput } from "./types.js";

export function readJd(path: string): string {
  const text = readFileSync(path, "utf8").trim();
  if (!text) throw new Error(`JD file is empty: ${path}`);
  return text;
}

function readFirst(folder: string, names: string[]): string {
  for (const n of names) {
    const p = join(folder, n);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return "";
}

export function readProfiles(dir: string): CandidateInput[] {
  const out: CandidateInput[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const folder = join(dir, entry);
    if (!statSync(folder).isDirectory()) continue;

    const resumeText = readFirst(folder, ["resume.txt", "resume.md"]);
    if (!resumeText.trim()) {
      console.warn(`[ingest] skipping ${entry}: no resume.txt`);
      continue;
    }
    const contact = extractContact(resumeText);

    out.push(
      CandidateInput.parse({
        id: entry,
        folder,
        name: contact.name || entry,
        email: contact.email,
        phone: contact.phone,
        resumeText,
        projectsText: readFirst(folder, ["projects.txt", "projects.md"]),
      }),
    );
  }
  return out;
}
