---
uid: dropout_causal_overfitting
from: dropout
to: overfitting
type: causal
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: '2026-07-18'
lineage:
  type: ''
  parents: []
  inherit_rules: []
domains: []
created: '2026-07-18'
---

## 機制說明

Dropout隨機停用神經元，強迫網路學習更具魯棒性的特徵表示，從而防止過擬合。

## 已知限制 / 適用邊界

適用於模型訓練階段的隨機停用機制。

## 抽取來源

由 note_extractor 從筆記「大型LLM的困難」自動抽取，待審查。
LLM 判讀理由：筆記指出Dropout的目的是提升泛化能力，這直接對抗了過擬合。

