---
draft_type: atom
approved: false
uid: training_phase_causal_cross_entropy_loss
from: training_phase
to: cross_entropy_loss
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

訓練階段使用交叉熵損失函數來衡量預測的好壞（即預測誤差）。

## 已知限制 / 適用邊界

僅在訓練階段使用。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記指出在訓練過程中，使用交叉熵損失函數來計算預測機率分布與實際目標詞之間的差距。

