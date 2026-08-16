# Standards notes

- C2PA Content Credentials 2.2 defines manifests, claims, signatures, trust lists, hard/soft bindings and validation states. It explicitly separates verifiable provenance from a value judgment about truth. VeriTrust therefore records C2PA as an independent evidence family and never treats absence as evidence of fakery or presence as proof that content is truthful.
- The target architecture also applies repository-verified controls aligned with NIST-style secure development and AI risk management: immutable provenance, evaluation, monitoring, incident response, least privilege, supply-chain review and human oversight. These are design alignments, not certification claims.
- RFC-aware email and URL processing remains deterministic. The implementation backlog calls for a maintained Public Suffix List, IDNA and confusable handling, and validation of SPF/DKIM/DMARC/ARC observations rather than trusting unverified message text.
