import { test as setup } from '@playwright/test';
import { assertEvalDb } from './support/evalDb.js';
import { resetDatabase } from '../src/db.js';

// Runs once, before any eval spec (the evals project depends on evals-setup):
// creates evals.db with the same schema and sanctions seed as the app database.
setup('create and seed evals.db', () => {
  assertEvalDb();
  resetDatabase();
});
