import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../support/fixtures.js';
import type { FormField, OnboardingPage } from '../support/pages/OnboardingPage.js';

// Implements specs/onboarding.md. Every test loads a fresh page and uses a unique
// email so tests stay independent and can run in parallel against a shared DB.

function uniqueEmail(tag: string): string {
  return `qa+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Submits a valid customer, asserts the Result section, and returns the new id. */
async function submitValidCustomer(onboardingPage: OnboardingPage): Promise<number> {
  const response = await onboardingPage.submit();
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body).toMatchObject({ id: expect.any(Number), status: 'pending' });

  await expect(onboardingPage.result).toBeVisible();
  await expect(onboardingPage.customerId).toHaveText(`Customer ID: ${body.id}`);
  await expect(onboardingPage.runScreeningButton).toBeVisible();
  return body.id;
}

async function runScreening(onboardingPage: OnboardingPage) {
  const response = await onboardingPage.runScreening();
  expect(response.status()).toBe(200);
}

async function expectCustomerStatus(request: APIRequestContext, id: number, status: string) {
  const res = await request.get(`/api/customers/${id}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ id, status });
}

async function expectLatestSanctionsHit(request: APIRequestContext, id: number, hit: boolean) {
  const res = await request.get(`/api/customers/${id}/screenings`);
  expect(res.status()).toBe(200);
  const screenings = await res.json();
  expect(screenings.length).toBeGreaterThan(0);
  expect(screenings.at(-1).sanctionsHit).toBe(hit);
}

async function expectNoFieldErrors(onboardingPage: OnboardingPage, fields: FormField[]) {
  for (const field of fields) {
    await expect(onboardingPage.errors[field]).toHaveAccessibleDescription('');
  }
}

const ALL_FIELDS: FormField[] = ['fullName', 'dateOfBirth', 'country', 'email', 'isPep'];

test.describe('Onboarding', () => {
  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.goto();
    await expect(onboardingPage.page).toHaveTitle('Customer onboarding');
    await expect(onboardingPage.heading).toBeVisible();
  });

  test('[AC-01][AC-06] valid submission succeeds and low-risk customer is approved', async ({
    onboardingPage,
    request,
  }) => {
    await onboardingPage.fillForm({
      fullName: 'Anna Smith',
      dateOfBirth: '1990-05-15',
      country: 'DK',
      email: uniqueEmail('ac01-happy'),
    });
    await expect(onboardingPage.fields.isPep).not.toBeChecked();
    await expectNoFieldErrors(onboardingPage, ALL_FIELDS);

    const id = await submitValidCustomer(onboardingPage);
    await runScreening(onboardingPage);

    await expect(onboardingPage.riskBadge).toHaveText('low');
    await expect(onboardingPage.riskBadge).toHaveCSS('text-transform', 'uppercase');
    await expect(onboardingPage.reasons).toHaveText([
      'full_name not on sanctions list, country DK not high-risk, is_pep is false',
    ]);

    // Status and sanctionsHit are not shown in the UI; verify via the API.
    await expectCustomerStatus(request, id, 'approved');
    await expectLatestSanctionsHit(request, id, false);
  });

  test('[AC-02] submitting with all required fields empty shows required-field errors', async ({
    onboardingPage,
  }) => {
    const { fields, errors } = onboardingPage;
    await expect(fields.fullName).toBeEmpty();
    await expect(fields.dateOfBirth).toBeEmpty();
    await expect(fields.country).toBeEmpty();
    await expect(fields.email).toBeEmpty();
    await expect(fields.isPep).not.toBeChecked();

    const response = await onboardingPage.submit();
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.id).toBeUndefined();
    expect(Object.keys(body.errors).sort()).toEqual(['country', 'dateOfBirth', 'email', 'fullName']);

    await expect(errors.fullName).toHaveAccessibleDescription('fullName is required');
    await expect(errors.dateOfBirth).toHaveAccessibleDescription('dateOfBirth is required');
    await expect(errors.country).toHaveAccessibleDescription('country is required');
    await expect(errors.email).toHaveAccessibleDescription('email is required');
    await expectNoFieldErrors(onboardingPage, ['isPep']);

    await expect(onboardingPage.result).toBeHidden();
  });

  test('[AC-03] invalid email "anna@" shows an email validation error', async ({ onboardingPage }) => {
    await onboardingPage.fillForm({
      fullName: 'Anna Smith',
      dateOfBirth: '1990-05-15',
      country: 'DK',
      email: 'anna@',
    });
    await expectNoFieldErrors(onboardingPage, ALL_FIELDS);

    const response = await onboardingPage.submit();
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(Object.keys(body.errors)).toEqual(['email']);

    await expect(onboardingPage.errors.email).toHaveAccessibleDescription(
      'email must be a valid email address',
    );
    await expectNoFieldErrors(onboardingPage, ['fullName', 'dateOfBirth', 'country', 'isPep']);
    await expect(onboardingPage.result).toBeHidden();
  });

  test('[AC-07] PEP customer gets medium risk and review status', async ({
    onboardingPage,
    request,
  }) => {
    await onboardingPage.fillForm({
      fullName: 'John Carter',
      dateOfBirth: '1985-03-20',
      country: 'DK',
      email: uniqueEmail('ac07-pep'),
      isPep: true,
    });
    await expect(onboardingPage.fields.isPep).toBeChecked();

    const id = await submitValidCustomer(onboardingPage);
    await runScreening(onboardingPage);

    await expect(onboardingPage.riskBadge).toHaveText('medium');
    await expect(onboardingPage.reasons).toContainText([
      'is_pep is true: customer is a politically exposed person',
    ]);

    await expectCustomerStatus(request, id, 'review');
  });

  test('[AC-09] sanctions-list name gets high risk and rejected status', async ({
    onboardingPage,
    request,
  }) => {
    await onboardingPage.fillForm({
      fullName: 'Viktor Drago Malenkov',
      dateOfBirth: '1975-11-02',
      country: 'DK',
      email: uniqueEmail('ac09-sanctions'),
    });
    await expect(onboardingPage.fields.isPep).not.toBeChecked();
    await expectNoFieldErrors(onboardingPage, ALL_FIELDS);

    const id = await submitValidCustomer(onboardingPage);
    await runScreening(onboardingPage);

    await expect(onboardingPage.riskBadge).toHaveText('high');
    await expect(onboardingPage.reasons).toContainText([
      'full_name "Viktor Drago Malenkov" matches the sanctions list',
    ]);

    await expectCustomerStatus(request, id, 'rejected');
    await expectLatestSanctionsHit(request, id, true);
  });
});
