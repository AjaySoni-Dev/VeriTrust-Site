---
language:
- en
base_model:
- CrabInHoney/urlbert-tiny-base-v4
pipeline_tag: text-classification
tags:
- url
- cybersecurity
- urls
- links
- classification
- phishing-detection
- tiny
- phishing
- malware
- defacement
- transformers
- urlbert
- bert
- malicious
license: apache-2.0
new_version: CrabInHoney/urlbert-tiny-v5
---

# URLBERT-Tiny-v4 Malicious URL Classifier

This is a lightweight version of BERT, specifically fine-tuned for classifying URLs into four categories: benign, phishing, malware, and defacement.

## Model Details

- **Model size**: 3.69M parameters  
- **Tensor type**: F32  
- **Model weight size**: 14.8 MB  
- **Base model**: [CrabInHoney/urlbert-tiny-base-v4](https://huggingface.co/CrabInHoney/urlbert-tiny-base-v4)  
- **Dataset**: [Malicious URLs Dataset](https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset)  

## Model Evaluation Results

The model was evaluated on a test set with the following classification metrics:


| Metric | Model V3 | Model V4 (this model) |
|--------|----------|----------|
| **Overall Accuracy** | 0.9837 | **0.9922** |
| **F1-score (Benign)** | 0.9907 | **0.9955** |
| **F1-score (Defacement)** | 0.9937 | **0.9984** |
| **F1-score (Malware)** | 0.9741 | **0.9845** |
| **F1-score (Phishing)** | 0.9444 | **0.9734** |
| **Weighted Average F1-score** | 0.9836 | **0.9922** |



## Usage Example

Below is an example of how to use the model for URL classification using the Hugging Face `transformers` library:

```python
from transformers import BertTokenizerFast, BertForSequenceClassification, pipeline
import torch

# Определение устройства (GPU или CPU)
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Используемое устройство: {device}")

# Загрузка модели и токенизатора
model_name = "CrabInHoney/urlbert-tiny-v4-malicious-url-classifier"
tokenizer = BertTokenizerFast.from_pretrained(model_name)
model = BertForSequenceClassification.from_pretrained(model_name)
model.to(device)

# Создание pipeline для классификации
classifier = pipeline(
    "text-classification",
    model=model,
    tokenizer=tokenizer,
    device=0 if torch.cuda.is_available() else -1,
    return_all_scores=True
)

# Примеры URL для тестирования
test_urls = [
    "wikiobits.com/Obits/TonyProudfoot",
    "http://www.824555.com/app/member/SportOption.php?uid=guest&langx=gb",
]

# Маппинг меток на понятные названия классов
label_mapping = {
    "LABEL_0": "benign",
    "LABEL_1": "defacement",
    "LABEL_2": "malware",
    "LABEL_3": "phishing"
}

# Классификация URL
for url in test_urls:
    results = classifier(url)
    print(f"\nURL: {url}")
    for result in results[0]: 
        label = result['label']
        score = result['score']
        friendly_label = label_mapping.get(label, label)
        print(f"{friendly_label}, %: {score:.4f}")
```

### Example Output:
```
URL: wikiobits.com/Obits/TonyProudfoot
benign, %: 0.9996
defacement, %: 0.0000
malware, %: 0.0000
phishing, %: 0.0003

URL: http://www.824555.com/app/member/SportOption.php?uid=guest&langx=gb
benign, %: 0.0000
defacement, %: 0.0001
malware, %: 0.9998
phishing, %: 0.0001
```
