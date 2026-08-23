---
uid: positional_encoding_mechanism_causal_word_embedding
from: positional_encoding_mechanism
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

位置向量被加入到詞元向量中，從而補充了詞彙的順序資訊，使得詞嵌入能夠捕捉到語言的順序結構。

## 已知限制 / 適用邊界

如果沒有位置向量，詞嵌入將缺乏順序感。

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：筆記強調位置向量「補充詞彙在句子中的順序資訊」，這是實現完整詞嵌入的關鍵機制。

