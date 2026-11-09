# Acceptance Criteria — mini-kyc-qa

Format: Given / When / Then. IDs are referenced by test plans, tests and evals.

## Onboarding

**AC-01 Valid onboarding**
Given a customer with a valid name, date of birth, ISO-2 country, email and PEP flag
When the onboarding form is submitted
Then the API returns 201 with an id and status "pending"
And the UI shows the customer id
And a matching row exists in the customers table

**AC-02 Required fields missing**
Given any required field is empty
When the form is submitted
Then the API returns 400 listing each missing field
And the UI shows an error next to each missing field
And no customer row is created

**AC-03 Invalid email**
Given an email without a valid format (e.g. "anna@")
When the form is submitted
Then the API returns 400 with an error for "email"

**AC-04 Invalid country code**
Given a country value that is not a 2-letter ISO code (e.g. "DEN")
When the form is submitted
Then the API returns 400 with an error for "country"

**AC-05 Unknown customer**
Given a customer id that does not exist
When GET /api/customers/:id or POST /api/customers/:id/screen is called
Then the API returns 404

## Screening

**AC-06 Low risk is approved**
Given a non-PEP customer from a low-risk country, not on the sanctions list
When screening runs
Then risk is "low", sanctionsHit is false and status becomes "approved"

**AC-07 PEP needs review**
Given a PEP customer from a low-risk country, not on the sanctions list
When screening runs
Then risk is "medium" and status becomes "review"

**AC-08 High-risk country is rejected**
Given a customer from IR, KP or SY
When screening runs
Then risk is "high" and status becomes "rejected"

**AC-09 Sanctions match is rejected**
Given a customer whose name is on the sanctions list
When screening runs
Then risk is "high", sanctionsHit is true and status becomes "rejected"

**AC-10 Explainable and stored**
Given any screening has run
Then every reason refers to a real input field (name, country, PEP or sanctions)
And sanctionsHit is never true unless the sanctions tool returned a match
And the screening is stored with reasons as valid JSON
And GET /api/customers/:id/screenings returns screenings newest first

## Data quality

**AC-11 International names accepted** (known bug — fixed in Phase 6)
Given a name with letters such as æ, ø, å, ö, a hyphen or an apostrophe (e.g. "Søren Ægidius", "Ana-Maria O'Neil")
When the form is submitted
Then the API returns 201
And the name is stored unchanged in the database

## Traceability

| AC | E2E (UI) | API + DB | Evals | Regression |
| --- | --- | --- | --- | --- |
| AC-01 | ✓ | ✓ | | |
| AC-02 | ✓ | ✓ | | |
| AC-03 | ✓ | ✓ | | |
| AC-04 | | ✓ | | |
| AC-05 | | ✓ | | |
| AC-06 | | ✓ | ✓ | |
| AC-07 | ✓ | ✓ | ✓ | |
| AC-08 | | ✓ | ✓ | |
| AC-09 | ✓ | ✓ | ✓ | |
| AC-10 | | ✓ | ✓ | |
| AC-11 | | | | ✓ |