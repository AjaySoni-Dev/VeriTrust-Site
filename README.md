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

The platform is built around two primary review modules:

- deepfake and synthetic-media image detection
- phishing, scam, and suspicious-message detection
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
/api/health, /api/deepfake, /api/phishing
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
/docs
/api/health
/api/deepfake
/api/phishing
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
| Model fallback | Active | API endpoints can attempt a backup model when the selected model fails |
| Face preparation | Active | Optional external Hugging Face Space crop workflow for focused image checks |
| Server-side token handling | Active | Hugging Face token is read from environment variables on the server |
| Vercel deployment | Active | Serverless functions, rewrites, headers, and static asset caching are configured |
| Risk engine | Active | Shared deterministic risk levels, confidence bands, phishing indicators, and safe summaries |
| Report exports | Active | Successful scans can be downloaded as JSON, printed/saved as PDF, and copied as summaries |
| Legacy PHP reference | Excluded from Vercel | PHP inference endpoints are retained only as non-production reference code |
| Authentication UI | Prototype | Login/signup interface exists, but no auth backend is connected in this repo |
| Production protection | Active | CORS allow-listing, clean API errors, Supabase-backed daily rate limits, and security headers are configured |
| Persistent user accounts | Planned | Account storage, sessions, and role workflows are not implemented |

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

| Module | Model Key | Display Name | Provider | Model |
|---|---|---|---|---|
| Deepfake | `pixel` | VeriTrust Pixel | `hf-inference` | `Wvolf/ViT_Deepfake_Detection` |
| Deepfake | `prism` | VeriTrust Prism | `hf-inference` | `dima806/deepfake_vs_real_image_detection` |
| Phishing | `mailguard` | VeriTrust MailGuard | `hf-inference` | `cybersectony/phishing-email-detection-distilbert_v2.4.1` |
| Phishing | `cortex` | VeriTrust Cortex | `featherless-ai` | `odedovadia/Llama-3.2-1B-Instruct-phishing-detection` |

---

## Repository Structure

```text
VeriTrust/
|-- api/                  # Vercel serverless API endpoints
|   |-- client-config.js   # Public browser runtime config endpoint
|   |-- deepfake.js        # Image deepfake detection proxy
|   |-- health.js          # Public health endpoint with optional admin diagnostics
|   `-- phishing.js        # Message phishing detection proxy
|-- assets/
|   |-- css/
|   |   |-- tool-pages.css # Detection tool page styling
|   |   `-- veritrust.css  # Shared site and documentation styling
|   `-- js/
|       |-- config.js      # Browser runtime endpoint configuration
|       |-- detection.js   # Detection workflow and result rendering logic
|       `-- site.js        # Navigation and auth UI interactions
|-- legacy-php/            # Legacy reference code excluded from Vercel
|-- lib/
|   |-- risk-engine.js     # Shared risk, confidence, indicator, and summary logic
|   `-- veritrust-api.js   # Shared Node API helpers and model utilities
|-- auth.html              # Login/signup interface prototype
|-- deepfake.html          # Image detection workspace
|-- detection.html         # Detection module selection page
|-- docs.html              # User-facing platform guide
|-- index.html             # Public landing page
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
VERITRUST_ALLOWED_ORIGINS=
VERITRUST_ADMIN_SECRET=
```

The API also accepts `HF_ACCESS_TOKEN` instead of `HF_TOKEN`. `VERITRUST_ADMIN_SECRET` is optional and enables private diagnostics on `/api/health`. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `HF_ACCESS_TOKEN`, `HF_TOKEN`, or `VERITRUST_ADMIN_SECRET` in browser JavaScript. Secrets must be configured through environment variables only and never stored in project files.

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

### Health Check

```http
GET /api/health
```

Returns public operational status only. Private diagnostics are available only when `VERITRUST_ADMIN_SECRET` is configured and the request includes `X-VeriTrust-Admin-Secret`.

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
- 60-second maximum function duration
- immutable caching for `/assets/*`
- security headers for content type sniffing, referrer policy, permissions policy, and frame denial

Required Vercel environment variables:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=
VERITRUST_ALLOWED_ORIGINS=
```

`HF_ACCESS_TOKEN` may be used instead of `HF_TOKEN`. `VERITRUST_ALLOWED_ORIGINS` is a comma-separated list, for example:

```env
VERITRUST_ALLOWED_ORIGINS=https://veritrustlab.in,https://www.veritrustlab.in,http://localhost:3000,http://localhost:3001
```

Optional:

```env
VERITRUST_ADMIN_SECRET=
```

When `VERITRUST_ADMIN_SECRET` is set, `/api/health` accepts `X-VeriTrust-Admin-Secret` for private diagnostics. Without that header, health returns only public operational status. Apply `docs/supabase-production-schema.sql` in Supabase before production use so the `api_rate_limits` table and `consume_api_rate_limit` RPC exist.

Configure secrets only in Vercel Environment Variables or local ignored `.env` files. Never store Hugging Face, Supabase service-role, or admin secret values in repository files.

If a Hugging Face token was ever committed or shared, rotate/regenerate it immediately from the Hugging Face dashboard.

### Legacy PHP Reference

The `legacy-php/` folder is legacy reference code only and is excluded from Vercel deployment by `.vercelignore`. The production API uses the Node.js serverless routes in `/api`.

Legacy Hugging Face token lookup supports environment variables only:

- `HF_ACCESS_TOKEN`
- `HF_TOKEN`

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
- serverless rate limiting requires the `api_rate_limits` table and `consume_api_rate_limit` RPC from the production schema
- existing Supabase projects created before Critical risk support must run: `alter type public.risk_level add value if not exists 'critical';`
- billing and paid-plan enforcement are not implemented beyond basic plan-aware daily limits
- AI results depend on external Hugging Face model availability and latency
- Vercel image uploads are limited to 4 MB in the current Node endpoint
- model explanations are normalized for usability and should not be treated as legal, forensic, or final proof
- false positives and false negatives are possible; verify suspicious messages through official channels
- the face-crop workflow depends on an external Hugging Face Space URL
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
| Check deployment health | Open `/api/health` after configuring Vercel environment variables |
| Change AI endpoints | Update model definitions in `lib/veritrust-api.js` |
| Review model evaluation status | Open `/model-performance` |
| Export scan reports | Use Download JSON Report, Save PDF Report, or Copy Summary on successful results |
| Change browser API routes | Update `assets/js/config.js` |
| Deploy on Vercel | Use the JavaScript endpoints in `api/` |
| Review legacy PHP reference | Inspect `legacy-php/`, which is excluded from Vercel deployment |
| Adjust visual design | Edit `assets/css/veritrust.css` and `assets/css/tool-pages.css` |

---

## Security Notes

- Never expose `HF_ACCESS_TOKEN` in browser JavaScript.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `VERITRUST_ADMIN_SECRET` in browser JavaScript.
- Do not commit `.env`, `.env.local`, `.env.*.local`, `private/`, logs, `node_modules/`, or private token files.
- Keep `private/` and `legacy-php/` excluded from Vercel deployment when using the Node API path.
- If a Hugging Face token was ever committed or shared, rotate/regenerate it immediately from the Hugging Face dashboard.
- Treat uploaded images and pasted messages as potentially sensitive user data.
- Keep the Supabase production schema applied so serverless rate limiting remains active.

---

## License

No standalone license file is currently included in this repository.

Add a formal license before distributing VeriTrust as an open-source or commercial package.
