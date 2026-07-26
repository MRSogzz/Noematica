---
uid: 2023Q4_rate_nim_obs
atom: rate_affects_bank_nim
epoch: "2023Q4"
context:
  market_regime:      { value: risk_on, confidence: 0.5 }
  monetary_policy:     { value: tightening, confidence: 0.7 }
  liquidity:           { value: ample, confidence: 0.5 }
  inflation:           { value: falling, confidence: 0.5 }
  geopolitical:        { value: stable, confidence: 0.5 }
impact: 25
probability: 0.5
stance: support
contradicts: []
contradiction_reason: ""
confidence:
  value: 0.5
  basis: direct
evidence: ["[[4_Sources/fed_2023_h1_report.md]]"]
created: "2026-07-12"
---

## 觀測敘述

年底部分大型銀行淨利差短暫回升，因升息暫緩使存款成本壓力略為緩解。

## 解讀

再度支持原始機制，但信心較低（基礎樣本小）。這是目前資料中「最後一筆 support」，
之後（2024Q2、2024Q4）皆為 contradict，因此會被 Index Builder 標記為知識債務。
