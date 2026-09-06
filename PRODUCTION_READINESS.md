# Analysis module readiness

## Implemented hardening

- Deepfake rejects malformed, duplicate, missing, and unmapped classes. Both `Real` and `Fake` probabilities are required, each in [0, 1], summing to one within 0.02. A provider using different class labels needs an explicitly verified adapter; numeric labels are never guessed.
- Swift validates the bundled binary `BENIGN` / `MALWARE` model contract. Invalid evidence raises an analysis error rather than producing a safe verdict.
- Deepfake and Link show unavailable scores as unavailable. Risk bars represent the risk score, not classification confidence. Deepfake failures no longer display low risk.
- Shared browser utilities provide score presentation, Gateway input validation, scan status wording, and bounded requests. Request timeouts do not imply that server processing was cancelled.
- Gateway validates all input before uploads, rejects missing or duplicate upload references on the server, and isolates history selection from stale polling responses. Active history scans resume polling. Evidence cards separate verdicts, reasons, and provenance.
- Email input mode and file selection remain locked during submission. Only supported `.eml` files are accepted by the browser.
- PowerShell preserves UTF-8 input, bounds requests, disables redirects, validates the API origin, accepts reusable idempotency keys, and returns a concise default display with complete technical evidence retained as a property.

## Local verification

### Detection workspace and observed progress

Deepfake, Phishing, and Link now share a responsive input, activity, and inline-report structure. Repeated model widgets, result dialogs, prefilled capability lists, and the large marketing footer have been removed from these pages. The email report keeps detailed evidence in an expandable section. Missing scores do not create empty score meters or safe-looking badges.

Browser requests opt into `Accept: application/x-ndjson`. The direct image and link routes and Gateway email routes emit progress frames at actual server execution boundaries. A frame contains `type`, `stage`, `state`, `message`, `sequence`, and `timestamp`. Stage states are running, completed, failed, or skipped. A terminal `result` frame carries the normal JSON payload and its logical HTTP `status`; after streaming starts the transport status is already 200, so clients must inspect that terminal frame. Validation errors before the first frame retain normal HTTP error responses. API clients that do not request streaming retain the existing JSON contract.

There are no scheduled stage transitions or estimated completion percentages. External model inference is shown as pending until its response arrives. Face preparation reports its real request and response boundary because that service does not provide intermediate progress. A disconnected stream never becomes a completed report; the browser tells the user to check saved scan history before retrying.

Browser verification covered image upload, email text, original EML upload, URL submission, controls locked during requests, inline results, and failure recovery using a local test-only server. Desktop and mobile layouts were inspected with no horizontal overflow in the tested mobile views. Test fixture responses are isolated under ignored `tmp/`, which is excluded from deployment. These checks do not establish live provider or database availability. Streaming transport is supported by [Vercel's Node response streaming](https://vercel.com/kb/guide/ship-a-express-app-on-vercel); buffering and end-to-end behavior still need verification on the actual deployment.

Run `npm test`, `node scripts/test-modules.js`, and `powershell -NoProfile -File tests/email-investigation-powershell.smoke.ps1`.

The regression suite exercises real parser and validation functions with controlled fixtures, including malformed model outputs, missing scores, upload references, request deadlines, and late Gateway responses. The PowerShell test intercepts HTTP calls to check request construction and report mapping. These are local regression tests, not evidence that a deployed provider or database is operational.

## Deployment verification still required

The configuration check in the current shell reports missing Supabase settings, an inference token, content HMAC, worker dispatch, and webhook encryption secrets. Cortex also lacks a qualified contract. Populate these through the existing private deployment configuration and run `npm run config:check` in that environment.

The initial repository verifier reports missing README targets (including the migrations directory), legacy page image references, and missing indexing/description metadata. Restore the authoritative migration files and referenced documents; do not reconstruct database migrations from assumptions.

Before release, verify the deployed database schema and model registry, run authenticated image, URL, email text, and original EML scans, and exercise a Gateway private media upload through worker completion, cancellation, history, and report retrieval. Confirm tenant isolation and API-key permissions with separate test workspaces. Run the PowerShell helper against the same authenticated deployment. Check the result screens at desktop and mobile widths.

Detection quality and confidence calibration still require labeled evaluation data. Local contract checks establish consistent handling of evidence, not model accuracy or production readiness.
