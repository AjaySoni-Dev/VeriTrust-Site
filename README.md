# VeriTrust

VeriTrust is a static multi-page security review application backed by Vercel serverless functions. It provides AI-assisted image, phishing-message, URL, and unified gateway review; authenticated workspaces; case management; developer API access; billing hooks; and a private learning preview.

Production site: [veritrustlab.in](https://www.veritrustlab.in/)

## Project status

The repository is organized for GitHub and Vercel deployment. Public Vercel functions are intentionally limited to seven route dispatchers, while implementation code lives under `lib/`. Generated reports, historical implementation plans, local SQL utilities, and broken test scaffolding are not part of the deployable source tree.

AI-assisted results are advisory and require human review. They are not forensic proof.

## Features

- Image deepfake scoring with validation and exportable reports
- Phishing-message and suspicious-link analysis
- Unified policy-backed gateway submissions
- Authenticated workspace, scan history, case review, and profile management
- Scoped API keys and versioned API endpoints
- Optional Stripe checkout, portal, subscription, and webhook integration
- Private learning, assessment, and credential-preview flows
- Security headers, restricted server routes, canonical URLs, sitemap, and crawler controls

## Repository structure

```text
.
|-- .github/                 GitHub Actions and repository guidance
|-- api/                     Seven public Vercel function entrypoints
|-- assets/
|   |-- css/base/            Shared styles and visual system
|   |-- css/pages/           Page-specific styles
|   |-- images/              Brand assets
|   |-- js/core/             Shared browser modules
|   `-- js/pages/            Page controllers
|-- docs/                    Architecture and deployment documentation
|-- lib/
|   |-- gateway/             Gateway orchestration and persistence
|   |-- learning/            Learning data and validation
|   |-- routes/              Private route implementations by domain
|   `-- ...                  Shared service, billing, auth, and risk modules
|-- openapi/                 Public gateway API contract
|-- scripts/verify.js        Consolidated repository validation
|-- worker/                  Optional background worker runtime
|-- *.html                   Route-aligned static pages
|-- middleware.ts            Learning-preview access middleware
|-- vercel.json              Vercel routes, redirects, functions, and headers
|-- robots.txt               Search crawler policy
`-- sitemap.xml              Public canonical URL inventory
```

Root HTML files are intentional: Vercel serves them directly and maps clean URLs such as `/detection` to `detection.html`. Moving them under another folder would add routing complexity without reducing the number of real pages.

## Requirements

- Node.js 24
- npm
- A Vercel project for local serverless emulation and deployment
- An existing Supabase project matching [the documented schema contract](docs/database-schema.json)
- Provider credentials for the enabled detection models

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run check
npm start
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

`npm start` runs `vercel dev`, so install or invoke the Vercel CLI when it is not already available in your environment.

## Environment variables

Copy `.env.example` and fill only the services you use. Keep all real values in Vercel Environment Variables or an ignored local environment file.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Browser-safe Supabase anonymous key returned through server configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `HF_TOKEN` | Server-only Hugging Face access token |
| `HF_*_MODEL` | Provider model repository identifiers for enabled detectors |
| `VERITRUST_ALLOWED_ORIGINS` | Comma-separated trusted browser origins |
| `VERITRUST_SITE_URL` | Canonical HTTPS site origin used by auth and billing redirects |
| `VERITRUST_LEARNING_ACCESS_KEY` | Private learning-preview key with at least 32 characters |
| `VERITRUST_CONTENT_HMAC_KEY` | Gateway content-integrity key with at least 32 random bytes |
| `VERITRUST_GATEWAY_DISPATCH_SECRET` | Shared signed-dispatch secret |
| `VERITRUST_WEBHOOK_ENCRYPTION_KEY` | 32-byte gateway webhook encryption key |
| `VERITRUST_WEBHOOK_ALLOWED_HOSTS` | Comma-separated approved webhook destination hosts |
| `STRIPE_SECRET_KEY` | Optional Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Optional Stripe webhook signature secret |

The code supports a small set of legacy aliases, but new deployments should use the canonical names in `.env.example`.

## Commands

```bash
npm run check   # syntax, links, SEO, Vercel, security, and secret checks
npm run ci      # repository checks plus production dependency audit
npm run worker  # run the optional background worker
npm start       # run the site with Vercel's local runtime
```

## Vercel deployment

1. Push this directory to a GitHub repository.
2. Import the repository into Vercel, choose a lowercase project name such as `veritrust-site`, and select the project root.
3. Use the "Other" framework preset; no build output directory is required.
4. Add production and preview environment variables separately.
5. Deploy and confirm `/api/health`, the public routes, authentication redirects, and one configured detection flow.
6. Set the production domain to `www.veritrustlab.in` or update canonical URLs, `robots.txt`, and `sitemap.xml` together if the domain changes.

The included `vercel.json` defines function timeouts, clean URL rewrites, the legacy `/scans` redirect, cache policy, and security headers. See [Deployment](docs/DEPLOYMENT.md) for the release checklist.

## API surfaces

- Browser APIs: `/api/deepfake`, `/api/phishing`, `/api/link-check`
- Workspace APIs: `/api/session`, `/api/scans`, `/api/cases`, `/api/dashboard`, `/api/profile`
- Gateway APIs: `/api/v1/gateway/*`
- Developer API v1: `/api/v1/deepfake`, `/api/v1/phishing`, `/api/v1/link-check`, `/api/v1/usage`
- Billing APIs: `/api/billing/*`
- Learning APIs: `/api/learning/*`
- Operations: `/api/health`, `/api/model-cards`, `/api/client-config`

The gateway contract is available at [openapi/veritrust-gateway-v1.yaml](openapi/veritrust-gateway-v1.yaml).

## Database contract

This cleaned repository does not include local seed SQL, migration experiments, preflight queries, rollback samples, or database test scripts. The runtime expects an already provisioned Supabase project. [docs/database-schema.json](docs/database-schema.json) records the expected schema inventory for operators; it is documentation, not an executable migration.

Never apply reconstructed SQL directly to an existing production database. Manage production schema changes in the controlled database repository or Supabase project that owns the deployed schema.

## SEO and indexing

Public informational routes have unique titles, descriptions, absolute canonical URLs, Open Graph metadata, and Twitter metadata. Private workspace, authentication, API, and learning-preview routes use `noindex` and are disallowed in `robots.txt`. Only canonical public routes appear in `sitemap.xml`.

When a public page is added, update its metadata, `sitemap.xml`, `robots.txt` if necessary, `vercel.json`, and the public-page map in `scripts/verify.js` in the same change.

## Security

- Never commit `.env` files, API keys, provider tokens, Supabase service credentials, or Stripe secrets.
- Keep sensitive configuration server-side; browser modules must use `/api/client-config` only.
- Preserve the CSP and related security headers unless a reviewed integration requires a narrow change.
- Treat model output as advisory evidence and avoid exposing provider repository identifiers in client responses.
- Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), run `npm run check`, and keep changes focused. Do not add generated reports, local SQL dumps, one-off scripts, or version-suffixed duplicate assets.

## License

Licensed under the [MIT License](LICENSE).
