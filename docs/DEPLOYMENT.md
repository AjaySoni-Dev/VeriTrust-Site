# Deployment

## Target

The repository is structured for Vercel serverless entry points plus the existing VeriTrust Gateway worker and Supabase persistence contract. The optional SMTP enforcement path is a separate long-running Node process because Vercel cannot host a persistent SMTP TCP listener.

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

## SMTP gateway deployment

The transport service is under `mail-gateway/` and is excluded from the Vercel deployment bundle. Deploy the web/API normally, then run the SMTP process on the intermediary Windows/Linux host. Configure the same `VERITRUST_EMAIL_RECEIVER_SECRET` value on the API and `VERITRUST_RECEIVER_SECRET` on the SMTP process, and include the gateway's authserv ID in `VERITRUST_TRUSTED_AUTHSERV_IDS`. Use a scoped API key with `gateway:scan`.

For LAN exposure, restrict the SMTP listener by source-IP allowlist or SMTP AUTH and always configure a recipient allowlist to prevent open relay behavior. Prefer source-IP restriction on the bundled plaintext listener; use a TLS-capable edge before relying on reusable SMTP credentials. Inbound STARTTLS is not implemented in the bundled listener; keep it on a trusted private segment/VPN or place a reviewed TLS-capable MTA/terminator in front. Upstream delivery supports implicit TLS or STARTTLS.

Use `mail-gateway/powershell/VeriTrust.MailGateway.ps1` for Windows startup, connectivity testing and the bundled two-laptop test receiver. See `mail-gateway/README.md` for the exact topology and commands.
