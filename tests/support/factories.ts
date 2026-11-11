import type { CustomerInput } from './apiClient.js';

/** Unique per call, so parallel tests never collide on email. */
function uniqueEmail(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `anna.${Date.now()}.${random}@test.dk`;
}

/** Builds a valid POST /api/customers body; overrides replace the defaults. */
export function buildCustomer(overrides: Partial<CustomerInput> = {}): CustomerInput {
  return {
    fullName: 'Anna Larsen',
    dateOfBirth: '1990-05-14',
    country: 'DK',
    email: uniqueEmail(),
    isPep: false,
    ...overrides,
  };
}
