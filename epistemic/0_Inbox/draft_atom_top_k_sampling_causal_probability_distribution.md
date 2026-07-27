---
draft_type: atom
approved: false
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

Top-K抽樣從機率分布中篩選出前 K 個候選詞，從而限制了抽樣的範圍。

## 已知限制 / 適用邊界

Top-K抽樣是基於機率分布的篩選機制。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記提到Top-K抽樣「只從機率排名前 K 個的候選詞中進行抽樣」，這是對機率分布的限制。

