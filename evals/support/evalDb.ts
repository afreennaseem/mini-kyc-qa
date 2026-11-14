import path from 'node:path';
import { getDbFile } from '../../src/db.js';

/**
 * Evals use their own database. Importing this module points DB_FILE at it for
 * the current worker process; src/db.ts opens its connection lazily, so the
 * first query lands here no matter the import order. Playwright never shares a
 * worker process between projects, so e2e/api workers and the webServer
 * (DB_FILE=test.db) are unaffected.
 */
export const EVALS_DB_FILE = 'evals.db';

process.env.DB_FILE = EVALS_DB_FILE;

/** Throws unless the agent's connection uses evals.db (never test.db or kyc.db). */
export function assertEvalDb(): void {
  const file = getDbFile();
  if (path.basename(file) !== EVALS_DB_FILE) {
    throw new Error(`Evals must use ${EVALS_DB_FILE}, but the database is ${file}`);
  }
}
