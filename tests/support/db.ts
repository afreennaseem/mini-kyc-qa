import Database from 'better-sqlite3';

// Row types mirror the tables in docs/SPEC.md. They are declared here rather
// than imported from src/db.ts, because importing that module opens a
// writable connection as a side effect.

export type CustomerStatus = 'pending' | 'approved' | 'review' | 'rejected';
export type Risk = 'low' | 'medium' | 'high';
export type AgentMode = 'mock' | 'llm';

export interface CustomerRow {
  id: number;
  full_name: string;
  date_of_birth: string;
  /** ISO-2 country code */
  country: string;
  email: string;
  /** 0 or 1 */
  is_pep: number;
  status: CustomerStatus;
  created_at: string;
}

export interface ScreeningRow {
  id: number;
  customer_id: number;
  risk: Risk;
  /** JSON-encoded string[] */
  reasons: string;
  /** 0 or 1 */
  sanctions_hit: number;
  mode: AgentMode;
  created_at: string;
}

export interface SanctionsRow {
  id: number;
  full_name: string;
  country: string;
}

/** Read-only access to the test database for asserting on persisted state. */
export class DbHelper {
  private readonly db: Database.Database;

  constructor(file = 'test.db') {
    this.db = new Database(file, { readonly: true, fileMustExist: true });
  }

  getCustomerRow(id: number): CustomerRow | undefined {
    return this.db
      .prepare<[number], CustomerRow>('SELECT * FROM customers WHERE id = ?')
      .get(id);
  }

  /** Newest first; id breaks ties when created_at is identical. */
  getScreeningRows(customerId: number): ScreeningRow[] {
    return this.db
      .prepare<[number], ScreeningRow>(
        'SELECT * FROM screenings WHERE customer_id = ? ORDER BY created_at DESC, id DESC',
      )
      .all(customerId);
  }

  countCustomersByEmail(email: string): number {
    const row = this.db
      .prepare<[string], { count: number }>(
        'SELECT COUNT(*) AS count FROM customers WHERE email = ?',
      )
      .get(email);
    return row?.count ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
