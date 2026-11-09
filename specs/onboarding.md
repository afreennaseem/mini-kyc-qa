# Onboarding Page Test Plan

## Application Overview

Test plan for the Customer onboarding page at http://localhost:3000/ (mini-kyc-qa). Form fields: Full name (text), Date of birth (date input), Country (ISO-2, e.g. DK; text, maxlength 3), Email (email input; form has novalidate so validation is done by the API), Politically exposed person (checkbox), and a Submit button. No required markers are shown. After a successful submit a Result section shows "Customer ID: N" and a "Run screening" button; clicking it shows "Risk:" with a badge (low/medium/high, rendered uppercase) and a list of reasons. The customer status (approved/review/rejected) is NOT displayed in the UI; it is only visible via GET /api/customers/:id. Each scenario starts from a fresh page load and uses a unique email. Exploration created customers 1-3 in the local DB using the emails qa+explore-*; the plan uses different emails, but reset test.db if a clean state is needed.

## Test Scenarios

### 1. Onboarding

**Seed:** `tests/seed.spec.ts`

#### 1.1. [AC-01][AC-06] Valid submission succeeds and low-risk customer is approved

**File:** `tests/onboarding/happy-path.spec.ts`

**Steps:**
  1. Seed: tests/seed.spec.ts. Navigate to http://localhost:3000/
    - expect: Page title and heading are 'Customer onboarding'
  2. Fill Full name = 'Anna Smith'; Date of birth = '1990-05-15'; Country = 'DK'; Email = 'qa+ac01-happy@example.com'; leave 'Politically exposed person' unchecked
    - expect: No error text is shown
  3. Click 'Submit'
    - expect: POST /api/customers returns 201 with status 'pending'
    - expect: A 'Result' section appears showing 'Customer ID: <n>' (observed 'Customer ID: 1')
    - expect: A 'Run screening' button is visible
  4. Click 'Run screening'
    - expect: Risk badge shows 'low' (displayed as LOW)
    - expect: Reason list shows: 'full_name not on sanctions list, country DK not high-risk, is_pep is false'
    - expect: GET /api/customers/<n> returns status 'approved' and sanctionsHit false. Observed: risk low, status approved. NOTE: status is not displayed in the UI, so verify it via the API.

#### 1.2. [AC-02] Submitting with all required fields empty shows required-field errors

**File:** `tests/onboarding/required-fields.spec.ts`

**Steps:**
  1. Seed: tests/seed.spec.ts. Navigate to http://localhost:3000/ and leave every field empty (Email for this scenario: none entered)
    - expect: Form is blank
  2. Click 'Submit'
    - expect: POST /api/customers returns 400
    - expect: Inline error under Full name: 'fullName is required'
    - expect: Inline error under Date of birth: 'dateOfBirth is required'
    - expect: Inline error under Country: 'country is required'
    - expect: Inline error under Email: 'email is required'
    - expect: No 'Result' section / Customer ID is shown and no customer row is created. Observed: all four messages appear exactly as above; messages use raw field names, not labels. No error for the PEP checkbox (it is optional).

#### 1.3. [AC-03] Invalid email 'anna@' shows an email validation error

**File:** `tests/onboarding/invalid-email.spec.ts`

**Steps:**
  1. Seed: tests/seed.spec.ts. Navigate to http://localhost:3000/
    - expect: Form is blank
  2. Fill Full name = 'Anna Smith'; Date of birth = '1990-05-15'; Country = 'DK'; Email = 'anna@'
    - expect: No error yet (form is novalidate)
  3. Click 'Submit'
    - expect: POST /api/customers returns 400 with an error for 'email'
    - expect: Inline error under Email: 'email must be a valid email address'
    - expect: No other field shows an error and no Customer ID is displayed. Observed: matches.

#### 1.4. [AC-07] PEP customer gets medium risk and review status

**File:** `tests/onboarding/pep.spec.ts`

**Steps:**
  1. Seed: tests/seed.spec.ts. Navigate to http://localhost:3000/
    - expect: Form is blank
  2. Fill Full name = 'John Carter'; Date of birth = '1985-03-20'; Country = 'DK'; Email = 'qa+ac07-pep@example.com'; check 'Politically exposed person'
    - expect: Checkbox is checked
  3. Click 'Submit' then click 'Run screening'
    - expect: Customer ID is shown
    - expect: Risk badge shows 'medium' (displayed as MEDIUM)
    - expect: Reason shown: 'is_pep is true: customer is a politically exposed person'
    - expect: GET /api/customers/<n> returns status 'review'. Observed: risk medium, status review. NOTE: status is not displayed in the UI; verify via the API.

#### 1.5. [AC-09] Sanctions-list name gets high risk and rejected status

**File:** `tests/onboarding/sanctions.spec.ts`

**Steps:**
  1. Seed: tests/seed.spec.ts. Navigate to http://localhost:3000/
    - expect: Form is blank
  2. Fill Full name = 'Viktor Drago Malenkov'; Date of birth = '1975-11-02'; Country = 'DK'; Email = 'qa+ac09-sanctions@example.com'; leave PEP unchecked
    - expect: No error text is shown
  3. Click 'Submit' then click 'Run screening'
    - expect: Customer ID is shown
    - expect: Risk badge shows 'high' (displayed as HIGH)
    - expect: Reason shown: 'full_name "Viktor Drago Malenkov" matches the sanctions list'
    - expect: GET /api/customers/<n> returns status 'rejected'. Observed: risk high, status rejected. NOTE: status and sanctionsHit are not displayed in the UI; verify via the API / screenings endpoint.
