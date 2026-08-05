---
uid: temperature_causal_probability_distribution
from: temperature
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

Temperature參數透過調整機率分佈的平滑度來影響詞彙的選擇機率。

## 已知限制 / 適用邊界

低溫度使分布尖銳（確定/保守）；高溫度使分布平滑（隨機/創造性）。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記描述了Temperature如何作用於機率分佈，並給出了低溫和高溫的具體影響。

