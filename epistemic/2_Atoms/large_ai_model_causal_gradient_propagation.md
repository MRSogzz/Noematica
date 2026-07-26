---
uid: large_ai_model_causal_gradient_propagation
from: large_ai_model
to: gradient_propagation
type: causal
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: '2026-07-18'
lineage:
  type: ''
  parents: []
  inherit_rules: []
domains: []
created: '2026-07-18'
---

## 機制說明

隨著網路層數增加，反向傳播時梯度會逐層衰減。

## 已知限制 / 適用邊界

此現象主要發生在深層網路中。

## 抽取來源

由 note_extractor 從筆記「大型LLM的困難」自動抽取，待審查。
LLM 判讀理由：筆記明確指出深層網路的挑戰之一就是梯度消失（梯度傳遞問題）。

