---
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

Top-P抽樣動態地選擇機率總和達到P的最小候選集合，靈活調整候選詞數量。

## 已知限制 / 適用邊界

在維持多樣性的同時，避免納入過多不合理的選項。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記描述了Top-P抽樣的動態選擇機制，即根據機率總和P來決定候選詞的集合。

