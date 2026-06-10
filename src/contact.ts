/**
 * Contact extraction (L0). Name / email / phone are pulled out of the resume
 * text itself — there is no separate contact file. Pure regex (0 tokens) so the
 * dedup gate stays cheap.
 */

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// A loose phone candidate: a run of digits and separators with enough digits.
const PHONE_RE = /\+?\d[\d\s().\-]{7,}\d/g;

/** Pull contact details out of resume text. Email/phone are robust; name is the
 *  first plausible header line (no "@", few digits, not a section label). */
export function extractContact(resumeText: string): Contact {
  const email = resumeText.match(EMAIL_RE)?.[0] ?? "";

  let phone = "";
  for (const m of resumeText.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) {
      phone = m[0].trim();
      break;
    }
  }

  let name = "";
  for (const raw of resumeText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const digitCount = (line.match(/\d/g) ?? []).length;
    if (line.includes("@") || digitCount > 3 || line.length > 60) continue;
    if (/^(resume|cv|curriculum|summary|profile|experience|education)\b/i.test(line)) continue;
    name = line.replace(/^[#>\-\s*]+/, "").trim();
    break;
  }

  return { name, email, phone };
}
