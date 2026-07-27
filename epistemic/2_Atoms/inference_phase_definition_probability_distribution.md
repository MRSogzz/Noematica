---
uid: inference_phase_definition_probability_distribution
from: inference_phase
to: probability_distribution
type: definition
abstraction:
  level: 1
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

在推理階段，模型會計算出下一個Token的機率分布。

## 已知限制 / 適用邊界

這是推理階段的核心輸出。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記明確指出當模型進入推理階段時，會計算出下一個Token的機率分布。

