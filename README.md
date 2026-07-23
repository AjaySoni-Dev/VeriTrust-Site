<h1 align="center">VeriTrust</h1>

<p align="center">
  <strong>AI-Powered Digital Trust and Threat Detection Platform</strong><br>
  Static security frontend, Vercel inference proxy, Hugging Face model routing, image verification, and phishing analysis.
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-active%20development-blue">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-HTML%20%2B%20CSS%20%2B%20JS-black">
  <img alt="API" src="https://img.shields.io/badge/API-Vercel%20Functions-lightgrey">
  <img alt="AI" src="https://img.shields.io/badge/AI-Hugging%20Face-yellow">
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Node.js%2020-green">
  <img alt="License" src="https://img.shields.io/badge/license-not%20specified-orange">
</p>

<p align="center">
  <a href="#overview">Overview</a> .
  <a href="#architecture">Architecture</a> .
  <a href="#core-features">Features</a> .
  <a href="#quick-start">Quick Start</a> .
  <a href="#roadmap">Roadmap</a>
</p>

---

## Overview

**VeriTrust** is an AI-assisted security review platform designed to help users evaluate suspicious media and messages through focused detection workflows.

The project currently combines a polished static web interface with server-side inference endpoints that protect the Hugging Face access token from browser exposure.

Core workflow:

```text
User Input
     |
     v
Static VeriTrust Interface
     |
     v
Vercel Serverless API Proxy
     |
     v
Hugging Face Model Inference
     |
     v
Normalized Risk Result
```

The platform is built around three primary review modules:

- deepfake and synthetic-media image detection
- phishing, scam, and suspicious-message detection
- Link Intelligence for suspicious URLs, shortened links, and domain impersonation patterns
- optional face-crop preprocessing for image analysis
- normalized verdicts with confidence, risk level, and explanatory output
- public documentation and authentication-facing UI screens

> [!IMPORTANT]
> VeriTrust is currently an active development project. It should be treated as a functional prototype and deployment-ready static/API bundle, not as a finalized enterprise security product.

---

## Architecture

The current architecture follows a static frontend plus protected inference-proxy model:

```text
Browser Pages
     |
     v
Shared Frontend Assets
     |
     v
/api/health, /api/deepfake, /api/phishing, /api/link-check
     |
     v
Shared API Utilities
     |
     v
Hugging Face Router / Inference API
     |
     v
Structured VeriTrust Verdict
```

The deployed Vercel route model supports clean public routes such as:

```text
/detection
/deepfake
/phishing
/link-check
/docs
/api/health
/api/deepfake
/api/phishing
/api/link-check
```

The repository also keeps a `legacy-php/` folder as reference code only. Vercel deployment uses only the JavaScript files inside `api/`.

---

## Core Features

| Area | Current State | Description |
|---|---:|---|
| Landing website | Active | Public-facing VeriTrust marketing and product overview page |
| Detection hub | Active | Entry page for selecting image or message review workflows |
| Deepfake detection | Active | Image upload workflow using Hugging Face vision classifiers |
| Phishing detection | Active | Text, email, SMS, and URL review workflow using classifier/chat models |
| Link Intelligence | Active | URL string analysis for suspicious links, shortened URLs, unsafe URL patterns, and domain impersonation indicators |
| Model fallback | Active | API endpoints can attempt a backup model when the selected model fails |
| Face preparation | Active | Optional face-crop preprocessing for focused image checks through the browser workflow or `/api/v1/deepfake` |
| Server-side token handling | Active | Hugging Face token is read from environment variables on the server |
| Vercel deployment | Active | Serverless functions, rewrites, headers, and static asset caching are configured |
| Risk engine | Active | Shared deterministic risk levels, confidence bands, phishing indicators, and safe summaries |
| Report exports | Active | Successful scans can be downloaded as JSON, printed/saved as PDF, and copied as summaries |
| Legacy PHP reference | Excluded from Vercel | PHP inference endpoints are retained only as non-production reference code |
| Authentication UI | Active with Supabase | Login, signup, password recovery, session checks, and dashboard access use Supabase Auth through server-managed HttpOnly cookies |
| Developer API | Active | API-key management plus `/api/v1/deepfake`, `/api/v1/phishing`, `/api/v1/link-check`, and `/api/v1/usage` |
| API key security | Active | Raw keys are shown once; only hashes, prefixes, masked values, scopes, and usage metadata are stored |
| Legal and trust pages | Active | Privacy, Terms, Security, Disclaimer, Developers, Docs, and Model Performance pages are available |
| Production protection | Active | CORS allow-listing, clean API errors, Supabase-backed daily rate limits, and security headers are configured |
| Coming soon | Not implemented | Video analysis, browser extension, official SDKs, webhooks, and enterprise analytics |

