import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  TWO_MONTHS_MS,
  checkDuplicate,
  normalizeEmail,
  normalizePhone,
  type LedgerRecord,
} from "../../src/dedup.js";

test("normalizePhone canonicalizes country code and punctuation", () => {
  assert.equal(normalizePhone("+1 647-575-9272"), "6475759272");
  assert.equal(normalizePhone("(647) 575 9272"), "6475759272");
  assert.equal(normalizePhone("16475759272"), "6475759272");
  assert.equal(normalizePhone("647.575.9272"), "6475759272");
});

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Alice@X.com "), "alice@x.com");
});

const NOW = 1_700_000_000_000;
const rec = (over: Partial<LedgerRecord>): LedgerRecord => ({
  emailNorm: "a@x.com",
  phoneNorm: "6475759272",
  name: "A",
  firstSubmit: NOW,
  ...over,
});

test("matches on email regardless of phone", () => {
  const v = checkDuplicate({ emailNorm: "a@x.com", phoneNorm: "9999999999" }, [rec({})], NOW);
  assert.equal(v.isDuplicate, true);
  assert.equal(v.matchedOn, "email");
});

test("matches on phone regardless of email", () => {
  const v = checkDuplicate({ emailNorm: "other@x.com", phoneNorm: "6475759272" }, [rec({})], NOW);
  assert.equal(v.isDuplicate, true);
  assert.equal(v.matchedOn, "phone");
});

test("phone matches across country-code formatting", () => {
  const v = checkDuplicate(
    { emailNorm: "z@x.com", phoneNorm: normalizePhone("+1 (647) 575-9272") },
    [rec({})],
    NOW,
  );
  assert.equal(v.isDuplicate, true);
});

test("blank fields never match each other", () => {
  const v = checkDuplicate({ emailNorm: "", phoneNorm: "" }, [rec({ emailNorm: "", phoneNorm: "" })], NOW);
  assert.equal(v.isDuplicate, false);
});

test("record outside the 2-month window is ignored", () => {
  const old = rec({ firstSubmit: NOW - TWO_MONTHS_MS - 1 });
  const v = checkDuplicate({ emailNorm: "a@x.com", phoneNorm: "6475759272" }, [old], NOW);
  assert.equal(v.isDuplicate, false);
});

test("record exactly at the window edge still matches", () => {
  const edge = rec({ firstSubmit: NOW - TWO_MONTHS_MS });
  const v = checkDuplicate({ emailNorm: "a@x.com", phoneNorm: "x" }, [edge], NOW);
  assert.equal(v.isDuplicate, true);
});
