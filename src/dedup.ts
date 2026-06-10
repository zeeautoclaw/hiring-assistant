/**
 * Deduplication (L2) — pure, deterministic, fully unit-tested.
 *
 * Rule (per spec): within a 2-month window, if a candidate's phone OR email
 * matches a prior record, filter them out — across any role. The prior record's
 * submit date is NOT refreshed on a re-hit. Matching is done on NORMALIZED
 * contact info so formatting differences ("+1 647-575-9272" vs "6475759272")
 * still collide.
 *
 * Nothing here calls an LLM, the network, or the clock — `now` is passed in so
 * the window logic is testable.
 */

export const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/** Lowercase + trim. Empty/whitespace normalizes to "" (never matches). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Strip to digits, then canonicalize North-American numbers so the optional
 * country code does not break matching: an 11-digit number starting with 1
 * drops the leading 1, yielding the 10-digit local form. Other lengths are
 * returned as their digit string.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export interface LedgerRecord {
  emailNorm: string;
  phoneNorm: string;
  name: string;
  firstSubmit: number; // epoch ms, never refreshed
}

export interface DedupVerdict {
  isDuplicate: boolean;
  matchedOn: "email" | "phone" | null;
  matchedRecord: LedgerRecord | null;
}

/**
 * Decide whether `candidate` duplicates anything still inside the window.
 * A blank normalized field never matches (two candidates who both omit a phone
 * are not "the same phone").
 */
export function checkDuplicate(
  candidate: { emailNorm: string; phoneNorm: string },
  ledger: LedgerRecord[],
  now: number,
): DedupVerdict {
  for (const rec of ledger) {
    if (now - rec.firstSubmit > TWO_MONTHS_MS) continue; // expired, ignore
    if (candidate.emailNorm && candidate.emailNorm === rec.emailNorm) {
      return { isDuplicate: true, matchedOn: "email", matchedRecord: rec };
    }
    if (candidate.phoneNorm && candidate.phoneNorm === rec.phoneNorm) {
      return { isDuplicate: true, matchedOn: "phone", matchedRecord: rec };
    }
  }
  return { isDuplicate: false, matchedOn: null, matchedRecord: null };
}
