---
uid: 2023Q2_rate_nim_obs
atom: rate_affects_bank_nim
epoch: "2023Q2"
context:
  market_regime:      { value: risk_off, confidence: 0.5 }
  monetary_policy:     { value: tightening, confidence: 0.85 }
  liquidity:           { value: tight, confidence: 0.7 }
  inflation:           { value: rising, confidence: 0.6 }
  geopolitical:        { value: stable, confidence: 0.5 }
impact: -30
probability: 0.55
stance: contradict
contradicts: ["2023Q1_rate_nim_obs"]
contradiction_reason: context_change
confidence:
  value: 0.5
  basis: direct
evidence: ["[[4_Sources/bank_earnings_calls_2023_2024.md]]"]
created: "2026-07-12"
---

## 觀測敘述

部分區域銀行反映存款客戶開始轉向貨幣市場基金，存款成本上升速度快於預期，淨利差反而收窄。

## 解讀

反駁 obs 2023Q1 的樂觀假設；原因標記為 `context_change`——不同銀行的存款結構不同，
機制本身可能沒錯，只是適用條件更窄。
