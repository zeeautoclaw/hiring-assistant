/**
 * Dedup ledger, backed by node's built-in SQLite. Stores normalized contact
 * info + the first-submit timestamp. The matching *logic* lives in dedup.ts
 * (pure, tested); this file only persists and fetches rows.
 */
import { DatabaseSync } from "node:sqlite";
import type { LedgerRecord } from "./dedup.js";

export class Ledger {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_norm TEXT NOT NULL,
        phone_norm TEXT NOT NULL,
        name TEXT NOT NULL,
        first_submit INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_email ON candidates(email_norm);
      CREATE INDEX IF NOT EXISTS idx_phone ON candidates(phone_norm);
    `);
  }

  /** All records (the window filter is applied in dedup.checkDuplicate, which
   *  needs `now`; keeping fetch unfiltered keeps this layer dumb and testable). */
  all(): LedgerRecord[] {
    const rows = this.db
      .prepare(`SELECT email_norm, phone_norm, name, first_submit FROM candidates`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      emailNorm: String(r.email_norm),
      phoneNorm: String(r.phone_norm),
      name: String(r.name),
      firstSubmit: Number(r.first_submit),
    }));
  }

  /** Insert a new submission. The submit date is set once here and never
   *  updated, so a later re-hit does not refresh the 2-month window. */
  insert(rec: LedgerRecord): void {
    this.db
      .prepare(
        `INSERT INTO candidates (email_norm, phone_norm, name, first_submit) VALUES (?, ?, ?, ?)`,
      )
      .run(rec.emailNorm, rec.phoneNorm, rec.name, rec.firstSubmit);
  }

  close(): void {
    this.db.close();
  }
}
