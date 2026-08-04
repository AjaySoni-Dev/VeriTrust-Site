<h1 align="center">VeriTrust</h1>

<p align="center">
  <strong>AI-Powered Digital Trust and Threat Detection Platform</strong><br>
  Static security frontend, Vercel serverless APIs, Hugging Face model routing, workspace review, and phishing, link, image, and gateway analysis.
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-active%20development-blue">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-HTML%20%2B%20CSS%20%2B%20JS-black">
  <img alt="API" src="https://img.shields.io/badge/API-Vercel%20Functions-lightgrey">
  <img alt="AI" src="https://img.shields.io/badge/AI-Hugging%20Face-yellow">
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Node.js%2024-green">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-orange">
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

**VeriTrust** is an AI-assisted security review platform designed to help users evaluate suspicious media, messages, links, and combined gateway submissions through focused detection workflows.

The project combines a static multi-page web interface with protected serverless endpoints. Provider tokens, model repository identifiers, Supabase service credentials, billing secrets, and gateway keys remain on the server.

Core workflow:

```text
User Input
     |
     v
Static VeriTrust Interface
     |
     v
Vercel Serverless API
     |
     v
Detection, Workspace, Gateway, or Learning Service
     |
     v
Normalized Risk Result and Saved Review Record
```

The platform includes:

- deepfake and synthetic-media image detection
- phishing, scam, and suspicious-message detection
- Link Intelligence for suspicious URLs and domain impersonation patterns
- unified gateway submissions with policy-backed recommendations
- authenticated workspaces, saved scans, case review, and API keys
- optional face-crop preprocessing for image analysis
- report-ready verdicts with confidence, risk, evidence, and explanations
- private learning, assessment, and credential-preview flows

> [!IMPORTANT]
> VeriTrust is an active development project. AI-assisted results are advisory triage signals, not legal, forensic, or final proof.

---

## Architecture

The current architecture uses static pages plus seven domain-level Vercel function dispatchers:

```text
Browser Pages
     |
     v
Shared Frontend Assets
     |
     v
Seven Public Vercel Function Entrypoints
     |
     v
Private Domain Route Handlers
     |
     +------------------+------------------+------------------+
     |                  |                  |                  |
     v                  v                  v                  v
  Supabase        Hugging Face          Stripe         Gateway Worker
     |
     v
Structured VeriTrust Result
```

Public function entrypoints:

```text
api/account.js
api/billing.js
api/detection.js
api/gateway.js
api/learning.js
api/system.js
api/v1.js
```

Private route implementations live under `lib/routes/` and are bundled as dependencies instead of becoming additional public Vercel functions.

Clean public routes include:

```text
/
/detection
/deepfake
/phishing
/link-check
/gateway
/developers
/docs
/model-performance
/api/health
```

For a deeper technical breakdown, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Core Features

| Area | Current State | Description |
|---|---:|---|
| Landing website | Active | Public VeriTrust marketing and product overview page |
| Detection hub | Active | Entry page for selecting image, message, link, or gateway workflows |
| Deepfake detection | Active | Validated image upload workflow using configured vision classifiers |
| Phishing detection | Active | Email, SMS, and suspicious-message review using model and rule signals |
| Link Intelligence | Active | URL analysis for shorteners, suspicious syntax, impersonation, and risky patterns |
| Unified gateway | Active | Correlated text, URL, and media review with advisory policy decisions |
| Model fallback | Active | Detection services can use approved provider or local fallbacks |
| Face preparation | Active | Optional face-crop preprocessing with full-image fallback |
| Workspace | Active | Saved scans, dashboard summaries, profiles, quotas, and account controls |
| Case review | Active | Tenant-scoped evidence, analyst decisions, priority, and case state |
| Authentication | Active | Supabase authentication through server-managed HttpOnly cookies |
| Developer API | Active | Scoped API keys and versioned deepfake, phishing, link, and usage endpoints |
| Billing | Optional | Stripe checkout, portal, subscription projection, and webhook routes |
| Learning preview | Private | Protected courses, lessons, assessments, administration, and credentials |
| Report exports | Active | JSON, printable PDF, and copied summaries for successful reviews |
| SEO and crawler control | Active | Canonicals, social metadata, JSON-LD, sitemap, robots rules, and private-route noindex |
| Production protection | Active | CSP, HSTS, CORS controls, validation, rate limits, and safe API errors |

