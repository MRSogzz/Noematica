---
uid: residual_connection_causal_gradient_propagation
from: residual_connection
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

殘差連接建立捷徑，使資訊和梯度能繞過層級順利回流到淺層。

## 已知限制 / 適用邊界

適用於深層網路的結構設計。

## 抽取來源

由 note_extractor 從筆記「大型LLM的困難」自動抽取，待審查。
LLM 判讀理由：筆記描述殘差連接如何讓梯度經由捷徑順利回流，解決梯度消失問題。