---

## Design Philosophy

VeriTrust focuses on:

```text
Clear AI security triage
instead of
opaque model output.
```

The implementation prioritizes:

- protected server-side AI access
- readable verdict normalization
- focused detection tools rather than a general chatbot interface
- fast deployment through static pages and Vercel functions
- reusable browser-side result rendering
- simple migration support through legacy PHP endpoints

The project is intentionally structured so the public website, detection interface, API proxy, and model-specific parsing logic remain separate.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| HTML | Static public pages and tool screens |
| CSS | Responsive VeriTrust interface styling |
| JavaScript | Browser interactions, uploads, model selection, and result rendering |
| Node.js 20 | Vercel serverless function runtime |
| Vercel Functions | Protected API proxy endpoints |
| Busboy | Multipart image upload parsing |
| Hugging Face Router | Model inference routing |
| Hugging Face Inference API | Fallback model inference path |
| PHP | Legacy reference endpoint implementation |

---

## AI Models

| Module | Model Key | Display Name | Provider path |
|---|---|---|---|
| Deepfake | `pixel` | VeriTrust Pixel | Server-only environment variable |
| Deepfake | `prism` | VeriTrust Prism | Server-only environment variable |
| Phishing | `mailguard` | VeriTrust MailGuard | Server-only environment variable |
| Phishing | `cortex` | VeriTrust Cortex | Server-only environment variable |
| Link Intelligence | `swift` | VeriTrust Swift | Server-only environment variable |
| Link Intelligence | `sentinel` | VeriTrust Sentinel | Locked |

Provider repository identifiers are not stored in frontend code, returned in scan payloads, or listed in public documentation.

---

## Repository Structure

```text
VeriTrust/
|-- api/                  # Vercel serverless API endpoints
|   |-- client-config.js   # Public browser runtime config endpoint
|   |-- deepfake.js        # Image deepfake detection proxy
|   |-- health.js          # Public health endpoint with optional admin diagnostics
|   |-- link-check.js      # Link Intelligence web scan endpoint
|   `-- phishing.js        # Message phishing detection proxy
|-- assets/
|   |-- css/
|   |   |-- tool-pages.css # Detection tool page styling
|   |   `-- veritrust.css  # Shared site and documentation styling
|   `-- js/
|       |-- config.js      # Browser runtime endpoint configuration
|       |-- detection.js   # Detection workflow and result rendering logic
|       |-- link-check.js  # Link Intelligence page logic
|       `-- site.js        # Navigation and auth UI interactions
|-- legacy-php/            # Legacy reference code excluded from Vercel
|-- lib/
|   |-- risk-engine.js     # Shared risk, confidence, indicator, and summary logic
|   |-- link-intelligence.js # Link parsing, rules, scoring, and result shaping
|   `-- veritrust-api.js   # Shared Node API helpers and model utilities
|-- auth.html              # Login/signup interface prototype
|-- deepfake.html          # Image detection workspace
|-- detection.html         # Detection module selection page
|-- docs.html              # User-facing platform guide
|-- index.html             # Public landing page
|-- link-check.html        # Link Intelligence workspace
|-- phishing.html          # Message detection workspace
|-- brand.png              # Brand image asset
|-- logo.png               # Logo asset
|-- package.json           # Scripts, dependencies, and runtime metadata
|-- vercel.json            # Vercel routes, headers, and function config
`-- README.md
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a local environment file for development or configure these variables in Vercel:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=
HF_DEEPFAKE_PIXEL_MODEL=
HF_DEEPFAKE_PRISM_MODEL=
HF_PHISHING_MAILGUARD_MODEL=
HF_PHISHING_CORTEX_MODEL=
HF_LINK_SWIFT_MODEL=
VERITRUST_ALLOWED_ORIGINS=
VERITRUST_SITE_URL=
VERITRUST_WEBHOOK_ALLOWED_HOSTS=
ADMIN=
CONTENT_HMAC=
WEBHOOK_ENCRYPTION=
DISPATCH=
VERITRUST_GATEWAY_SERVERLESS_BATCH=1
```