---

## Design Philosophy

VeriTrust focuses on:

```text
Clear, cautious security triage
instead of
opaque or overconfident model output.
```

The implementation prioritizes:

- protected server-side access to providers and persistence
- readable verdict normalization
- explicit uncertainty and human-review guidance
- focused detection tools instead of a general chatbot interface
- tenant-scoped workspace and case records
- route-oriented server code with a small Vercel function footprint
- direct static deployment without an unnecessary frontend framework

---

## Tech Stack

| Tool | Purpose |
|---|---|
| HTML | Static public, workspace, learning, and tool pages |
| CSS | Responsive visual system and page-specific layouts |
| JavaScript | Browser workflows, uploads, navigation, and result rendering |
| Node.js 24 | Vercel function and worker runtime |
| Vercel Functions | Protected API endpoints and route dispatchers |
| Supabase | Authentication, persistence, tenant data, quotas, and storage |
| Busboy | Multipart image upload parsing |
| Hugging Face | Configured model inference routing |
| Stripe | Optional subscription and billing integration |

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

Provider repository identifiers are not stored in frontend code, returned in public scan payloads, or listed in public site documentation.

---

## Repository Structure

```text
VeriTrust/
|-- .github/
|   |-- workflows/ci.yml          # GitHub release gate
|   `-- pull_request_template.md  # Pull request checklist
|-- api/                          # Seven public Vercel functions
|-- assets/
|   |-- css/
|   |   |-- base/                 # Shared visual system
|   |   `-- pages/                # Page-specific styles
|   |-- images/                   # Logo and brand assets
|   `-- js/
|       |-- core/                 # Shared browser modules
|       `-- pages/                # Page controllers
|-- docs/
|   |-- ARCHITECTURE.md           # Technical architecture
|   |-- DEPLOYMENT.md             # Vercel release checklist
|   `-- database-schema.json      # Non-executable deployed schema inventory
|-- lib/
|   |-- gateway/                  # Gateway contracts and orchestration
|   |-- learning/                 # Learning repository and validation
|   |-- routes/                   # Private handlers grouped by domain
|   |-- detection-service.js      # Shared detection execution
|   |-- risk-engine.js            # Risk and evidence normalization
|   `-- veritrust-api.js          # API and provider utilities
|-- openapi/
|   `-- veritrust-gateway-v1.yaml # Gateway API contract
|-- scripts/
|   `-- verify.js                 # Consolidated repository validation
|-- worker/                       # Optional background worker runtime
|-- *.html                        # Route-aligned static pages
|-- middleware.ts                 # Learning-preview access middleware
|-- package.json                  # Commands, dependency, and runtime metadata
|-- robots.txt                    # Search crawler policy
|-- sitemap.xml                   # Canonical public route inventory
|-- vercel.json                   # Functions, routes, headers, and redirects
`-- README.md
```

Root HTML files are intentional. Vercel's clean URL handling serves `detection.html` as `/detection` without adding another routing or build layer.

---

## Quick Start

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment variables

Copy the committed example file:

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Environment inventory:

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

VERITRUST_SITE_URL=https://www.veritrustlab.in
VERITRUST_ALLOWED_ORIGINS=https://www.veritrustlab.in,https://veritrustlab.in
VERITRUST_LEARNING_ACCESS_KEY=

VERITRUST_CONTENT_HMAC_KEY=
VERITRUST_GATEWAY_DISPATCH_SECRET=
VERITRUST_WEBHOOK_ENCRYPTION_KEY=
VERITRUST_WEBHOOK_ALLOWED_HOSTS=
VERITRUST_GATEWAY_SYNC_BUDGET_MS=12000
VERITRUST_GATEWAY_SERVERLESS_BATCH=1
VERITRUST_GATEWAY_WORKER_ID=veritrust-worker-1

VERITRUST_ADMIN_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`HF_ACCESS_TOKEN` may be used instead of `HF_TOKEN`. Model paths can alternatively be supplied through `HF_MODEL_PATHS`. Keep every populated value in Vercel Environment Variables or an ignored local environment file.

> [!WARNING]
> Never expose Supabase service credentials, provider tokens, Stripe secrets, gateway keys, or learning-preview secrets in browser JavaScript.

### 3. Validate the repository

```bash
npm run check
```

This checks JavaScript syntax, local page links, SEO metadata, crawler files, Vercel function limits, security controls, common committed-secret patterns, and obsolete artifacts.

### 4. Start the local Vercel runtime

```bash
npm start
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

