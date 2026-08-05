---
uid: temperature_analogy_greedy_decoding
from: temperature
to: greedy_decoding
type: analogy
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

當溫度係數為0時，機率分布會變得極度尖銳，等同於每次都選擇最高機率的詞彙（貪婪解碼）。

## 已知限制 / 適用邊界

此為溫度係數在特定極限值下的行為類比。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記明確指出：「溫度為 0：等同於貪婪解碼，每次都選最高機率的詞」。

