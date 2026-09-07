# VeriTrust MailGraph

**AI-powered email threat detection, infrastructure geolocation, and forensic intelligence.**

VeriTrust turns a suspicious email into a structured investigation instead of stopping at a single phishing score. The current product combines content analysis, sender-authentication evidence, sender-identity relationships, URL intelligence, observable SMTP infrastructure, approximate infrastructure geolocation, evidence correlation, cases, and exportable reports.

> **Important boundary:** infrastructure geolocation describes observable mail-server infrastructure. It does not establish the physical location or identity of a person. Missing or failed evidence is never treated as proof that an email is safe.

## Core workflow

```text
Email input
  ├─ pasted subject/body
  ├─ raw .eml
  ├─ trusted receiver event
  └─ live SMTP enforcement gateway
        ↓
Bounded parsing and capability classification
        ↓
Content + authentication + identity + URL + attachment metadata + relay evidence
        ↓
Evidence Correlation Gateway
        ↓
Risk + recommendation + evidence completeness + limitations
        ↓
Case / report / API integration
```

## Evidence modes

| Mode | What it can support |
| --- | --- |
| `plain_text` | Content and URL analysis. Header, authentication, attachment, and relay evidence are unavailable. |
| `raw_eml` | Bounded MIME parsing, DKIM/DMARC/ARC evaluation, identity relationships, URL/attachment metadata, and observable relay infrastructure. Historical SPF is not reconstructed without trusted SMTP facts. |
| `trusted_receiver_event` | Raw-email capabilities plus trusted SMTP facts such as client IP, HELO, MAIL FROM, receiver/authserv identity, enabling SPF evaluation at the trust boundary. |

## Main capabilities

- **MailGuard content specialist** — model-backed phishing evidence plus deterministic social-engineering indicators.
- **Authentication forensics** — SPF where trusted SMTP facts exist, plus DKIM, DMARC, and ARC evidence.
- **Identity graph** — From, Reply-To, Return-Path, Sender, Message-ID, authentication domains, linked domains, and sending-infrastructure relationships.
- **Swift URL intelligence** — URL classifier plus deterministic suspicious-URL observations.
- **Relay and geo context** — Received-header hops, public/private/reserved IP classification, ASN/provider and approximate country/region/city enrichment when configured.
- **Attachment metadata intelligence** — filenames, hashes, MIME/extension observations and risky metadata flags; attachments are never executed by the email parser.
- **Evidence completeness** — coverage is reported separately from threat risk.
- **Evidence manifest** — schema/pipeline/parser/authentication/identity/infrastructure versions and evidence hash provenance for reproducibility.
- **Evidence Correlation Gateway** — policy-aware correlation that does not simply average all model scores.
- **Cases and reports** — human-review workflows, evidence preservation, downloadable reports and audit identifiers.
- **SMTP enforcement gateway** — a separate persistent Node/PowerShell transport service that receives mail before delivery, supplies trusted SMTP facts to MailGraph, relays `allow/warn`, defers `manual_review/hold`, and rejects `quarantine/block` back to the sender.

## Current product boundaries

VeriTrust is a working prototype with production-oriented controls, not a claim of complete enterprise mail-gateway replacement or legal actor attribution.

- A low risk score is not a safety certificate.
- Model confidence is not measured product accuracy.
- No controlled VeriTrust accuracy/precision/recall/F1 benchmark is published yet.
- Raw `.eml` cannot recreate historical SPF without trusted receiver facts.
- Received headers below an untrusted boundary can be attacker-controlled or misleading.
- Infrastructure geolocation is approximate and is not person geolocation.
- Attachments are metadata-only in the email-forensics pipeline and are not malware-sandboxed or executed.
- Provider failures remain failed, partial, unavailable, or uncertain rather than silently benign.

## Repository structure

```text
api/                    Vercel serverless entry points
assets/                 Browser JavaScript, CSS, images, and PowerShell client
config/                 Runtime module configuration
lib/email/               MailGraph parsing, auth, identity, infrastructure and evidence logic
lib/gateway/             Correlation, policy, persistence, storage and execution
lib/models/              Model adapters/contracts
lib/routes/              HTTP route handlers
mail-gateway/             Persistent SMTP enforcement relay + PowerShell deployment tools
openapi/                 Email v2 and Gateway OpenAPI contracts
scripts/                 Verification/configuration utilities
tests/                   Node regression tests
worker/                  Gateway worker runtime
```

## Models and decision semantics

The qualified email and URL specialists use immutable model contracts where configured. See [Model Registry](docs/MODEL_REGISTRY.md).

The final Gateway risk is **not** a simple average. The correlation layer preserves strong credible evidence, applies deterministic floors/interactions, accounts for required specialist failures, and can escalate to human review. Existing risk formulas are intentionally separate from evidence completeness.


## SMTP transport enforcement

