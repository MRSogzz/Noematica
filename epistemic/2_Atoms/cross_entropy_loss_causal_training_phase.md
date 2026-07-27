---
uid: cross_entropy_loss_causal_training_phase
from: cross_entropy_loss
to: training_phase
type: causal
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: '2026-07-27'
lineage:
  type: ''
  parents: []
  inherit_rules: []
domains: []
created: '2026-07-27'
---

## 機制說明

損失值越大，代表預測越離譜，驅動模型進行調整以降低損失值。

## 已知限制 / 適用邊界

損失值是驅動訓練優化的直接指標。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記提到「損失值越大，代表模型的預測越離譜」，這直接促使訓練過程（Training）的優化。

