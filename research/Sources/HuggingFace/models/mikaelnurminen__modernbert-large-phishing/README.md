---
language:
- en
license: apache-2.0
library_name: transformers
pipeline_tag: text-classification
tags:
- phishing
- phishing-detection
- cybersecurity
- text-classification
- modernbert
base_model: answerdotai/ModernBERT-large
---

# modernbert-large-phishing (real-world calibration update)

Binary classifier for phishing risk (`0=benign`, `1=phishing`) calibrated with additional real email corpora and production stability fixes.

## What was wrong

Two issues were impacting real uploads:

1. Data mismatch: too few benign real-world bulk/newsletter-style emails in calibration data, causing false positives.
2. Numerical instability: this ModernBERT stack can produce `NaN` probabilities with variable-length batched inference under SDPA attention (`batch_size > 1`).

## What changed

1. Added real-world data for calibration:
- `talby/spamassassin` (real ham/spam emails)
- `SetFit/enron_spam` (real Enron ham/spam)
- `puyang2025/seven-phishing-email-datasets` subsets (`CEAS-08`, `TREC-07`, `Assassin`)
- Existing hard negatives (`hard_neg_round2`) retained

2. Stable training/inference protocol:
- Head-only calibration (`freeze_base_model: true`)
- `batch_size=1` during training
- Forced `attn_implementation='eager'` in project inference/training loaders for stable batched inference in production

3. Real-world holdout testing added:
- Unseen holdout mix from SpamAssassin holdout groups + Enron test set

## Training data snapshot (this run)

- Train rows: `15,585` (after dedup/split processing)
- Validation rows: `1,948`
- Test rows: `1,949`

## Results

### Internal test split (`realworld_round1` config split)

- Accuracy: `0.9010`
- F1: `0.8822`
- Precision: `0.8628`
- Recall: `0.9026`
- ROC-AUC: `0.9617`
- Threshold selected by validation F1: `0.37`

### Unseen real-world holdout (sampled 2,000 rows)

From `eval_realworld_holdout_sampled.json`:

- At threshold `0.47`:
  - Accuracy: `0.7720`
  - F1: `0.7292`
  - Precision: `0.8977`
  - Recall: `0.6140`
- Best F1 threshold (on this holdout sample): `0.03`
  - F1: `0.7482`

### Legacy benchmark compatibility (truncated benchmark)

From `eval_benchmark_truncated_1024.json`:

- Accuracy: `0.9014`
- F1: `0.9000`
- Precision: `0.9106`
- Recall: `0.8896`
- ROC-AUC: `0.9602`

## Important production note

For this model family, use eager attention for batched inference to avoid NaNs:

```python
model = AutoModelForSequenceClassification.from_pretrained(
    repo_id,
    attn_implementation="eager",
)
```

## Quick start

```python
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

repo_id = "mikaelnurminen/modernbert-large-phishing"

tokenizer = AutoTokenizer.from_pretrained(repo_id, use_fast=True)
model = AutoModelForSequenceClassification.from_pretrained(
    repo_id,
    attn_implementation="eager",
).eval()

text = "EMAIL: Please verify your account details"
enc = tokenizer(text, return_tensors="pt", truncation=True, max_length=2048)
with torch.no_grad():
    logits = model(**enc).logits
prob_phishing = torch.softmax(logits.float(), dim=-1)[0, 1].item()
label = "phishing" if prob_phishing >= 0.47 else "benign"
print({"prob_phishing": prob_phishing, "label": label})
```

## Included artifacts

- `model.safetensors`
- `config.json`
- tokenizer files
- `resolved_config.yaml`
- `train_metrics.json`
- `eval_report.json`
- `eval_benchmark_truncated_1024.json`
- `data_summary.json`
