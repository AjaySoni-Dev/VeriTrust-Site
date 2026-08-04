# Architecture

## Overview

VeriTrust is a framework-free multi-page web application deployed on Vercel. Static HTML is served from the project root, browser assets are served from `assets/`, and requests under `/api/` are rewritten to seven serverless dispatchers.

```text
Browser
  |-- static page ----------------------> root HTML + assets/
  |-- account/detection request --------> api/account.js or api/detection.js
  |-- public developer request ---------> api/v1.js
  |-- gateway request ------------------> api/gateway.js
  |-- learning request -----------------> api/learning.js
  |-- billing request ------------------> api/billing.js
  `-- health/config request ------------> api/system.js
                                               |
                                               v
                                      lib/routes/<domain>/
                                               |
                         +---------------------+--------------------+
                         |                     |                    |
                     Supabase           model providers          Stripe
```

## Static pages

Each root HTML file represents a real route. `vercel.json` maps clean URLs such as `/phishing` to `phishing.html`. Shared browser behavior is split into:

- `assets/js/core/`: site chrome, client configuration, Supabase client, reporting, and shared helpers;
- `assets/js/pages/`: one controller per interactive page or closely related page family;
- `assets/css/base/`: shared visual system and common tool styles;
- `assets/css/pages/`: domain-specific layouts.

This keeps the pages directly deployable while avoiding versioned duplicate bundles.

## Serverless API

Files directly inside `api/` count as Vercel functions. Dispatchers consolidate related routes so the project stays within the Vercel Hobby function budget:

| Entrypoint | Responsibility |
| --- | --- |
| `account.js` | Sessions, profiles, cases, history, API keys, and jobs |
| `billing.js` | Stripe checkout, portal, subscription, and webhook routes |
| `detection.js` | Browser-facing deepfake, phishing, and link review |
| `gateway.js` | Unified gateway scans, policies, webhooks, uploads, and worker dispatch |
| `learning.js` | Courses, lessons, attempts, credentials, and administration |
| `system.js` | Health, client configuration, model cards, and learning access |
| `v1.js` | Scoped developer API |

Private handlers live in `lib/routes/`, not `api/`, so they cannot become accidental public functions.

## Shared backend modules

- `lib/veritrust-api.js`: request parsing, provider calls, response handling, and shared API types
- `lib/config.js`: validated server configuration
- `lib/supabase-server.js`: server-only persistence and workspace access
- `lib/detection-service.js`: provider-independent detection orchestration
- `lib/risk-engine.js`: deterministic evidence and risk normalization
- `lib/gateway/`: gateway contracts, policy, routing, persistence, uploads, webhooks, and storage
- `lib/learning/`: learning repository and validation
- `lib/billing.js`: Stripe integration

## Authentication and authorization

Browser access and refresh tokens are stored in secure, HttpOnly cookies. Workspace authorization and tenant filtering are enforced on server routes. The private learning preview also has middleware protection and a server-side access check; the preview key is never sent to browser configuration.

## Persistence

Supabase provides authentication, workspace data, scans, cases, quotas, gateway records, learning records, and storage. The expected deployed schema inventory is documented in `database-schema.json`. Executable migrations are intentionally managed outside this cleaned deploy repository.

## Background processing

`worker/` contains the optional long-running worker. Vercel gateway dispatch can also invoke a bounded serverless worker tick. Both paths use shared gateway persistence and signed dispatch verification.

## Search indexing

Only informational public routes are indexable. Authenticated, user-specific, API, and preview pages use `noindex` and are excluded by `robots.txt`. `scripts/verify.js` keeps canonical metadata and `sitemap.xml` aligned.