A configured runtime returns a public health response without exposing private diagnostic values.

### Database requirement

The application expects an existing Supabase project that matches [`docs/database-schema.json`](docs/database-schema.json). The cleaned repository intentionally excludes local seed SQL, experimental migrations, rollback samples, and database test queries.

The schema inventory is documentation, not an executable migration. Manage production database changes through the controlled database project that owns the deployed schema.

---

## Developer API

Authenticated users can create scoped API keys and call VeriTrust from secure backends, Python scripts, notebooks, and automation workflows.

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

Authentication:

```http
Authorization: Bearer vtg_live_YOUR_API_KEY
```

Raw API keys are returned only once. VeriTrust stores the key hash, prefix, masked value, owner metadata, scopes, status, timestamps, and usage limits.

Example phishing request:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/phishing" \
  -H "Authorization: Bearer vtg_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Your account will be blocked. Verify your password now.","model":"mailguard"}'
```

Example deepfake request:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/deepfake" \
  -H "Authorization: Bearer vtg_live_YOUR_API_KEY" \
  -F "image=@sample.jpg" \
  -F "model=pixel" \
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
import os
import requests

api_key = os.getenv("VERITRUST_API_KEY")
base_url = "https://YOUR_DOMAIN"

response = requests.post(
    f"{base_url}/api/v1/phishing",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "text": "Your account will be blocked. Verify your password now.",
        "model": "mailguard",
    },
    timeout=60,
)

result = response.json()["result"]
print(result["label"])
print(result["risk_level"])
print(result["confidence"])
```

Never hardcode production API keys in public notebooks, frontend JavaScript, repositories, or logs.

---

## API Reference

### Unified Security Gateway

The gateway is available under `/api/v1/gateway`.

- `POST /api/v1/gateway/scans` submits text, URLs, and registered media. `Idempotency-Key` is required.
- `GET /api/v1/gateway/scans` lists tenant-scoped gateway scans.
- `GET /api/v1/gateway/scans/{id}` returns status, artifacts, evidence, and the current decision.
- `POST /api/v1/gateway/scans/{id}/cancel` requests idempotent cancellation.
- `GET /api/v1/gateway/reports/{id}` returns the unified audit report.

The machine-readable contract is [`openapi/veritrust-gateway-v1.yaml`](openapi/veritrust-gateway-v1.yaml).

### Health Check

```http
GET /api/health
```

Public requests receive operational status only. Private diagnostics require `VERITRUST_ADMIN_SECRET` and the `X-VeriTrust-Admin-Secret` request header.

### Deepfake Detection

```http
POST /api/deepfake
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `image` | File | Yes | Validated JPG, PNG, WEBP, or BMP image |
| `model` | String | No | `pixel` or `prism` |

### Phishing Detection

```http
POST /api/phishing
Content-Type: application/json
```

```json
{
  "text": "Suspicious email, SMS, or message content",
  "model": "mailguard"
}
```

Supported model values:

```text
mailguard
cortex
```

### Link Intelligence

```http
POST /api/link-check
Content-Type: application/json
```

```json
{
  "url": "https://example.com/login",
  "context": "Optional surrounding message text",
  "model": "swift"
}
```

VeriTrust Sentinel remains locked. Requests for `sentinel` return `INVALID_MODEL`.

### Result Payloads

Successful scans return normalized, report-ready metadata:

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
    "summary": "AI-assisted summary text"
  }
}
```

Risk levels and confidence bands are triage aids. False positives and false negatives remain possible.

---

## Runtime Configuration

Browser-side endpoint configuration lives in:

```text
assets/js/core/config.js
```

Current face-crop service configuration:

```js
cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image'
cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space'
```

External API users do not need to call the crop service directly. Send `crop=true` to `/api/v1/deepfake`; VeriTrust falls back to the full image when crop preparation is unavailable.

---

## Deployment

### Vercel Deployment

Recommended workflow:

```text
Push Repository to GitHub
     |
     v
Import Project in Vercel
     |
     v
Choose Lowercase Project Name
     |
     v
Configure Environment Variables
     |
     v
Deploy Static Pages and API Functions
     |
     v
Verify /api/health and One Detection Flow
```

Vercel-specific behavior in `vercel.json` includes:

- clean extensionless HTML URLs
- seven logical function entrypoints
- 60-second Hobby-compatible function limits
- permanent `/scans` to `/cases` redirect
- no-store API responses and crawler exclusion headers
- revalidated static asset caching
- CSP, HSTS, anti-framing, MIME-sniffing, referrer, and permissions protections

Use a lowercase Vercel project name such as `veritrust-site`. The canonical production origin is currently:

```text
https://www.veritrustlab.in
```

If the production domain changes, update page canonicals, JSON-LD, `robots.txt`, `sitemap.xml`, `VERITRUST_SITE_URL`, allowed origins, and the public-page map in `scripts/verify.js` together.

Complete deployment instructions are available in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Planned Workflow

```text
User opens VeriTrust
        |
        v
Chooses a review module
        |
        v
Uploads an image or supplies message/link content
        |
        v
Frontend calls a protected server route
        |
        v
Server validates identity, quota, and input
        |
        v
Configured analysis and fallback logic run
        |
        v
Result is normalized and saved for review
```

---

## Current Limitations

- Authentication, persistence, quotas, and case management require the deployed Supabase schema and environment variables.
- This repository documents the expected schema but does not contain executable migrations or seed SQL.
- Model inference depends on external provider availability, latency, and quotas.
- Vercel functions are bounded to the Hobby-compatible execution window.
- Optional face preparation depends on the configured external crop service.
- Stripe routes require a correctly configured Stripe account and webhook secret.
- Gateway processing requires matching deployed persistence, queue, storage, and dispatch configuration.
- Accuracy, precision, recall, F1, false-positive rates, and false-negative rates must come from labeled evaluation datasets.
- AI results must be verified through official channels before high-impact action.

> [!WARNING]
> VeriTrust supports security triage, but AI-generated verdicts should always be reviewed with human judgment.

---

## Roadmap

Immediate priorities:

- production observability and structured operational dashboards
- controlled database migration ownership and release verification
- broader labeled model evaluation and confidence calibration
- maintained endpoint and browser regression coverage outside the deploy bundle
- improved gateway operations and failure recovery
- expanded API examples and SDK guidance

Long-term exploration:

- batch analysis workflows
- enterprise identity and expanded role controls
- pluggable model providers beyond Hugging Face
- privacy controls for highly sensitive content
- human review queues and escalation policies
- organization-level analytics and reporting

---

## Usage Direction

| Use Case | Recommended Workflow |
|---|---|
| Review suspicious images | Use `/deepfake` |
| Review suspicious messages | Use `/phishing` |
| Review suspicious URLs | Use `/link-check` |
| Correlate multiple artifacts | Use `/gateway` |
| Review saved evidence | Use `/cases` |
| Check deployment health | Open `/api/health` |
| Review API documentation | Open `/developers` or `/docs` |
| Review model evaluation status | Open `/model-performance` |
| Change browser API routes | Update `assets/js/core/config.js` |
| Change shared browser behavior | Update `assets/js/core/` |
| Change page behavior | Update `assets/js/pages/` |
| Adjust shared visual styling | Update `assets/css/base/` |
| Deploy on Vercel | Use the seven functions in `api/` |

---

## Security Notes

- Never expose provider tokens or model-path variables in browser JavaScript or public API responses.
- Keep browser access and refresh tokens in Secure, HttpOnly, SameSite cookies.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, gateway secrets, Stripe secrets, or the learning-preview key.
- Do not commit `.env`, private data, logs, generated reports, database exports, or populated credential files.
- Keep `private/`, `node_modules/`, local Vercel state, and temporary output excluded from Git and deployment.
- Preserve tenant filtering, upload validation, rate limits, CSP, and trusted-origin checks.
- Rotate any credential that may have been committed or shared.
- Treat uploaded images, messages, links, scan history, and case evidence as sensitive data.

Report suspected vulnerabilities privately through the process in [`SECURITY.md`](SECURITY.md).

---

## License

This repository is licensed under the [MIT License](LICENSE).
