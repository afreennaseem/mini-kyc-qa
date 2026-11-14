import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { test, expect } from './support/fixtures.js';
import { getAgentMode, runAgent, type AgentRun } from '../src/agent/riskAgent.js';
import type { CustomerRow } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET_FILE = path.join(here, 'dataset.json');
const RESULTS_FILE = path.join(here, 'results.json');
const ACCURACY_THRESHOLD = 0.9;
// Mirrors DEFAULT_MODEL in src/agent/riskAgent.ts (not exported).
const DEFAULT_LLM_MODEL = 'claude-haiku-5-5';

type Risk = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

const evalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  critical: z.boolean(),
  input: z.object({
    fullName: z.string().min(1),
    dateOfBirth: z.string(),
    country: z.string().length(2),
    email: z.string(),
    isPep: z.boolean(),
  }),
  expected: z.object({
    risk: z.enum(['low', 'medium', 'high']),
    sanctionsHit: z.boolean(),
  }),
});
type EvalCase = z.infer<typeof evalCaseSchema>;

const dataset: EvalCase[] = z
  .array(evalCaseSchema)
  .min(1)
  .parse(JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8')));

/** Maps a dataset input (camelCase, boolean isPep) to the CustomerRow the agent expects. */
function toCustomerRow(c: EvalCase, index: number): CustomerRow {
  return {
    id: index + 1,
    full_name: c.input.fullName,
    date_of_birth: c.input.dateOfBirth,
    country: c.input.country,
    email: c.input.email,
    is_pep: c.input.isPep ? 1 : 0,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Invariants (independent of the agent's own schema on purpose)
// ---------------------------------------------------------------------------

const outputSchema = z.object({
  risk: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string().min(1)).min(1),
  sanctionsHit: z.boolean(),
});

/** A reason is grounded if it mentions the name, the country code, PEP status or sanctions. */
function isGroundedReason(reason: string, c: EvalCase): boolean {
  const r = reason.toLowerCase();
  const countryCode = new RegExp(`\\b${c.input.country.toLowerCase()}\\b`);
  return (
    r.includes(c.input.fullName.toLowerCase()) ||
    countryCode.test(r) ||
    r.includes('pep') ||
    r.includes('politically exposed') ||
    r.includes('sanction')
  );
}

// ---------------------------------------------------------------------------
// Run the agent once per case, sequentially
// ---------------------------------------------------------------------------

type CaseRun = { ok: true; run: AgentRun } | { ok: false; error: string };
const runs = new Map<string, CaseRun>();

const mode = getAgentMode();
const model = mode === 'llm' ? process.env.ANTHROPIC_MODEL || DEFAULT_LLM_MODEL : null;

function actualRisk(id: string): Risk | null {
  const r = runs.get(id);
  return r?.ok ? r.run.raw.risk : null;
}

test.beforeAll(async () => {
  // LLM mode makes several API calls per case.
  test.setTimeout(mode === 'llm' ? dataset.length * 60_000 : 30_000);
  for (const [i, c] of dataset.entries()) {
    try {
      runs.set(c.id, { ok: true, run: await runAgent(toCustomerRow(c, i)) });
    } catch (err) {
      // Record per case so one bad reply fails one test, not the whole suite.
      runs.set(c.id, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
});

test.afterAll(() => {
  const cases = dataset.map((c) => {
    const actual = actualRisk(c.id);
    return {
      id: c.id,
      expected: c.expected.risk,
      actual,
      correct: actual === c.expected.risk,
      critical: c.critical,
    };
  });
  const accuracy = cases.filter((c) => c.correct).length / cases.length;
  const results = { timestamp: new Date().toISOString(), mode, model, accuracy, cases };
  fs.writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`);
});

// ---------------------------------------------------------------------------
// One test per case
// ---------------------------------------------------------------------------

for (const c of dataset) {
  test(`[${c.id}] ${c.description}`, () => {
    const result = runs.get(c.id);
    expect(result, 'agent was not run for this case').toBeDefined();
    if (!result!.ok) throw new Error(`Agent threw: ${result!.error}`);
    const { run } = result!;

    const parsed = outputSchema.safeParse(run.raw);
    expect(parsed.success, `output does not match schema: ${parsed.error?.message}`).toBe(true);
    const output = parsed.data!;

    expect(output.sanctionsHit, c.expected.sanctionsHit ? 'sanctions hit missed' : 'sanctions hit invented').toBe(
      c.expected.sanctionsHit,
    );
    expect(run.guardTriggered, 'grounding guard triggered').toBe(false);

    const ungrounded = output.reasons.filter((r) => !isGroundedReason(r, c));
    expect(ungrounded, 'reasons that cite no input field or sanctions result').toEqual([]);

    if (c.critical) {
      expect(output.risk, 'risk on a critical case').toBe(c.expected.risk);
    } else if (output.risk !== c.expected.risk) {
      test.info().annotations.push({
        type: 'risk-mismatch',
        description: `expected ${c.expected.risk}, got ${output.risk}`,
      });
    }
  });
}

test(`[accuracy] risk accuracy >= ${ACCURACY_THRESHOLD}`, () => {
  const correct = dataset.filter((c) => actualRisk(c.id) === c.expected.risk).length;
  const accuracy = correct / dataset.length;
  test.info().annotations.push({ type: 'accuracy', description: `${correct}/${dataset.length} = ${accuracy}` });
  expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_THRESHOLD);
});
