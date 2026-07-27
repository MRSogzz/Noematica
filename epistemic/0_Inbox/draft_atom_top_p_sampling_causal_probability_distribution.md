---
draft_type: atom
approved: false
uid: top_p_sampling_causal_probability_distribution
from: top_p_sampling
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

Top-P抽樣動態選擇機率總和達到 P 的最小候選集合，從而決定了抽樣的範圍。

## 已知限制 / 適用邊界

Top-P抽樣是基於機率分布的動態篩選機制。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記提到Top-P抽樣「動態選擇機率總和達到 P（例如 0.9）的最小候選集合」，這是對機率分布的動態限制。

