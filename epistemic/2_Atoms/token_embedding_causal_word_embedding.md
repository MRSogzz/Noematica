---
uid: token_embedding_causal_word_embedding
from: token_embedding
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

詞元向量是詞嵌入的組成部分，它提供了詞彙本身的語意內涵，從而構成了完整的詞嵌入。

## 已知限制 / 適用邊界

單獨來看，它無法提供詞彙在句子中的順序資訊。

## 抽取來源

由 note_extractor 從筆記「Word_Embedding的位置訊息」自動抽取，待審查。
LLM 判讀理由：詞元向量是構成最終詞嵌入的基礎，是語意表徵的來源。

