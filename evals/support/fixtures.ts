import { assertEvalDb } from './evalDb.js';
import { test as base } from '@playwright/test';

/** Use this `test` in eval specs: it fails the worker if the agent would read any DB but evals.db. */
export const test = base.extend<{}, { evalDb: void }>({
  evalDb: [
    async ({}, use) => {
      assertEvalDb();
      await use();
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect } from '@playwright/test';
