import 'dotenv/config';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  getDbFile,
  getCustomer,
  insertCustomer,
  insertScreening,
  listScreenings,
  resetDatabase,
  setCustomerStatus,
  type CustomerRow,
  type CustomerStatus,
  type Risk,
  type ScreeningRow,
} from './db.js';
import { validateCustomer } from './validation.js';
import { getAgentMode, screenCustomer } from './agent/riskAgent.js';

const PORT = Number(process.env.PORT) || 3000;
const STATUS_BY_RISK: Record<Risk, CustomerStatus> = {
  low: 'approved',
  medium: 'review',
  high: 'rejected',
};

resetDatabase();

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

function toCustomerDto(c: CustomerRow) {
  return {
    id: c.id,
    fullName: c.full_name,
    dateOfBirth: c.date_of_birth,
    country: c.country,
    email: c.email,
    isPep: c.is_pep === 1,
    status: c.status,
    createdAt: c.created_at,
  };
}

function toScreeningDto(s: ScreeningRow) {
  return {
    id: s.id,
    customerId: s.customer_id,
    risk: s.risk,
    reasons: JSON.parse(s.reasons) as string[],
    sanctionsHit: s.sanctions_hit === 1,
    mode: s.mode,
    createdAt: s.created_at,
  };
}

function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function loadCustomer(req: Request, res: Response): CustomerRow | null {
  const id = parseId(req.params.id as string | undefined);
  const customer = id === null ? undefined : getCustomer(id);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return null;
  }
  return customer;
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/customers', (req, res) => {
  const result = validateCustomer(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', errors: result.errors });
    return;
  }
  const id = insertCustomer(result.data);
  res.status(201).json({ id, status: 'pending' });
});

app.get('/api/customers/:id', (req, res) => {
  const customer = loadCustomer(req, res);
  if (customer) res.status(200).json(toCustomerDto(customer));
});

app.post('/api/customers/:id/screen', async (req, res) => {
  const customer = loadCustomer(req, res);
  if (!customer) return;

  const outcome = await screenCustomer(customer);
  const status = STATUS_BY_RISK[outcome.risk];
  const screeningId = insertScreening({
    customerId: customer.id,
    risk: outcome.risk,
    reasons: outcome.reasons,
    sanctionsHit: outcome.sanctionsHit,
    mode: outcome.mode,
  });
  setCustomerStatus(customer.id, status);

  res.status(200).json({
    screeningId,
    customerId: customer.id,
    risk: outcome.risk,
    reasons: outcome.reasons,
    sanctionsHit: outcome.sanctionsHit,
    mode: outcome.mode,
    status,
  });
});

app.get('/api/customers/:id/screenings', (req, res) => {
  const customer = loadCustomer(req, res);
  if (customer) res.status(200).json(listScreenings(customer.id).map(toScreeningDto));
});

// Malformed JSON bodies and unexpected errors.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON body', errors: { _body: ['Invalid JSON'] } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`mini-kyc-qa listening on http://localhost:${PORT} (AGENT_MODE=${getAgentMode()}, DB_FILE=${getDbFile()})`);
});