The repository now includes a transport-level SMTP enforcement component for controlled/private deployment. It is intentionally separate from Vercel because SMTP requires a long-running TCP listener. The transport path is:

```text
Sender -> VeriTrust SMTP Gateway -> trusted-receiver MailGraph analysis -> Gateway policy -> downstream SMTP receiver
```

The gateway prepends the directly observed `Received:` boundary and calls the server-to-server trusted receiver endpoint before it relays the message. `allow` and `warn` are forwarded by default; `manual_review` and `hold` return SMTP `451`; `quarantine` and `block` return SMTP `550`. If the API/model path is unavailable, the default behavior is temporary failure rather than uninspected delivery. See [SMTP Gateway](mail-gateway/README.md).

## Database compatibility

This repository intentionally does **not** invent or replace the deployed Supabase database contract. The application expects a compatible existing VeriTrust Supabase schema for organizations, scans, cases, Gateway evidence, usage, privacy and related records.

Authoritative database migrations are not included in this repository snapshot. Do not treat inferred SQL as an authoritative production migration. Deploy against the existing compatible database contract or restore the original reviewed migrations from the deployment source of truth.

## Configuration

Copy `.env.example` if present or configure the deployment environment directly. The active runtime may use variables including:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HF_ACCESS_TOKEN` or `HF_TOKEN`
- `HF_MODEL_CONTRACTS` / supported model configuration
- `VERITRUST_SITE_URL`
- `VERITRUST_ALLOWED_ORIGINS`
- `VERITRUST_EMAIL_RECEIVER_SECRET`
- `VERITRUST_TRUSTED_AUTHSERV_IDS`
- `VERITRUST_GEO_PROVIDER`
- Gateway/worker secrets required by the deployed worker flow

Do not expose service-role, provider, Gateway, receiver or webhook secrets in browser JavaScript.

## Local verification

Requires the Node.js version declared in `package.json`.

```bash
npm install
npm run check
```

Useful commands:

```bash
npm test
npm run config:check
npm run config:canary
```

`npm run check` validates JavaScript syntax, local references, public/private metadata, Vercel function budget, security headers, CSP assumptions, module switching, regression tests and committed-secret patterns.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Email Forensics](docs/EMAIL_FORENSICS.md)
- [Model Registry](docs/MODEL_REGISTRY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Email v2 OpenAPI](openapi/veritrust-email-v2.yaml)
- [Gateway OpenAPI](openapi/veritrust-gateway-v1.yaml)

## Security and privacy

VeriTrust keeps authentication, API-key validation, Gateway policy, provider credentials, persistence and sensitive storage operations on the server. The Vercel configuration applies CSP, HSTS, `nosniff`, referrer, permissions, frame and cross-origin controls.

Raw email storage, when used, is private and retention-bound by the configured Gateway policy. Reports should preserve limitations and provenance so reviewers can distinguish verified evidence from unavailable evidence.

See [SECURITY.md](SECURITY.md) and [Deployment](docs/DEPLOYMENT.md).

## License

Use according to the repository's existing license and deployment policy.

## Persistent PowerShell SMTP enforcement CLI

VeriTrust includes a Windows PowerShell 5.1+ persistent sender/receiver console for the live SMTP enforcement path.

- Website guide: `/gateway-powershell#live-smtp`
- Complete download: `/assets/downloads/VeriTrust-Lab-Persistent-CLI.zip`
- Receiver: `/assets/powershell/VeriTrust-Receiver-CLI.ps1`
- Sender: `/assets/powershell/VeriTrust-Sender-CLI.ps1`
- Package manifest/checksums: `/assets/downloads/veritrust-cli-manifest.json`
- CLI logo asset: `/assets/images/veritrust-live-cli-logo.png`

The receiver CLI automatically detects/installs Tailscale, enables incoming tailnet connectivity, creates a Tailscale-scoped Windows Firewall rule, downloads portable Node.js 24 when required, downloads the SMTP gateway runtime, starts the local downstream receiver, generates a session SMTP password, and prints a `VTCLI2|...` pairing code. Accepted `.eml` files are saved in the directory from which the receiver CLI was started.

The sender pairs once and stays open. Type `email.eml`, `/send another.eml`, or an absolute `.eml` path repeatedly. One blocked/deferred message does not terminate the session.

For the simplest two-laptop demonstration, both Windows devices should use the same Tailscale account/tailnet. Different Tailscale accounts are supported only when the receiver is invited/shared into a tailnet whose policy allows the sender.

Receiver-only trust prerequisites remain intentionally manual:
- a scoped VeriTrust API key with Gateway scan permission;
- `VERITRUST_EMAIL_RECEIVER_SECRET` configured on the deployed VeriTrust API and entered into the receiver CLI;
- `VERITRUST_TRUSTED_AUTHSERV_IDS=veritrust-smtp-gateway`.

Never give the API key or receiver secret to the sender. The sender receives only the generated pairing code.
