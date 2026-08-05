---
uid: top_k_sampling_causal_probability_distribution
from: top_k_sampling
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

Top-K抽樣從機率分布中過濾掉低機率的候選詞，只保留前K個。

## 已知限制 / 適用邊界

能有效排除明顯不適當的選項，同時保留一定多樣性。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記說明Top-K抽樣是從機率排名前K個候選詞中進行抽樣，這是一種對機率分布的限制和篩選。