The API also accepts `HF_ACCESS_TOKEN` instead of `HF_TOKEN`. Model paths can alternatively be supplied in one JSON object named `HF_MODEL_PATHS`, using the keys `deepfake_pixel`, `deepfake_prism`, `phishing_mailguard`, `phishing_cortex`, and `link_swift`. `ADMIN` is optional and enables private diagnostics on `/api/health`. `CONTENT_HMAC` must contain at least 32 random bytes; `WEBHOOK_ENCRYPTION` must be a 32-byte key encoded as 64 hexadecimal characters; `DISPATCH` must be the same 32+ character random value stored by migration 003 in Supabase Vault. Never expose any of these server values in browser JavaScript.

### Developer API

Logged-in users can create API keys from the dashboard and call VeriTrust from secure backends, Python scripts, Jupyter notebooks, and automation workflows.

Available endpoints:

```text
POST /api/v1/phishing
POST /api/v1/deepfake
POST /api/v1/link-check
GET  /api/v1/usage
GET  /api/api-keys
POST /api/api-keys
DELETE /api/api-keys?id={key_id}
```

Authenticate external API calls with:

```http
Authorization: Bearer vtg_live_YOUR_API_KEY
```

Raw API keys are returned only once when created. VeriTrust stores `key_hash`, `key_prefix`, `masked_key`, owner metadata, scopes, status, timestamps, and usage limits. It does not store the raw key.

Default API key scopes:

```text
deepfake:scan
phishing:scan
link:scan
usage:read
```

Example phishing request:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/phishing" \
  -H "Authorization: Bearer vtg_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Your account will be blocked. Verify your password now.","model":"fast"}'
```

Example deepfake request:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/deepfake" \
  -H "Authorization: Bearer vtg_live_YOUR_API_KEY" \
  -F "image=@sample.jpg" \
  -F "model=fast" \
  -F "crop=true"
```

Example Link Intelligence request:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/link-check" \
  -H "Authorization: Bearer vtg_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://secure-bank-verify-example.com/login",
    "model": "swift"
  }'
```

Python example:

```python
import requests

API_KEY = "vtg_live_YOUR_API_KEY"
BASE_URL = "https://YOUR_DOMAIN"

response = requests.post(
    f"{BASE_URL}/api/v1/phishing",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"text": "Your account will be blocked. Verify your password now.", "model": "fast"},
    timeout=60,
)

data = response.json()
print(data["result"]["label"])
print(data["result"]["risk_level"])
print(data["result"]["confidence"])
```

Python Link Intelligence example:

```python
import requests

API_KEY = "vtg_live_YOUR_API_KEY"
BASE_URL = "https://YOUR_DOMAIN"

payload = {
    "url": "https://secure-bank-verify-example.com/login",
    "model": "swift"
}

response = requests.post(
    f"{BASE_URL}/api/v1/link-check",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json=payload,
    timeout=60
)

data = response.json()

print(data["result"]["label"])
print(data["result"]["risk_level"])
print(data["result"]["confidence"])
print(data["result"]["summary"])
```

Jupyter users should load keys from environment variables:

```python
import os
import requests

