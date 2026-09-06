# SMTP Gateway Validation Notes

## Automated checks included in the repository

Run from the repository root:

```bash
npm run check
```

The test suite includes socket-level SMTP checks for:

- transport recommendation mapping without recomputing the VeriTrust risk score;
- source-IP and recipient allowlist behavior;
- trusted receiver metadata validation;
- stripping sender-spoofed `X-VeriTrust-*` headers before downstream relay;
- `allow` analysis followed by successful downstream relay;
- `block` analysis returning SMTP `550` with no downstream delivery;
- analysis/API failure returning SMTP `451` with no inspection bypass;
- Vercel routing for `/internal/v2/phishing/receiver-eml`;
- packaging of the PowerShell control module and test receiver.

## Environment-dependent checks still required after deployment

The repository cannot prove these without the target deployment's credentials and infrastructure:

1. Supabase schema/RPC/storage compatibility with the existing VeriTrust production project.
2. Hugging Face provider/model reachability and qualified model-version rows.
3. Live SPF/DKIM/DMARC/ARC DNS behavior from the deployed API region.
4. The real `VERITRUST_EMAIL_RECEIVER_SECRET`, scoped API key and active Gateway integration.
5. Firewall reachability between sender -> SMTP gateway -> downstream receiver.
6. Real downstream SMTP TLS/authentication settings.
7. PowerShell runtime smoke execution on the target Windows host.

## Deployment boundary

The Vercel deployment hosts the VeriTrust HTTP/API application. `mail-gateway/` is excluded from the Vercel bundle and must run as a long-lived process on the intermediary host. This is an architectural requirement of SMTP, not an optional optimization.

## Internet-facing warning

The bundled listener does not implement inbound STARTTLS. It is suitable for controlled/private networks, source-IP-restricted lab deployments, VPN-protected environments, or operation behind a mature TLS-capable MTA/terminator. Do not expose it directly as a public unauthenticated MX service.
