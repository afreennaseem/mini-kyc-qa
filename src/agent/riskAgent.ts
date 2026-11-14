import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { findSanctionsMatches, type CustomerRow, type SanctionsRow } from '../db.js';

export const HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY'] as const;

export const riskResultSchema = z.object({
  risk: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string().min(1)).min(1),
  sanctionsHit: z.boolean(),
});

export type RiskResult = z.infer<typeof riskResultSchema>;
export type AgentMode = 'mock' | 'llm';

export interface ScreeningOutcome extends RiskResult {
  mode: AgentMode;
}

/** The agent's only tool. */
export function checkSanctions(fullName: string): { match: boolean; matches: SanctionsRow[] } {
  const matches = findSanctionsMatches(fullName);
  return { match: matches.length > 0, matches };
}

export function getAgentMode(): AgentMode {
  return process.env.AGENT_MODE === 'llm' ? 'llm' : 'mock';
}

/** Unguarded view of one agent run, for evals. */
export interface AgentRun {
  mode: AgentMode;
  /** The agent's output as returned, parsed against riskResultSchema, before the grounding guard. */
  raw: RiskResult;
  /** The model's final text reply, verbatim. Always null in mock mode. */
  rawText: string | null;
  /** True when raw.sanctionsHit is true but checkSanctions never matched. Always false in mock mode. */
  guardTriggered: boolean;
}

export const GUARD_ERROR_MESSAGE = 'Agent reported sanctionsHit=true without a tool match';

/**
 * Runs the agent and reports the grounding guard instead of enforcing it.
 * Still throws for refusals, unparseable replies and turn-limit overruns.
 */
export async function runAgent(customer: CustomerRow): Promise<AgentRun> {
  const mode = getAgentMode();
  if (mode === 'llm') return { mode, ...(await runLlm(customer)) };
  return { mode, raw: runMock(customer), rawText: null, guardTriggered: false };
}

/** Guarded result used by the server: throws if the grounding guard triggers. */
export async function screenCustomer(customer: CustomerRow): Promise<ScreeningOutcome> {
  const run = await runAgent(customer);
  if (run.guardTriggered) throw new Error(GUARD_ERROR_MESSAGE);
  return { ...run.raw, mode: run.mode };
}

// ---------------------------------------------------------------------------
// Mock mode: deterministic rules (also the eval ground truth)
// ---------------------------------------------------------------------------

export function runMock(customer: CustomerRow): RiskResult {
  const sanctions = checkSanctions(customer.full_name);
  const reasons: string[] = [];
  let risk: RiskResult['risk'] = 'low';

  if (sanctions.match) {
    risk = 'high';
    reasons.push(`full_name "${customer.full_name}" matches the sanctions list`);
  }

  
  if ((HIGH_RISK_COUNTRIES as readonly string[]).includes(customer.country)) {
    risk = 'high';
    reasons.push(`country ${customer.country} is a high-risk jurisdiction`);
  }

    if (customer.is_pep === 1) {
    if (risk === 'low') risk = 'medium';
    reasons.push('is_pep is true: customer is a politically exposed person');
  }

  if (reasons.length === 0) {
    reasons.push(
      `full_name not on sanctions list, country ${customer.country} not high-risk, is_pep is false`,
    );
  }

  return { risk, reasons, sanctionsHit: sanctions.match };
}

// ---------------------------------------------------------------------------
// LLM mode: Claude with a checkSanctions tool, JSON-only final reply
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_TURNS = 5;

const SYSTEM_PROMPT = `You are a KYC risk-screening agent. You receive one customer record as JSON.

Procedure:
1. Call the checkSanctions tool exactly once with the customer's full_name.
2. Apply these rules, highest risk wins:
   - checkSanctions returned match=true -> risk "high"
   - country is IR, KP or SY -> risk "high"
   - is_pep is 1 -> risk "medium"
   - otherwise -> risk "low"
3. Reply with ONLY a JSON object, no prose and no code fences:
   {"risk": "low"|"medium"|"high", "reasons": string[], "sanctionsHit": boolean}

Grounding rules:
- Every reason must cite a field that exists in the input (full_name, country, is_pep) or the checkSanctions result.
- sanctionsHit may be true only if checkSanctions returned match=true.
- Do not invent facts that are not in the input or the tool result.`;

const CHECK_SANCTIONS_TOOL: Anthropic.Tool = {
  name: 'checkSanctions',
  description:
    'Look up a full name in the sanctions list. Returns {match: boolean, matches: [{full_name, country}]}.',
  input_schema: {
    type: 'object',
    properties: {
      fullName: { type: 'string', description: "The customer's full name exactly as given." },
    },
    required: ['fullName'],
    additionalProperties: false,
  },
  strict: true,
};

const toolInputSchema = z.object({ fullName: z.string() });

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error(`Agent reply contained no JSON object: ${trimmed}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function runLlm(customer: CustomerRow): Promise<Omit<AgentRun, 'mode'>> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const input = {
    full_name: customer.full_name,
    date_of_birth: customer.date_of_birth,
    country: customer.country,
    email: customer.email,
    is_pep: customer.is_pep,
  };

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Screen this customer:\n${JSON.stringify(input)}` },
  ];

  let toolMatched = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [CHECK_SANCTIONS_TOOL],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Risk agent refused the request');
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const parsed = toolInputSchema.safeParse(block.input);
        if (block.name !== 'checkSanctions' || !parsed.success) {
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Invalid tool call: ${block.name}`,
            is_error: true,
          });
          continue;
        }
        const result = checkSanctions(parsed.data.fullName);
        if (result.match) toolMatched = true;
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({
            match: result.match,
            matches: result.matches.map((m) => ({ full_name: m.full_name, country: m.country })),
          }),
        });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const raw = riskResultSchema.parse(extractJson(text));

    // Grounding guard: sanctionsHit may only be true if the tool actually matched.
    // Reported here; enforced by screenCustomer.
    const guardTriggered = raw.sanctionsHit && !toolMatched;
    return { raw, rawText: text, guardTriggered };
  }

  throw new Error(`Risk agent did not produce a final answer within ${MAX_TURNS} turns`);
}
