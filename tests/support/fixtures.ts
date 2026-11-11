import { test as base } from '@playwright/test';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { ApiClient } from './apiClient.js';
import { DbHelper } from './db.js';

type Fixtures = {
  onboardingPage: OnboardingPage;
  api: ApiClient;
  db: DbHelper;
};

export const test = base.extend<Fixtures>({
  onboardingPage: async ({ page }, use) => {
    await use(new OnboardingPage(page));
  },
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
  db: async ({}, use) => {
    const db = new DbHelper();
    await use(db);
    db.close();
  },
});

export { expect } from '@playwright/test';
