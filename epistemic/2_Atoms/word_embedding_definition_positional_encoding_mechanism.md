---
uid: word_embedding_definition_positional_encoding_mechanism
from: word_embedding
to: positional_encoding_mechanism
type: definition
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

詞嵌入的完整輸入表徵需要包含詞元向量（語意）和位置向量（順序）的組合。

## 已知限制 / 適用邊界

單純的詞元向量無法區分詞彙的順序。

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記提到「一個完整的嵌入向量必須同時包含兩個關鍵組成部分：詞元向量和位置向量」。

