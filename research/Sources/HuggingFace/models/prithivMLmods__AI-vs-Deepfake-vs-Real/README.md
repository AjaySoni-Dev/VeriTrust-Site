---
license: apache-2.0
datasets:
- prithivMLmods/AI-vs-Deepfake-vs-Real
language:
- en
base_model:
- google/vit-base-patch16-224-in21k
pipeline_tag: image-classification
library_name: transformers
tags:
- deepfake
- ai
- real
---
![kkk.png](https://cdn-uploads.huggingface.co/production/uploads/65bb837dbfb878f46c77de4c/bXfKBT3LQkbeLzPCBHTGT.png)

# **AI-vs-Deepfake-vs-Real**

AI-vs-Deepfake-vs-Real is an image classification model for differentiating between artificial, deepfake, and real images. It is based on Google's ViT model (`google/vit-base-patch32-224-in21k`).  

A reasonable number of training samples were used to achieve good efficiency in the final training process and its efficiency metrics. Since this task involves classifying images into three categories (artificial, deepfake, and real), the model was trained accordingly. Future improvements will be made based on the complexity of the task.  

```python
  id2label: {
    "0": "Artificial",
    "1": "Deepfake",
    "2": "Real"
  }
```
```python
    Classification report:
    
                  precision    recall  f1-score   support
    
      Artificial     0.9897    0.9347    0.9614      1333
        Deepfake     0.9409    0.9910    0.9653      1333
            Real     0.9970    0.9993    0.9981      1334
    
        accuracy                         0.9750      4000
       macro avg     0.9759    0.9750    0.9749      4000
    weighted avg     0.9759    0.9750    0.9750      4000
```


![download.png](https://cdn-uploads.huggingface.co/production/uploads/65bb837dbfb878f46c77de4c/FhUNkuzKxgs9SmwcvR4yP.png)

# **Inference with Hugging Face Pipeline**
```python
from transformers import pipeline

# Load the model
pipe = pipeline('image-classification', model="prithivMLmods/AI-vs-Deepfake-vs-Real", device=0)

# Predict on an image
result = pipe("path_to_image.jpg")
print(result)
```

# **Inference with PyTorch**
```python
from transformers import ViTForImageClassification, ViTImageProcessor
from PIL import Image
import torch

# Load the model and processor
model = ViTForImageClassification.from_pretrained("prithivMLmods/AI-vs-Deepfake-vs-Real")
processor = ViTImageProcessor.from_pretrained("prithivMLmods/AI-vs-Deepfake-vs-Real")

# Load and preprocess the image
image = Image.open("path_to_image.jpg").convert("RGB")
inputs = processor(images=image, return_tensors="pt")

# Perform inference
with torch.no_grad():
    outputs = model(**inputs)
    logits = outputs.logits
    predicted_class = torch.argmax(logits, dim=1).item()

# Map class index to label
label = model.config.id2label[predicted_class]
print(f"Predicted Label: {label}")
```

# **Limitations of AI-vs-Deepfake-vs-Real**  
1. **Limited Generalization** – The model is trained on specific datasets and may not generalize well to unseen deepfake generation techniques or novel deepfake artifacts.  
2. **Variability in Deepfake Quality** – Different deepfake creation methods introduce varying levels of noise and artifacts, which may affect model performance.  
3. **Dependence on Training Data** – The model's accuracy is influenced by the quality and diversity of the training data. Biases in the dataset could lead to misclassification.  
4. **Resolution Sensitivity** – Performance may degrade when analyzing extremely high- or low-resolution images not seen during training.  
5. **Potential False Positives/Negatives** – The model may sometimes misclassify artificial, deepfake, or real images, limiting its reliability in critical applications.  
6. **Lack of Explainability** – Being based on a ViT (Vision Transformer), the decision-making process is less interpretable than traditional models, making it harder to analyze why certain classifications are made.  
7. **Not a Deepfake Detector** – This model categorizes images but does not specifically determine whether an image is fake; rather, it differentiates between artificial, deepfake, and real images.  

# **Intended Use of AI-vs-Deepfake-vs-Real**  
- **Quality Assessment for Research** – Used by researchers to analyze and improve deepfake generation methods by assessing output quality.  
- **Dataset Filtering** – Helps filter out low-quality deepfake samples in datasets for better training of deepfake detection models.  
- **Forensic Analysis** – Supports forensic teams in evaluating image authenticity and prioritizing high-quality deepfakes for deeper analysis.  
- **Content Moderation** – Assists social media platforms and content moderation teams in assessing image authenticity before deciding on further actions.  
- **Benchmarking Deepfake Models** – Used to compare and evaluate different deepfake generation models based on their output quality and authenticity.  
