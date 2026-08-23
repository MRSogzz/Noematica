---
uid: rope_encoding_causal_relative_position
from: rope_encoding
to: relative_position
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

RoPE是結合了絕對位置與相對位置優點的創新設計，因此它是一種實現相對位置編碼的進階方法。

## 已知限制 / 適用邊界

（未明確指出，但它是對傳統相對位置的升級）

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記提到「近年來流行的 RoPE（旋轉位置編碼）即是結合了絕對位置與相對位置優點的創新設計」。

