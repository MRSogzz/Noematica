---
uid: word2vec_causal_transformer
from: word2vec
to: transformer_architecture
type: causal
abstraction:
  level: 2
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

Word2Vec 證明了「詞彙可以用稠密向量捕捉語意關係」這個想法可行，為後續發展出能處理
上下文動態調整的 Transformer 架構鋪路——沒有 Word2Vec 證明語意向量化的價值，就不會有
後續大規模投入研究更精細的上下文相關嵌入模型。

## 已知限制 / 適用邊界

這是概念演進上的推動關係，不是嚴格的技術依賴——Transformer 的自注意力機制本身
並非直接建構在 Word2Vec 的演算法之上，是兩條平行發展、後來匯流的技術路線。

## 備註

（種子資料，供 Correlation Engine 範例測試使用）