API_KEY = os.getenv("VERITRUST_API_KEY")
```

Never hardcode production API keys in public notebooks, frontend JavaScript, repositories, or logs.

### Supabase Schema Setup

Apply `docs/supabase-production-schema.sql` before production use. Existing projects should also run the Prompt 3 developer API upgrade block at the bottom of that file. It adds `masked_key`, `usage_limit_daily`, `revoked_at`, `user_id`, and `api_usage_events` without dropping existing rows.
For Link Intelligence upgrades, the same schema file adds the `link` scan type, VeriTrust Swift and VeriTrust Sentinel model rows, `link_count`, and the default `link:scan` API key scope.

### Legal And Trust Pages

The static trust/legal pages are:

```text
/privacy
/terms
/security
/disclaimer
/developers
/model-performance
```

### 3. Validate JavaScript syntax

```bash
npm run check
```

### 4. Start the local Vercel runtime

```bash
npm run start
```

This runs:

```bash
vercel dev
```

### 5. Confirm API readiness

Open:

```text
/api/health
```

A correctly configured runtime should return a JSON response with:

```json
{
  "ok": true,
  "service": "VeriTrust API",
  "status": "operational"
}
```

---

## API Reference

### Unified Security Gateway (feature-gated)

The production gateway foundation is available under `/api/v1/gateway`. It uses the verified gateway schema, tenant-scoped Supabase or API-key authentication, atomic idempotency, normalized evidence, deterministic correlation, and advisory-first policy enforcement.

- `POST /api/v1/gateway/scans` submits text and URL content. `Idempotency-Key` is required.
- `GET /api/v1/gateway/scans` lists tenant-scoped gateway scans.
- `GET /api/v1/gateway/scans/{id}` returns status, artifacts, evidence, and the current decision.
- `POST /api/v1/gateway/scans/{id}/cancel` requests idempotent cancellation.
- `GET /api/v1/gateway/reports/{id}` returns the unified audit report.

The machine-readable alpha contract is in `openapi/veritrust-gateway-v1.yaml`. Private signed media uploads, durable PGMQ jobs, bounded Vercel media/webhook/retention workers, immediate `pg_net` dispatch, and one-minute Supabase Cron recovery are implemented. Enforcement remains advisory-first and organization activation should still be limited to approved pilots.

### Health Check

```http
GET /api/health
```

Returns public operational status only. Private diagnostics are available only when `ADMIN` (or `VERITRUST_ADMIN_SECRET`) is configured and the request includes `X-VeriTrust-Admin-Secret`.

### Deepfake Detection

```http
POST /api/deepfake
Content-Type: multipart/form-data
```

Expected fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `image` | File | Yes | JPG, PNG, WEBP, or BMP image |
| `model` | String | No | `pixel` or `prism` |

Current Vercel image limit:

```text
4 MB
```

### Phishing Detection

```http
POST /api/phishing
Content-Type: application/json
```

Expected body:

```json
{
  "text": "Suspicious email, SMS, URL, or message content",
  "model": "mailguard"
}
```

Supported model values:

```text
mailguard
cortex
```

Current text limit:

```text
12,000 characters
```

### Link Intelligence

```http
POST /api/link-check
Content-Type: application/json
```

Expected body:

```json
{
  "url": "https://example.com/login",
  "context": "Optional surrounding email, SMS, or message text",
  "model": "swift"
}
```

Supported model values:

```text
swift
```

If `model` is missing, VeriTrust uses `swift`. VeriTrust Sentinel is locked and coming soon; requests for `sentinel` currently return `INVALID_MODEL`.

### Result Payloads

Successful scans return report-ready metadata:

```json
{
  "scan_id": "...",
  "scan_type": "deepfake",
  "created_at": "...",
  "model": {
    "key": "pixel",
    "name": "VeriTrust Pixel",
    "fallback_used": false
  },
  "result": {
    "label": "Fake",
    "confidence": 0.87,
    "risk_level": "High",
    "confidence_band": "Strong",
    "summary": "AI-assisted summary text",
    "evidence": []
  },
  "report": {
    "title": "VeriTrust Scan Report",
    "exportable": true
  }
}
```

Risk levels are `Low`, `Medium`, `High`, and `Critical`. Confidence bands are `Weak`, `Moderate`, and `Strong`. These values are triage aids, not legal, forensic, or final proof.

Deepfake evidence is limited to safe model-score facts such as fake score, real score, confidence band, accepted image type, fallback model use, and manual-review guidance. VeriTrust does not claim visual forensic evidence unless a model explicitly returns it.

Phishing results combine the model score with deterministic rule indicators for urgency, credential requests, OTP/password language, payment or refund wording, KYC/account blocking pressure, attachments, URL shorteners, suspicious domains, sender identity, and contact methods. Low-risk results mean no strong indicators were found from available signals; they do not prove safety.

Link Intelligence results combine model output with deterministic URL indicators such as URL shorteners, IP-address URLs, punycode/IDN patterns, long domains, excessive hyphens or subdomains, suspicious TLDs, missing HTTPS, login/KYC/payment terms, India-relevant scam terms, credential terms, brand impersonation patterns, redirect parameters, encoded URLs inside query strings, and random-looking tokens.

Link Intelligence MVP limitations:

- VeriTrust Sentinel is locked and coming soon.
- The MVP analyzes URL strings and optional context; it does not fetch target webpages or follow redirects.
- No real-time WHOIS, domain-age, reputation, or security-engine blocklist lookup is included.

Browser PDF export uses a print window with a dark one-page A4 report layout. `print-color-adjust` is enabled so supported browsers preserve the dark VeriTrust background; some browsers may still require background graphics to be enabled in the print dialog.

---

## Runtime Configuration

Browser-side endpoint configuration lives in:

```text
assets/js/config.js
```

Current face-crop Space configuration:

```js
cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image'
cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space'
```

Update these values only if the external face-crop service changes.

External API users do not need to call the crop Space directly. Send `crop=true` to `POST /api/v1/deepfake` and VeriTrust will attempt face-crop preprocessing server-side, then fall back to the full image when a crop is unavailable.

---

## Deployment

### Vercel Deployment

Recommended deployment workflow:

```text
Push Repository
     |
     v
