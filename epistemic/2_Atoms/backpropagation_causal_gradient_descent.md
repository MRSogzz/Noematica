---
uid: backpropagation_causal_gradient_descent
from: backpropagation
to: gradient_descent
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

反向傳播計算出梯度，為梯度下降提供方向和幅度資訊，從而指導參數調整。

## 已知限制 / 適用邊界

反向傳播是梯度下降的計算基礎。

## 抽取來源

由 note_extractor 從筆記「LLM注意力機制」自動抽取，待審查。
LLM 判讀理由：筆記將「反向傳播」和「梯度下降」並列為優化演算法，且它們是共同實現降低損失值的手段，因此存在強烈的因果/協同關係。

