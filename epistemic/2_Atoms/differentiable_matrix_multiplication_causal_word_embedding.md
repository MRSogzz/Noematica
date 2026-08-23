---
uid: differentiable_matrix_multiplication_causal_word_embedding
from: differentiable_matrix_multiplication
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

可導的矩陣相乘是實現詞嵌入的運算機制，它允許模型將輸入的Token ID轉換為具語意的連續向量。

## 已知限制 / 適用邊界

（未明確指出，但它需要一個可訓練的嵌入矩陣作為基礎）

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記描述了詞元向量提取的過程是「透過可導的矩陣相乘」完成的。

