import { test as base } from '@playwright/test';
import { OnboardingPage } from './pages/OnboardingPage.js';

type Fixtures = {
  onboardingPage: OnboardingPage;
};

export const test = base.extend<Fixtures>({
  onboardingPage: async ({ page }, use) => {
    await use(new OnboardingPage(page));
  },
});

export { expect } from '@playwright/test';
