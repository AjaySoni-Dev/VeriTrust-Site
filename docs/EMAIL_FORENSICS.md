# Email Forensics

## Input modes

### Plain text

Supports message-content and URL review. It cannot verify MIME structure, copied headers, authentication, attachments or delivery infrastructure.

### Raw EML

Supports bounded MIME/header parsing, DKIM/DMARC/ARC evidence, sender relationships, embedded URLs, attachment metadata and observable Received-header infrastructure. SPF remains unavailable when trusted SMTP transaction facts are absent.

### Trusted receiver event

Adds trusted SMTP facts such as client IP, HELO, MAIL FROM, receiver identity and authserv identity. This enables SPF evaluation and a stronger receiver-boundary interpretation.

### Live SMTP receiver path

The bundled SMTP gateway creates this mode at message-receipt time rather than reconstructing it later. It adds the receiver-owned top `Received:` header, sends the same exact received message bytes plus directly observed SMTP facts to the protected trusted-receiver endpoint, and waits for the Gateway policy decision before downstream relay. This is the strongest MailGraph input mode currently implemented because SPF can be evaluated against the observed connection boundary.

## Authentication boundary

- DKIM is locally verified from the available raw message where possible.
- DMARC uses available alignment evidence.
- ARC provides forwarded-message context.
- SPF requires trusted SMTP facts and is not reconstructed from a copied header alone.
- `Authentication-Results` is not blindly trusted merely because it is present inside an uploaded message.

## Sender identity graph

Relationships can include From, Reply-To, Return-Path, Sender, Message-ID, DKIM/SPF domains, URL domains and observable sending infrastructure. Organizational-domain normalization and confusable/mixed-script observations are supporting evidence, not proof of maliciousness.

## Delivery infrastructure

Received-header candidates are classified as public/private/reserved/loopback. Public infrastructure can be enriched by a configured provider with ASN/organization and approximate country/region/city coordinates.

For standalone EML, these hops remain observational. A trusted receiver event can identify a public node observed directly at that trust boundary, but this still does not prove the physical location or identity of a person.

## Attachment handling

Attachments are metadata-only in the MailGraph pipeline. VeriTrust can record filename, declared MIME, size, hash and deterministic metadata risk flags such as executable/script extensions, macro-enabled Office formats, double extensions, bidirectional filename controls and selected MIME/extension mismatches.

Attachment contents are not executed or malware-sandboxed by this parser.

## Evidence completeness

The response can describe seven dimensions:

- content;
- AI model;
- authentication;
- identity;
- links;
- attachments;
- infrastructure.

Each can be `CHECKED`, `LIMITED`, or `UNAVAILABLE`. The aggregate level is `STRONG`, `MODERATE`, or `LIMITED`. This describes forensic coverage only and never means “safe”.

## Evidence manifest

Reports can expose technical provenance including evidence schema, pipeline, parser, authentication, identity and infrastructure versions, input mode, raw evidence SHA-256 where available, model version IDs and timestamps.

This supports reproducibility. It is not a legal certification by itself.
