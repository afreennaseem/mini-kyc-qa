import { test, expect } from '../support/fixtures.js';
import { buildCustomer } from '../support/factories.js';
import type { CustomerInput } from '../support/apiClient.js';

/**
 * ApiClient only accepts a valid CustomerInput. Negative tests need to send
 * bodies that break that contract, so cast deliberately in one place.
 */
function invalidBody(body: Partial<CustomerInput> | Record<string, unknown>): CustomerInput {
  return body as CustomerInput;
}

test.describe('Customers API', () => {
  test('[AC-01] creates a customer and stores it', async ({ api, db }) => {
    const body = buildCustomer();

    const response = await api.createCustomer(body);
    expect(response.status()).toBe(201);

    const created = await response.json();
    expect(created).toEqual({ id: expect.any(Number), status: 'pending' });

    const row = db.getCustomerRow(created.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      full_name: body.fullName,
      date_of_birth: body.dateOfBirth,
      country: body.country,
      email: body.email,
      is_pep: 0,
    });
  });

  test('[AC-02] missing fields', async ({ api, db }) => {
    const { isPep } = buildCustomer();

    const response = await api.createCustomer(invalidBody({ isPep }));
    expect(response.status()).toBe(400);

    const { errors } = await response.json();
    for (const field of ['fullName', 'dateOfBirth', 'country', 'email']) {
      expect(errors, `expected an error for ${field}`).toHaveProperty(field);
    }

    // A body that only lacks fullName must not create a row either.
    const { fullName: _omitted, ...withoutName } = buildCustomer();
    const nameless = await api.createCustomer(invalidBody(withoutName));
    expect(nameless.status()).toBe(400);
    expect(db.countCustomersByEmail(withoutName.email)).toBe(0);
  });

  test('[AC-03] invalid email', async ({ api }) => {
    const response = await api.createCustomer(buildCustomer({ email: 'anna@' }));
    expect(response.status()).toBe(400);

    const { errors } = await response.json();
    expect(errors).toHaveProperty('email');
  });

  test('[AC-04] invalid country', async ({ api }) => {
    const response = await api.createCustomer(buildCustomer({ country: 'DEN' }));
    expect(response.status()).toBe(400);

    const { errors } = await response.json();
    expect(errors).toHaveProperty('country');
  });

  test('[AC-05] unknown id', async ({ api }) => {
    const unknownId = 999999;

    const get = await api.getCustomer(unknownId);
    expect(get.status()).toBe(404);

    const screen = await api.screenCustomer(unknownId);
    expect(screen.status()).toBe(404);
  });
});

const screeningCases: ReadonlyArray<{
  ac: string;
  title: string;
  overrides: Partial<CustomerInput>;
  risk: 'low' | 'medium' | 'high';
  status: 'approved' | 'review' | 'rejected';
  sanctionsHit: boolean;
}> = [
  {
    ac: 'AC-06',
    title: 'DK non-PEP is low risk and approved',
    overrides: { country: 'DK', isPep: false },
    risk: 'low',
    status: 'approved',
    sanctionsHit: false,
  },
  {
    ac: 'AC-07',
    title: 'DK PEP is medium risk and under review',
    overrides: { country: 'DK', isPep: true },
    risk: 'medium',
    status: 'review',
    sanctionsHit: false,
  },
  {
    ac: 'AC-08',
    title: 'high-risk country IR is high risk and rejected',
    overrides: { country: 'IR' },
    risk: 'high',
    status: 'rejected',
    sanctionsHit: false,
  },
  {
    ac: 'AC-09',
    title: 'sanctions-list name is high risk and rejected',
    overrides: { fullName: 'Viktor Drago Malenkov', country: 'RU' },
    risk: 'high',
    status: 'rejected',
    sanctionsHit: true,
  },
];

test.describe('Screening API', () => {
  for (const c of screeningCases) {
    test(`[${c.ac}] ${c.title}`, async ({ api, db }) => {
      const created = await api.createCustomer(buildCustomer(c.overrides));
      expect(created.status()).toBe(201);
      const { id } = await created.json();

      const response = await api.screenCustomer(id);
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({
        risk: c.risk,
        status: c.status,
        sanctionsHit: c.sanctionsHit,
      });

      expect(db.getCustomerRow(id)?.status).toBe(c.status);

      const [latest] = db.getScreeningRows(id);
      expect(latest).toBeDefined();
      expect(latest!.risk).toBe(c.risk);
      expect(latest!.sanctions_hit).toBe(c.sanctionsHit ? 1 : 0);

      const reasons: unknown = JSON.parse(latest!.reasons);
      expect(Array.isArray(reasons)).toBe(true);
      expect(reasons).not.toHaveLength(0);
      for (const reason of reasons as unknown[]) {
        expect(typeof reason).toBe('string');
      }
    });
  }

  test('[AC-10] screenings newest first', async ({ api }) => {
    const created = await api.createCustomer(buildCustomer());
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    expect((await api.screenCustomer(id)).status()).toBe(200);
    expect((await api.screenCustomer(id)).status()).toBe(200);

    const response = await api.getScreenings(id);
    expect(response.status()).toBe(200);

    const screenings: Array<{ id: number }> = await response.json();
    expect(screenings).toHaveLength(2);
    expect(screenings[0]!.id).toBeGreaterThan(screenings[1]!.id);
  });
});
