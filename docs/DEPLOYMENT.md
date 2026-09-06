# Deployment

## Target

The repository is structured for Vercel serverless entry points plus the existing VeriTrust Gateway worker and Supabase persistence contract.

## Database

Use the existing compatible VeriTrust Supabase schema. This repository snapshot does not contain authoritative migrations and intentionally does not invent replacements. Database-dependent features should not be deployed against a newly guessed schema.

## Required configuration

Exact requirements depend on enabled modules and integrations. Common configuration includes Supabase URL/keys, provider/model credentials, site/origin policy, Gateway worker credentials, email receiver secret/trusted authserv IDs, and optional infrastructure geolocation configuration.

Never put service-role or provider secrets into browser-delivered JavaScript.

## Module configuration

`config/modules.json` is the product-surface source of truth. The focused deployment enables email/phishing, Link Intelligence and Gateway correlation while the legacy deepfake product surface is disabled.

## Validation

Before deployment:

```bash
npm install
npm run check
npm run config:check
```

Also verify the deployment environment can access the intended Supabase schema, model providers, storage buckets, worker and optional geolocation provider. Local static/unit verification cannot prove external service credentials or the live database are correctly configured.

## Security headers

Do not weaken the Vercel CSP/HSTS/frame/referrer/permissions/cross-origin controls to accommodate a new client dependency. Prefer same-origin or deliberately reviewed integrations.

## Retention

Raw EML storage is private and policy-bound when enabled. Preserve retention, legal-hold and deletion semantics already defined by the deployed data contract.
