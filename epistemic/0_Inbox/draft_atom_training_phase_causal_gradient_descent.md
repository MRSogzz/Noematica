---
draft_type: atom
approved: false
uid: training_phase_causal_gradient_descent
from: training_phase
to: gradient_descent
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

訓練階段透過梯度下降等優化演算法，不斷調整模型參數以降低損失值。

## 已知限制 / 適用邊界

梯度下降是實現降低損失值的關鍵手段之一。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記明確指出訓練的整體目標是「透過反向傳播與梯度下降等優化演算法，不斷調整模型內部的數十億甚至數千億個參數，逐步降低損失值」。

