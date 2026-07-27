---
draft_type: atom
approved: false
uid: inference_phase_causal_probability_distribution
from: inference_phase
to: probability_distribution
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

在推理階段，模型根據輸入的提示，會計算出下一個Token的機率分布。

## 已知限制 / 適用邊界

機率分布是推理階段的計算結果。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記提到：「當模型訓練完成並進入推理（生成）階段時，目標從『精確預測』轉變為『生成連貫且自然的文本』。此時，模型會根據輸入的提示（Prompt），計算出下一個 Token 的機率分布」。

