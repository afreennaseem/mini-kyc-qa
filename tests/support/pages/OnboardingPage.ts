import type { Locator, Page, Response } from '@playwright/test';

export type CustomerFormData = {
  fullName?: string;
  dateOfBirth?: string;
  country?: string;
  email?: string;
  isPep?: boolean;
};

export type FormField = 'fullName' | 'dateOfBirth' | 'country' | 'email' | 'isPep';

/** Page object for the Customer onboarding page (public/index.html). */
export class OnboardingPage {
  readonly heading: Locator;
  readonly fields: Record<FormField, Locator>;
  readonly submitButton: Locator;
  readonly result: Locator;
  readonly runScreeningButton: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Customer onboarding' });
    this.fields = {
      fullName: page.getByLabel('Full name'),
      dateOfBirth: page.getByLabel('Date of birth'),
      country: page.getByLabel('Country'),
      email: page.getByLabel('Email'),
      isPep: page.getByLabel('Politically exposed person'),
    };
    this.submitButton = page.getByRole('button', { name: 'Submit' });
    this.result = page.getByRole('region', { name: 'Result' });
    this.runScreeningButton = this.result.getByRole('button', { name: 'Run screening' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Fills only the fields present in `data`; checks PEP when `isPep` is true. */
  async fillForm(data: CustomerFormData): Promise<void> {
    if (data.fullName !== undefined) await this.fields.fullName.fill(data.fullName);
    if (data.dateOfBirth !== undefined) await this.fields.dateOfBirth.fill(data.dateOfBirth);
    if (data.country !== undefined) await this.fields.country.fill(data.country);
    if (data.email !== undefined) await this.fields.email.fill(data.email);
    if (data.isPep) await this.fields.isPep.check();
  }

  /** Clicks Submit and resolves with the POST /api/customers response. */
  async submit(): Promise<Response> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().endsWith('/api/customers') && r.request().method() === 'POST',
    );
    await this.submitButton.click();
    return responsePromise;
  }

  /** Clicks Run screening and resolves with the POST /api/customers/:id/screen response. */
  async runScreening(): Promise<Response> {
    const responsePromise = this.page.waitForResponse(
      (r) => /\/api\/customers\/\d+\/screen$/.test(r.url()) && r.request().method() === 'POST',
    );
    await this.runScreeningButton.click();
    return responsePromise;
  }

  /**
   * Inline field errors. Each input is linked to its error element via
   * aria-describedby, so assert with `toHaveAccessibleDescription(...)`
   * ('' means no error).
   */
  get errors(): Record<FormField, Locator> {
    return this.fields;
  }

  /** The "Customer ID: N" line in the Result section. */
  get customerId(): Locator {
    return this.result.getByRole('paragraph');
  }

  /** Risk badge; text is lowercase (low/medium/high), shown uppercase via CSS. */
  get riskBadge(): Locator {
    return this.result.getByRole('status');
  }

  /** Items in the "Reasons" list. */
  get reasons(): Locator {
    return this.result.getByRole('list', { name: 'Reasons' }).getByRole('listitem');
  }
}
