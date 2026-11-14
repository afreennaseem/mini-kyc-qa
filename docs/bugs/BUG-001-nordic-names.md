# BUG-001: Names with Nordic letters, hyphens or apostrophes are rejected

**Severity:** High · **Component:** API validation (`src/validation.ts`) · **Status:** Open

## Environment
mini-kyc-qa, local, AGENT_MODE=mock

## Steps to reproduce
1. POST /api/customers with fullName "Søren Ægidius" (all other fields valid)
2. POST /api/customers with fullName "Amara Okonkwo-Blight"

## Actual result
400 Bad Request, error on fullName, for both requests. No customer is created.

## Expected result
201 Created; the name is stored exactly as entered (AC-11).

## Impact
- Danish, Swedish and Norwegian customers (core market) cannot onboard.
- Any hyphenated or apostrophe name is blocked, including 2 of 5 sanctions-list names,
  so those people could never reach sanctions screening through the normal flow.

## Root cause
NAME_PATTERN = /^[A-Za-z ]+$/ only allows the 52 English letters and spaces.

## Regression test
tests/regression/nordic-names.spec.ts