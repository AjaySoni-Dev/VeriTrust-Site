---
license: apache-2.0
base_model: bert-large-uncased
tags:
- generated_from_trainer
- phishing
- BERT
metrics:
- accuracy
- precision
- recall
model-index:
- name: bert-finetuned-phishing
  results: []
widget:
- text: https://www.verif22.com
  example_title: Phishing URL
- text: Dear colleague, An important update about your email has exceeded your
    storage limit. You will not be able to send or receive all of your messages.
    We will close all older versions of our Mailbox as of Friday, June 12, 2023.
    To activate and complete the required information click here (https://ec-ec.squarespace.com). 
    Account must be reactivated today to regenerate new space. Management Team
  example_title: Phishing Email
- text: You have access to FREE Video Streaming in your plan. REGISTER with your email, password and 
    then select the monthly subscription option. https://bit.ly/3vNrU5r
  example_title: Phishing SMS
- text: if(data.selectedIndex > 0){$('#hidCflag').val(data.selectedData.value);};;
    var sprypassword1 = new Spry.Widget.ValidationPassword("sprypassword1");
    var sprytextfield1 = new Spry.Widget.ValidationTextField("sprytextfield1", "email");
  example_title: Phishing Script
- text: Hi, this model is really accurate :)
  example_title: Benign message
datasets:
- ealvaradob/phishing-dataset
language:
- en
pipeline_tag: text-classification
---

<!-- This model card has been generated automatically according to the information the Trainer had access to. You
should probably proofread and complete it, then remove this comment. -->

# BERT FINETUNED ON PHISHING DETECTION

This model is a fine-tuned version of [bert-large-uncased](https://huggingface.co/bert-large-uncased) on an [phishing dataset](https://huggingface.co/datasets/ealvaradob/phishing-dataset),
capable of detecting phishing in its four most common forms: URLs, Emails, SMS messages and even websites. 

It achieves the following results on the evaluation set:

- Loss: 0.1953
- Accuracy: 0.9717
- Precision: 0.9658
- Recall: 0.9670
- False Positive Rate: 0.0249

## Model description

BERT is a transformers model pretrained on a large corpus of English data in a self-supervised fashion. 
This means it was pretrained on the raw texts only, with no humans labelling them in any way (which is why 
it can use lots of publicly available data) with an automatic process to generate inputs and labels from 
those texts.

This model has the following configuration:

- 24-layer
- 1024 hidden dimension
- 16 attention heads
- 336M parameters

## Motivation and Purpose

Phishing is one of the most frequent and most expensive cyber-attacks according to several security reports. 
This model aims to efficiently and accurately prevent phishing attacks against individuals and organizations. 
To achieve it, BERT was trained on a diverse and robust dataset containing: URLs, SMS Messages, Emails and 
Websites, which allows the model to extend its detection capability beyond the usual and to be used in various 
contexts.

### Training hyperparameters

The following hyperparameters were used during training:
- learning_rate: 2e-05
- train_batch_size: 16
- eval_batch_size: 16
- seed: 42
- optimizer: Adam with betas=(0.9,0.999) and epsilon=1e-08
- lr_scheduler_type: linear
- num_epochs: 4

### Training results

| Training Loss | Epoch | Step  | Validation Loss | Accuracy | Precision | Recall | False Positive Rate |
|:-------------:|:-----:|:-----:|:---------------:|:--------:|:---------:|:------:|:-------------------:|
| 0.1487        | 1.0   | 3866  | 0.1454          | 0.9596   | 0.9709    | 0.9320 | 0.0203              |
| 0.0805        | 2.0   | 7732  | 0.1389          | 0.9691   | 0.9663    | 0.9601 | 0.0243              |
| 0.0389        | 3.0   | 11598 | 0.1779          | 0.9683   | 0.9778    | 0.9461 | 0.0156              |
| 0.0091        | 4.0   | 15464 | 0.1953          | 0.9717   | 0.9658    | 0.9670 | 0.0249              |


### Framework versions

- Transformers 4.34.1
- Pytorch 2.1.1+cu121
- Datasets 2.14.6
- Tokenizers 0.14.1
