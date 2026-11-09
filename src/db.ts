import Database from 'better-sqlite3';

export type CustomerStatus = 'pending' | 'approved' | 'review' | 'rejected';
export type Risk = 'low' | 'medium' | 'high';

export interface CustomerRow {
  id: number;
  full_name: string;
  date_of_birth: string;
  country: string;
  email: string;
  is_pep: number;
  status: CustomerStatus;
  created_at: string;
}

export interface ScreeningRow {
  id: number;
  customer_id: number;
  risk: Risk;
  reasons: string;
  sanctions_hit: number;
  mode: string;
  created_at: string;
}

export interface SanctionsRow {
  id: number;
  full_name: string;
  country: string;
}

/** Fictional names only — any resemblance to real persons is coincidental. */
export const SANCTIONS_SEED: ReadonlyArray<{ fullName: string; country: string }> = [
  { fullName: 'Viktor Drago Malenkov', country: 'RU' },
  { fullName: 'Amara Okonkwo-Blight', country: 'NG' },
  { fullName: 'Jun-Ho Tarkovsky', country: 'KP' },
  { fullName: 'Reza Farhadi Vantablack', country: 'IR' },
  { fullName: 'Lucia Moreno Castellan', country: 'VE' },
];

export const DB_FILE = process.env.DB_FILE || 'kyc.db';

export const db: Database.Database = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Drops and recreates the schema, then seeds the sanctions list. */
export function resetDatabase(): void {
  db.exec(`
    DROP TABLE IF EXISTS screenings;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS sanctions_list;

    CREATE TABLE customers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name     TEXT    NOT NULL,
      date_of_birth TEXT    NOT NULL,
      country       TEXT    NOT NULL,
      email         TEXT    NOT NULL,
      is_pep        INTEGER NOT NULL CHECK (is_pep IN (0, 1)),
      status        TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'review', 'rejected')),
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE screenings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER NOT NULL REFERENCES customers(id),
      risk          TEXT    NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
      reasons       TEXT    NOT NULL,
      sanctions_hit INTEGER NOT NULL CHECK (sanctions_hit IN (0, 1)),
      mode          TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE sanctions_list (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      country   TEXT NOT NULL
    );
  `);

  const insert = db.prepare('INSERT INTO sanctions_list (full_name, country) VALUES (?, ?)');
  db.transaction(() => {
    for (const s of SANCTIONS_SEED) insert.run(s.fullName, s.country);
  })();
}

export function insertCustomer(c: {
  fullName: string;
  dateOfBirth: string;
  country: string;
  email: string;
  isPep: boolean;
}): number {
  const result = db
    .prepare(
      `INSERT INTO customers (full_name, date_of_birth, country, email, is_pep)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(c.fullName, c.dateOfBirth, c.country, c.email, c.isPep ? 1 : 0);
  return Number(result.lastInsertRowid);
}

export function getCustomer(id: number): CustomerRow | undefined {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
}

export function setCustomerStatus(id: number, status: CustomerStatus): void {
  db.prepare('UPDATE customers SET status = ? WHERE id = ?').run(status, id);
}

export function insertScreening(s: {
  customerId: number;
  risk: Risk;
  reasons: string[];
  sanctionsHit: boolean;
  mode: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO screenings (customer_id, risk, reasons, sanctions_hit, mode)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(s.customerId, s.risk, JSON.stringify(s.reasons), s.sanctionsHit ? 1 : 0, s.mode);
  return Number(result.lastInsertRowid);
}

export function listScreenings(customerId: number): ScreeningRow[] {
  return db
    .prepare('SELECT * FROM screenings WHERE customer_id = ? ORDER BY created_at DESC, id DESC')
    .all(customerId) as ScreeningRow[];
}

/** Case- and whitespace-insensitive exact name match. */
export function findSanctionsMatches(fullName: string): SanctionsRow[] {
  const normalized = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
  return db
    .prepare('SELECT * FROM sanctions_list WHERE lower(full_name) = ?')
    .all(normalized) as SanctionsRow[];
}
