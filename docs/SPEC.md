# mini-kyc-qa — Specification

One Node/Express server serves a static HTML page and a REST API, stores data in SQLite, and calls a risk agent that runs in `mock` mode (free, deterministic) or `llm` mode (Claude API).

## Data model (SQLite, better-sqlite3)

| Table | Columns |
| --- | --- |
| customers | id, full_name, date_of_birth, country (ISO-2), email, is_pep (0/1), status (pending, approved, review, rejected), created_at |
| screenings | id, customer_id, risk (low, medium, high), reasons (JSON text), sanctions_hit (0/1), mode, created_at |
| sanctions_list | id, full_name, country — seeded with 5 fictional names |

## REST API

| Method + path | Behaviour |
| --- | --- |
| GET /health | 200 `{status:"ok"}` |
| POST /api/customers | Validate body, insert, 201 `{id, status:"pending"}`; 400 with field errors on bad input |
| GET /api/customers/:id | 200 customer, 404 if unknown |
| POST /api/customers/:id/screen | Run agent, insert screening, set status: low → approved, medium → review, high → rejected |
| GET /api/customers/:id/screenings | List screenings, newest first |

Request body for POST /api/customers: `{ fullName, dateOfBirth (YYYY-MM-DD), country (ISO-2), email, isPep (boolean) }`

## Risk agent (src/agent/riskAgent.ts)

- Input: the customer record. Tool: `checkSanctions(fullName)` queries `sanctions_list`.
- Output, always valid JSON: `{ risk: "low"|"medium"|"high", reasons: string[], sanctionsHit: boolean }`.
- Rules (also the eval ground truth): sanctions hit → high; country in IR, KP, SY → high; PEP → medium; otherwise low.
- Grounding: every reason must cite a field that exists in the input. `sanctionsHit` may only be true if the tool returned a match.
- `AGENT_MODE=mock` applies the rules in code. `AGENT_MODE=llm` sends a system prompt + tool definition to the Claude API (cheapest Haiku model) and parses the JSON reply.

## UI (public/index.html)

- Heading "Customer onboarding".
- Form: full name, date of birth, country, email, PEP checkbox, "Submit" button.
- Result panel showing the customer id and a "Run screening" button.
- Risk badge (low/medium/high) and the list of reasons after screening.
- Use proper `<label>` elements and button roles so Playwright role/label locators work.

## Planted bug

Name validation uses `/^[A-Za-z ]+$/`, so "Søren Ægidius" is rejected. Fixed in Phase 6 with a regression test.

## Folder structure

```
mini-kyc-qa/
  src/        server.ts, db.ts, validation.ts, agent/riskAgent.ts
  public/     index.html
  tests/
    seed.spec.ts          (created by init-agents)
    e2e/                  (Generator output)
    api/                  customers.api.spec.ts
    regression/           nordic-names.spec.ts
    support/              apiClient.ts, db.ts, pages/OnboardingPage.ts, fixtures.ts
  evals/      dataset.json, riskAgent.eval.spec.ts
  specs/      (Planner output, markdown test plans)
  docs/       SPEC.md, acceptance-criteria.md
  .github/workflows/ci.yml
  playwright.config.ts, package.json, tsconfig.json, README.md
```

## Playwright projects

`e2e`, `api`, `regression`, `evals`. `webServer` starts the app on port 3000 with `AGENT_MODE=mock` and `DB_FILE=test.db` (a fresh test database).