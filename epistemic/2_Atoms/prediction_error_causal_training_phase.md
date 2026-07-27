---
uid: prediction_error_causal_training_phase
from: prediction_error
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

模型透過反向傳播和梯度下降不斷調整參數，目的是降低預測誤差（損失值）。

## 已知限制 / 適用邊界

此為訓練階段的整體目標。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記指出訓練的整體目標是透過優化演算法，不斷降低損失值，從而提升預測準確度。

