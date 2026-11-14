import { test, expect } from '../support/fixtures.js';
import { buildCustomer } from '../support/factories.js';

// Regression suite for docs/bugs/BUG-001-nordic-names.md (AC-11).
// Each test creates its own customer with a unique email, so tests are
// independent and safe to run in parallel against the shared test DB.

const VALID_INTERNATIONAL_NAMES = [
  'Søren Ægidius',
  'Bjørn Østergaard',
  'Åse Lindqvist',
  'Björk Åberg',
  'Ana-Maria O’Neil',
  'José Muñoz',
] as const;

const INVALID_NAMES: ReadonlyArray<{ label: string; fullName: string }> = [
  { label: 'digits', fullName: 'Anna123' },
  { label: 'markup', fullName: '<script>' },
  { label: 'only spaces', fullName: '   ' },
  { label: 'underscore', fullName: 'Anna_Larsen' },
];

test.describe('BUG-001 international names (API)', () => {
  for (const fullName of VALID_INTERNATIONAL_NAMES) {
    test(`@regression BUG-001 accepts "${fullName}" and stores it exactly`, async ({ api, db }) => {
      const response = await api.createCustomer(buildCustomer({ fullName }));
      expect(response.status(), await response.text()).toBe(201);

      const { id } = await response.json();
      expect(db.getCustomerRow(id)?.full_name).toBe(fullName);
    });
  }

  test('@regression BUG-001 hyphenated sanctions-list name is screened and rejected', async ({
    api,
    db,
  }) => {
    const created = await api.createCustomer(
      buildCustomer({ fullName: 'Amara Okonkwo-Blight', country: 'NG' }),
    );
    expect(created.status(), await created.text()).toBe(201);
    const { id } = await created.json();

    const screened = await api.screenCustomer(id);
    expect(screened.status()).toBe(200);
    expect(await screened.json()).toMatchObject({ risk: 'high', status: 'rejected' });

    expect(db.getCustomerRow(id)?.status).toBe('rejected');
    const [latest] = db.getScreeningRows(id);
    expect(latest).toBeDefined();
    expect(latest!.risk).toBe('high');
    expect(latest!.sanctions_hit).toBe(1);
  });

  for (const { label, fullName } of INVALID_NAMES) {
    test(`@regression BUG-001 still rejects invalid name (${label}) with 400`, async ({
      api,
      db,
    }) => {
      const body = buildCustomer({ fullName });
      const response = await api.createCustomer(body);
      expect(response.status()).toBe(400);

      const { errors } = await response.json();
      expect(errors).toHaveProperty('fullName');
      expect(db.countCustomersByEmail(body.email)).toBe(0);
    });
  }

  test('@regression BUG-001 lowercase high-risk country "ir" can never be approved', async ({
    api,
    db,
  }) => {
    // Current behaviour: the API accepts "ir", normalises it to "IR" and the
    // screening treats it as a high-risk jurisdiction. Lock that in.
    const body = buildCustomer({ country: 'ir' });
    const created = await api.createCustomer(body);
    expect(created.status(), await created.text()).toBe(201);
    const { id } = await created.json();

    expect(db.getCustomerRow(id)?.country).toBe('IR');

    const screened = await api.screenCustomer(id);
    expect(screened.status()).toBe(200);
    const result = await screened.json();
    expect(result).toMatchObject({ risk: 'high', status: 'rejected' });

    const row = db.getCustomerRow(id);
    expect(row?.status).toBe('rejected');
    expect(row?.status).not.toBe('approved');
    expect(db.getScreeningRows(id)[0]?.risk).toBe('high');
  });
});

test.describe('BUG-001 international names (UI)', () => {
  test('@regression BUG-001 onboards "Søren Ægidius" through the form', async ({
    onboardingPage,
    db,
  }) => {
    const data = buildCustomer({ fullName: 'Søren Ægidius' });

    await onboardingPage.goto();
    await expect(onboardingPage.heading).toBeVisible();
    await onboardingPage.fillForm(data);

    const response = await onboardingPage.submit();
    expect(response.status()).toBe(201);
    const { id } = await response.json();

    await expect(onboardingPage.result).toBeVisible();
    await expect(onboardingPage.customerId).toHaveText(`Customer ID: ${id}`);
    await expect(onboardingPage.fields.fullName).toHaveAccessibleDescription('');
    expect(db.getCustomerRow(id)?.full_name).toBe('Søren Ægidius');
  });
});
