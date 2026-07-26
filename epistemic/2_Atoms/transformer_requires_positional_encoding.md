---
uid: transformer_requires_positional_encoding
from: transformer_architecture
to: positional_encoding_mechanism
type: constraint
abstraction:
  level: 3
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: "2026-07-16"
lineage:
  type: ""
  parents: []
  inherit_rules: []
domains: [nlp, deep_learning]
created: "2026-07-16"
---

## 機制說明

Transformer 的自注意力機制本身不具備順序概念（對它來說「我愛你」跟「你愛我」的詞袋是
一樣的），因此架構上「必須」額外注入位置資訊，否則模型會失去語序這個重要的語意線索。
這是一個結構性的限制關係（constraint），不是可有可無的優化。

## 已知限制 / 適用邊界

不同的位置編碼實作方式（Learned / Sinusoidal / RoPE）在效果與外推能力上有差異，
但「需要某種位置資訊」這件事本身是 Transformer 架構的必要條件。

## 備註

（種子資料，供 Correlation Engine 範例測試使用）
