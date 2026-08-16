---
base_model:
- buildborderless/CommunityForensics-DeepfakeDet-ViT
library_name: transformers.js
license: mit
pipeline_tag: image-classification
tags:
- image-classification
- timm
- transformers
- detection
- deepfake
- forensics
- deepfake_detection
- community
- opensight
---



# CommunityForensics-DeepfakeDet-ViT (ONNX)


This is an ONNX version of [buildborderless/CommunityForensics-DeepfakeDet-ViT](https://huggingface.co/buildborderless/CommunityForensics-DeepfakeDet-ViT). It was automatically converted and uploaded using [this Hugging Face Space](https://huggingface.co/spaces/onnx-community/convert-to-onnx).


## Usage with Transformers.js


See the pipeline documentation for `image-classification`: https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.ImageClassificationPipeline


---


# Trained on 2.7M samples across 4,803 generators (see Training Data)

Model presented in [Community Forensics: Using Thousands of Generators to Train Fake Image Detectors](https://huggingface.co/papers/2411.04125).

**Uploaded for community validation as part of OpenSight** - An upcoming open-source framework for adaptive deepfake detection.

**Project OpenSight HF Spaces coming soon with an eval playground and eventually a leaderboard. Preview:** 

![image/png](https://cdn-uploads.huggingface.co/production/uploads/639daf827270667011153fbc/AUmW697OefKN83BClM1ae.png)

## Model Details
### Model Description
Vision Transformer (ViT) model trained on the largest dataset to-date for detecting AI-generated images in forensic applications.

- **Developed by:** Jeongsoo Park and Andrew Owens, University of Michigan
- **Model type:** Vision Transformer (ViT-Small)
- **License:** MIT (compatible with CreativeML OpenRAIL-M referenced in [2411.04125v1.pdf])
- **Finetuned from:** timm/vit_small_patch16_384.augreg_in21k_ft_in1k
- **Adapted for HF** inference compatibility by AI Without Borders.

**HF Space will be open sourced shortly showcasing various ways to run ultra-fast inference. Make sure to follow us for updates, as we will be releasing a slew of projects in the coming weeks.**

### Links
- **Repository:** [JeongsooP/Community-Forensics](https://github.com/JeongsooP/Community-Forensics)
- **Paper:** [arXiv:2411.04125](https://arxiv.org/pdf/2411.04125)
- **Project Page:** https://jespark.net/projects/2024/community_forensics

## Training Details
### Training Data
- 2.7mil images from 15+ generators, 4600+ models
- Over 1.15TB worth of images

### Training Hyperparameters
- **Framework:** PyTorch 2.0
- **Precision:** bf16 mixed
- **Optimizer:** AdamW (lr=5e-5)
- **Epochs:** 10
- **Batch Size:** 32

## Evaluation
### Unverified Testing Results
- Only unverified because we currently lack resources to evaluate a dataset over 1.4T large.

| Metric        | Value |
|---------------|-------|
| Accuracy      | 97.2% |
| F1 Score      | 0.968 |
| AUC-ROC       | 0.992 |
| FP Rate       | 2.1%  |

![image/png](https://cdn-uploads.huggingface.co/production/uploads/639daf827270667011153fbc/g-dLzxLBw1RAuiplvFCxh.png)

## Re-sampled and refined dataset

- **Coming soon™**

## Citation
**BibTeX:**
```bibtex
@misc{park2024communityforensics,
    title={Community Forensics: Using Thousands of Generators to Train Fake Image Detectors}, 
    author={Jeongsoo Park and Andrew Owens},
    year={2024},
    eprint={2411.04125},
    archivePrefix={arXiv},
    primaryClass={cs.CV},
    url={https://arxiv.org/abs/2411.04125}, 
}
```
