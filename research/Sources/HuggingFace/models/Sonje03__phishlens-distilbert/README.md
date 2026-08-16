---
license: mit
language:
- en
library_name: transformers
base_model: distilbert-base-uncased
tags:
- text-classification
- phishing-detection
- cybersecurity
- nlp
pipeline_tag: text-classification
---

# PhishLens — Fine-tuned DistilBERT for Phishing Email Detection

A `distilbert-base-uncased` model fine-tuned to classify English email
bodies as **Safe** (label 0) or **Phishing** (label 1).

This is the text agent of the [PhishLens](https://github.com/Sonje03/PhishLens)
Chrome extension + FastAPI backend. The training notebooks and per-agent
code live at [PhishingDetector](https://github.com/dodi-ctrl/PhishingDetector).

## At a glance

| Metric | Value |
|---|---|
| Accuracy | 97.34% |
| F1 (binary) | 0.9665 |
| False-positive rate | 2.91% |
| False-negative rate | 2.26% |

Evaluated on a stratified 20% held-out test split of a deduplicated
multi-source corpus of **29,555 emails** (17,447 legit / 12,108 phishing).

## How to use

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch.nn.functional as F
import torch

MODEL = "Sonje03/phishlens-distilbert"

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSequenceClassification.from_pretrained(MODEL)
model.eval()

email = "Your account has been suspended. Click here to verify..."
inputs = tok(email, truncation=True, max_length=256, return_tensors="pt")
with torch.no_grad():
    probs = F.softmax(model(**inputs).logits, dim=-1)[0]
print(f"P(Safe)={probs[0]:.3f}   P(Phishing)={probs[1]:.3f}")
```

## Training details

- **Base model:** `distilbert-base-uncased` (66M params)
- **Epochs:** 3
- **Optimizer:** AdamW, learning rate 2e-5
- **Batch size:** 16, mixed precision (FP16)
- **Max sequence length:** 256 tokens
- **Hardware:** single NVIDIA T4 GPU (Google Colab)

### Training corpora

| Source | Role | Count |
|---|---|---:|
| zefang-liu/phishing-email-dataset (MeAJOR Corpus) | Baseline text training | 18,650 |
| AreLit/PhishNChips | Modern workplace legits (augmentation) | 1,333 |
| cybersectony/PhishingEmailDetectionv2.0 | Augmentation legits | 11,322 |
| `synthetic_legit_emails.csv` | NG-domain hand-templated | 150 |

The augmented corpus dramatically lowers false positives on Nigerian-domain
emails (banks, hospitals, telcos, university) that share template wording
with phishing.

## Intended use

Designed to be deployed behind the PhishLens FastAPI backend as one of
three voting agents (text · URL · headers), with a trusted-domain
allowlist that further reduces false positives on institutional senders.

Not intended for production phishing defence on its own — pair it with
URL reputation services and DKIM/SPF/DMARC verification for any real
deployment.

## Limitations

- **English-only.** No support for French / Hausa / Yoruba phishing.
- **PDF attachments are ignored.** Only `text/plain` and `text/html`
  parts of an `.eml` are read.
- **Niche marketing / recruitment false positives** can still occur.

## License

MIT.

## Citation

```bibtex
@misc{phishlens2026,
  title  = {Smart Phishing Detection System Using Natural Language Processing Techniques},
  year   = {2026},
  school = {Nile University of Nigeria, Department of Cybersecurity},
  note   = {B.Sc. Final Year Project}
}
```