Import Project in Vercel
     |
     v
Set required environment variables
     |
     v
Deploy Static Pages + API Functions
     |
     v
Verify /api/health
```

Vercel-specific behavior is configured in `vercel.json`:

- clean URLs enabled
- `/detection`, `/deepfake`, `/phishing`, `/docs`, `/dashboard`, and `/model-performance` rewrites
- 300-second maximum function duration for bounded gateway media work
- six logical Hobby-compatible function entrypoints (`account`, `billing`, `detection`, `gateway`, `system`, and `v1`); underscore-prefixed route handlers are bundled dependencies, not separate Vercel Functions
- immutable caching for `/assets/*`
- security headers for content type sniffing, referrer policy, permissions policy, and frame denial

Required Vercel environment variables:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=
HF_DEEPFAKE_PIXEL_MODEL=
HF_DEEPFAKE_PRISM_MODEL=
HF_PHISHING_MAILGUARD_MODEL=
HF_PHISHING_CORTEX_MODEL=
HF_LINK_SWIFT_MODEL=
VERITRUST_ALLOWED_ORIGINS=
VERITRUST_SITE_URL=https://www.veritrustlab.in
VERITRUST_WEBHOOK_ALLOWED_HOSTS=hooks.example.edu
CONTENT_HMAC=
WEBHOOK_ENCRYPTION=
DISPATCH=
VERITRUST_GATEWAY_SERVERLESS_BATCH=1
```

`HF_ACCESS_TOKEN` may be used instead of `HF_TOKEN`. `VERITRUST_ALLOWED_ORIGINS` is a comma-separated list, for example:

```env
VERITRUST_ALLOWED_ORIGINS=https://veritrustlab.in,https://www.veritrustlab.in,http://localhost:3000,http://localhost:3001
```

Optional:

```env
ADMIN=
```

Gateway serverless deployment order:

1. Generate one random 32+ character dispatch secret and set it as `DISPATCH` in Vercel for Production and Preview as appropriate.
2. Deploy the repository so `https://YOUR-DOMAIN/api/gateway-worker` exists.
3. Edit only the worker URL and worker secret at the top of `docs/migrations/003_gateway_serverless_dispatch_forward.sql`, then run the complete migration in the Supabase SQL Editor.
4. Run `docs/migrations/003_gateway_serverless_dispatch_verify.sql`; every row, including `OVERALL VERDICT`, must be `PASS`.
5. Run the optional live dispatch query printed at the bottom of the verification file and confirm the corresponding `net._http_response.status_code` is `200`.

Migration 003 keeps the Vercel endpoint private, stores its signing key only in Supabase Vault, authenticates each request with a five-minute timestamped HMAC and unique nonce, dispatches new queue jobs asynchronously after commit, and schedules a one-minute recovery invocation. PGMQ leases and dedupe keys remain the durability and concurrency authority, so duplicate HTTP invocations cannot claim the same active job.

When `ADMIN` is set, `/api/health` accepts `X-VeriTrust-Admin-Secret` for private diagnostics. Without that header, health returns only public operational status. Apply `docs/supabase-production-schema.sql` in Supabase before production use so the `api_rate_limits` table and `consume_api_rate_limit` RPC exist.

Configure secrets only in Vercel Environment Variables or local ignored `.env` files. Never store Hugging Face, Supabase service-role, or admin secret values in repository files.

`VERITRUST_SITE_URL` is mandatory in production billing deployments and must be the HTTPS origin that Stripe may return users to. Gateway webhook delivery is disabled in production until `VERITRUST_WEBHOOK_ALLOWED_HOSTS` contains the exact approved receiver hostnames (a leading `*.` wildcard is supported for a controlled subdomain).

If a Hugging Face token was ever committed or shared, rotate/regenerate it immediately from the Hugging Face dashboard.

### Legacy PHP Reference

The `legacy-php/` folder is legacy reference code only and is excluded from Vercel deployment by `.vercelignore`. The production API uses the Node.js serverless routes in `/api`.

Legacy Hugging Face token lookup supports environment variables only:

- `HF_ACCESS_TOKEN`
- `HF_TOKEN`
- the same five `HF_*_MODEL` variables listed above

> [!WARNING]
> Do not deploy `legacy-php/` without separate hardening.

### Model Performance

The `model-performance.html` page documents evaluation status honestly. Accuracy, precision, recall, F1, false positive rates, false negative rates, and confusion matrices must be calculated on labeled test datasets before publication. Benchmark numbers should not be invented or inferred from ad hoc scans.

---

## Planned Workflow

```text
User opens VeriTrust
        |
        v
Chooses detection module
        |
        v
Uploads image or pastes message
        |
        v
Frontend sends request to protected API
        |
        v
Server calls configured AI model
        |
        v
Result is normalized into verdict, confidence, risk, and explanation
```

---

## Current Limitations

Current limitations include:

- Supabase authentication and scan persistence require the production schema and Vercel environment variables
- the free-tier serverless worker is intended for an MVP workload; capacity, invocation, bandwidth, and external-model quotas still require monitoring
- serverless rate limiting requires the `api_rate_limits` table and `consume_api_rate_limit` RPC from the production schema
- existing Supabase projects created before Critical risk support must run: `alter type public.risk_level add value if not exists 'critical';`
- billing and paid-plan enforcement are not implemented beyond basic plan-aware daily limits
- AI results depend on external Hugging Face model availability and latency
- Vercel image uploads are limited to 4 MB in the current Node endpoint
- model explanations are normalized for usability and should not be treated as legal, forensic, or final proof
- false positives and false negatives are possible; verify suspicious messages through official channels
- face-crop preprocessing depends on the configured external crop service, but `/api/v1/deepfake` callers use only the VeriTrust API URL
- no standalone `LICENSE` file is currently included

> [!WARNING]
> VeriTrust can support security triage, but AI-generated verdicts should be reviewed with human judgment before high-impact decisions are made.

---

## Roadmap

Immediate development priorities:

- add structured logging and production observability
- add automated migration checks for Supabase production schema changes
- improve model result calibration and confidence messaging
- add automated endpoint and browser workflow tests
- document API examples with request and response samples

Long-term exploration:

- organization accounts and role-based access control
- dashboard analytics for reviewed threats
- batch analysis workflows
- human review queues for high-risk results
- pluggable model providers beyond Hugging Face
- enterprise API keys and usage metering
- privacy controls for sensitive message and image handling

---

## Usage Direction

| Use Case | Recommended Workflow |
|---|---|
| Review suspicious images | Use the Deepfake Detection workspace |
| Review suspicious messages | Use the Phishing Detection workspace |
| Review suspicious URLs | Use the Link Intelligence workspace |
| Check deployment health | Open `/api/health` after configuring Vercel environment variables |
| Change AI endpoints | Update model definitions in `lib/veritrust-api.js` and `lib/link-intelligence.js` |
| Review model evaluation status | Open `/model-performance` |
| Export scan reports | Use Download JSON Report, Save PDF Report, or Copy Summary on successful results |
| Change browser API routes | Update `assets/js/config.js` |
| Deploy on Vercel | Use the JavaScript endpoints in `api/` |
| Review legacy PHP reference | Inspect `legacy-php/`, which is excluded from Vercel deployment |
| Adjust visual design | Edit `assets/css/veritrust.css` and `assets/css/tool-pages.css` |

---

## Security Notes

- Never expose Hugging Face tokens or model-path environment variables in browser JavaScript or API responses.
- Browser access and refresh tokens are kept in Secure, HttpOnly, SameSite session cookies; do not move them into local storage, session storage, or page JavaScript.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN`, `CONTENT_HMAC`, `WEBHOOK_ENCRYPTION`, or `DISPATCH` in browser JavaScript.
- Do not commit `.env`, `.env.local`, `.env.*.local`, `private/`, logs, `node_modules/`, or private token files.
- Keep `private/` and `legacy-php/` excluded from Vercel deployment when using the Node API path.
- If a Hugging Face token was ever committed or shared, rotate/regenerate it immediately from the Hugging Face dashboard.
- Treat uploaded images and pasted messages as potentially sensitive user data.
- Keep the Supabase production schema applied so serverless rate limiting remains active.

---

## License

No standalone license file is currently included in this repository.

Add a formal license before distributing VeriTrust as an open-source or commercial package.
