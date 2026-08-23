---
uid: learned_positional_encoding_definition_positional_encoding_m
from: learned_positional_encoding
to: positional_encoding_mechanism
type: definition
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: '2026-08-07'
lineage:
  type: ''
  parents: []
  inherit_rules: []
domains: []
created: '2026-08-07'
---

## 機制說明

訓練學習的位置編碼是將位置索引視為可訓練參數，讓模型在訓練中自動調整的編碼方法。

## 已知限制 / 適用邊界

無法處理超過訓練時所見過的最大長度的序列。

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記明確定義了「透過模型訓練學習」的方法及其主要缺點。

