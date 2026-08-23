---
uid: backpropagation_causal_word_embedding
from: backpropagation
to: word_embedding
type: causal
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: '2026-08-07'
lineage:
  type: ''
  parents: []
  inherit_rules: []
domains: []
created: '2026-08-07'
---

## 機制說明

由於嵌入層操作是可導的，損失函數可以透過反向傳播將誤差訊號傳遞給嵌入矩陣，從而優化詞嵌入的數值。

## 已知限制 / 適用邊界

必須先有可導的矩陣運算作為基礎。

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記最後總結了「損失函數可以透過反向傳播（Backpropagation）將誤差訊號一路傳遞迴嵌入矩陣」。

