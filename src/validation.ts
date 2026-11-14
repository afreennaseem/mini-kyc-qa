import { z } from 'zod';

/**
 * PLANTED BUG (see docs/SPEC.md "Planted bug", AC-11):
 * ASCII-only name regex rejects international names such as "Søren Ægidius".
 * Intentionally left in place — fixed in Phase 6 with a regression test.
 */
    // Any letter in any language, plus combining accents, spaces, hyphens and apostrophes.
    // Must start with a letter. Fixes BUG-001.
    const NAME_PATTERN = /^\p{L}[\p{L}\p{M} '’\-]*$/u;

function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const customerInputSchema = z.object({
  fullName: z
    .string({ error: 'fullName is required' })
    .trim()
    .min(1, 'fullName is required')
    .regex(NAME_PATTERN, 'fullName contains invalid characters'),
  dateOfBirth: z
    .string({ error: 'dateOfBirth is required' })
    .trim()
    .min(1, 'dateOfBirth is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
    .refine(isRealDate, 'dateOfBirth must be a valid date'),
  country: z
    .string({ error: 'country is required' })
    .trim()
    .min(1, 'country is required')
    .regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO code')
    .transform((v) => v.toUpperCase()),
  email: z
    .string({ error: 'email is required' })
    .trim()
    .min(1, 'email is required')
    .pipe(z.email('email must be a valid email address')),
  isPep: z.boolean({ error: 'isPep must be a boolean' }),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export type ValidationResult =
  | { success: true; data: CustomerInput }
  | { success: false; errors: Record<string, string[]> };

export function validateCustomer(body: unknown): ValidationResult {
  const parsed = customerInputSchema.safeParse(body ?? {});
  if (parsed.success) return { success: true, data: parsed.data };

  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : '_body';
    // Zod reports issues in schema order, so the first one per field is the most basic check.
    if (!errors[field]) errors[field] = [issue.message];
  }
  return { success: false, errors };
}
