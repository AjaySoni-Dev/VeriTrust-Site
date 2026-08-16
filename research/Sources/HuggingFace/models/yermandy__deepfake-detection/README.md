---
license: mit
tags:
- pytorch
pipeline_tag: image-classification
---

# Unlocking the Hidden Potential of CLIP in Generalizable Deepfake Detection

[![arXiv Badge](https://img.shields.io/badge/arXiv-B31B1B?logo=arxiv&logoColor=FFF)](https://arxiv.org/abs/2503.19683) [![GitHub Badge](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=fff)](https://github.com/yermandy/deepfake-detection)

This repository contains the model for the paper:

**[Unlocking the Hidden Potential of CLIP in Generalizable Deepfake Detection](https://arxiv.org/abs/2503.19683)**

## Abstract

> This paper tackles the challenge of detecting partially manipulated facial deepfakes, which involve subtle alterations to specific facial features while retaining the overall context, posing a greater detection difficulty than fully synthetic faces. We leverage the Contrastive Language-Image Pre-training (CLIP) model, specifically its ViT-L/14 visual encoder, to develop a generalizable detection method that performs robustly across diverse datasets and unknown forgery techniques with minimal modifications to the original model. The proposed approach utilizes parameter-efficient fine-tuning (PEFT) techniques, such as LN-tuning, to adjust a small subset of the model's parameters, preserving CLIP's pre-trained knowledge and reducing overfitting. A tailored preprocessing pipeline optimizes the method for facial images, while regularization strategies, including L2 normalization and metric learning on a hyperspherical manifold, enhance generalization. Trained on the FaceForensics++ dataset and evaluated in a cross-dataset fashion on Celeb-DF-v2, DFDC, FFIW, and others, the proposed method achieves competitive detection accuracy comparable to or outperforming much more complex state-of-the-art techniques. This work highlights the efficacy of CLIP's visual encoder in facial deepfake detection and establishes a simple, powerful baseline for future research, advancing the field of generalizable deepfake detection.

## Results

Generalization of models trained on the FF++ dataset to unseen datasets and forgery methods. Reported values are **video-level AUROC**. Results of other methods are taken from their original papers. Values with * are taken from the other papers.

| Model                  | Year | Publication | CDFv2 | DFD   | DFDC  | FFIW  | DSv1  |
|------------------------|------|-------------|-------|-------|-------|-------|-------|
| LipForensics           | 2021 | CVPR        | 82.4  | --    | 73.5  | --    | --    |
| FTCN                   | 2021 | ICCV        | 86.9  | --    | 74.0  | 74.47* | --    |
| RealForensics          | 2022 | CVPR        | 86.9  | --    | 75.9  | --    | --    |
| SBI                    | 2022 | CVPR        | 93.18 | 82.68 | 72.42 | 84.83 | --    |
| AUNet                  | 2023 | CVPR        | 92.77 | 99.22 | 73.82 | 81.45 | --    |
| StyleDFD               | 2024 | CVPR        | 89.0  | 96.1  | --    | --    | --    |
| LSDA                   | 2024 | CVPR        | 91.1  | --    | 77.0  | 72.4*  | --    |
| LAA-Net                | 2024 | CVPR        | 95.4  | 98.43 | 86.94 | --    | --    |
| AltFreezing            | 2024 | CVPR        | 89.5  | 98.5  | 99.4  | --    | --    |
| NACO                   | 2024 | ECCV        | 89.5  | --    | 76.7  | --    | --    |
| TALL++                 | 2024 | IJCV        | 91.96 | --    | 78.51 | --    | --    |
| UDD                    | 2025 | arXiv       | 93.13 | 95.51 | 81.21 | --    | --    |
| Effort                 | 2025 | arXiv       | 95.6  | 96.5  | 84.3  | 92.1  | --    |
| KID                    | 2025 | arXiv       | 95.74 | 99.46 | 75.77 | 82.53 | --    |
| ForensicsAdapter       | 2025 | arXiv       | 95.7  | 97.2  | 87.2  | --    | --    |
| **Proposed**           | 2025 | arXiv       | 96.62 | 98.0  | 87.15 | 91.52 | 92.01 |

## Example

See usage examples in our [github](https://github.com/yermandy/deepfake-detection) project

## Cite

``` bibtex
@article{yermakov-2025-deepfake-detection,
    title={Unlocking the Hidden Potential of CLIP in Generalizable Deepfake Detection}, 
    author={Andrii Yermakov and Jan Cech and Jiri Matas},
    year={2025},
    eprint={2503.19683},
    archivePrefix={arXiv},
    primaryClass={cs.CV},
    url={https://arxiv.org/abs/2503.19683}, 
}
```
