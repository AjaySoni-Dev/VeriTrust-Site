# Model registry and Hugging Face readiness

VeriTrust treats UI model names such as `mailguard` as aliases, not as model identities. A model can influence a Gateway decision only when its runtime contract binds all of the following before inference:

- exact Hugging Face repository and current immutable revision;
- provider and provider task used by the adapter;
- explicit qualification state (`canary` or `production`);
- complete ordered labels and semantic label map for MailGuard;
- uncertainty thresholds and score validation tolerance.

Standalone routes execute the source-pinned MailGuard and Swift contracts.
Gateway runs resolve `gateway_model_versions.configuration`, require it to
match the source-pinned identity, and then communicate through the typed direct
module bus. Persisted provenance therefore cannot name a different contract
than the provider call.

## Contract shape

The value is a JSON object keyed by internal alias. This example shows structure only and is deliberately not a deployable model:

```json
{
  "mailguard": {
    "registry_schema": "gateway-model-registry-2",
    "repository_id": "OWNER/QUALIFIED_MODEL",
    "revision_sha": "40_TO_64_HEXADECIMAL_COMMIT_SHA",
    "qualification_state": "canary",
    "provider": "hf-inference",
    "task": "text-classification",
    "ordered_labels": ["benign", "phishing"],
    "label_map": {
      "benign": "BENIGN",
      "phishing": "PHISHING"
    },
    "thresholds": {
      "likely_benign_max": 0.2,
      "likely_phishing_min": 0.7
    },
    "score_sum_tolerance": 0.02
  }
}
```

Do not copy a researched public model into this value merely to make a request succeed. The retained acquisition guide states that public research evidence does not constitute VeriTrust production qualification. Complete the adapter, golden fixtures, leakage-safe benchmark, calibration, security, privacy, and licensing gates first.

## Repository canary profile

`config/hf-model-contracts.canary.json` is the deployed, source-controlled
runtime identity. Run `npm run config:canary` to inspect it; no model Vercel
variables are produced or required. This profile pins:

- MailGuard to `ealvaradob/bert-finetuned-phishing`, whose pinned configuration exposes the ordered `benign` and `phishing` labels;
- Swift to `kmack/malicious-url-detection`, whose pinned configuration exposes `BENIGN` and `MALWARE` labels.

Both repositories had a live `hf-inference` mapping for `text-classification` when rechecked on 2026-08-23. Runtime preflight still rejects revision drift, provider removal, task changes, incomplete MailGuard labels, and malformed scores. The profile is intentionally marked `canary`; promote it to `production` only after VeriTrust's own representative evaluation and governance gates pass.

## Deployment checks

1. Keep exactly one of `HF_TOKEN` or `HF_ACCESS_TOKEN` with Inference Providers permission.
2. Remove the obsolete MailGuard, Swift, and `HF_MODEL_CONTRACTS` variables.
3. Apply `20260823110000_direct_module_bus_alignment.sql`, then
   `20260823120000_gateway_model_run_timestamp_guard.sql`.
4. Redeploy; Vercel environment changes do not modify an existing deployment.
5. Run `npm run config:check` with the target environment loaded.
6. Call `/api/health` with `X-VeriTrust-Admin-Secret` and confirm both model contracts are ready.
7. Run one known-fixture request and inspect the module-bus evidence.

The runtime preflight rejects missing repositories, revision drift, unavailable provider mappings, task mismatches, invalid tokens, and incomplete output label sets with distinct reason codes.
