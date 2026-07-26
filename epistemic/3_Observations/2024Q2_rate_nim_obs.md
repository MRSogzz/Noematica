---
uid: 2024Q2_rate_nim_obs
atom: rate_affects_bank_nim
epoch: "2024Q2"
context:
  market_regime:      { value: risk_on, confidence: 0.5 }
  monetary_policy:     { value: neutral, confidence: 0.6 }
  liquidity:           { value: ample, confidence: 0.55 }
  inflation:           { value: falling, confidence: 0.6 }
  geopolitical:        { value: stable, confidence: 0.5 }
impact: -20
probability: 0.5
stance: contradict
contradicts: ["2023Q4_rate_nim_obs"]
contradiction_reason: context_change
confidence:
  value: 0.45
  basis: direct
evidence: ["[[4_Sources/bank_earnings_calls_2023_2024.md]]"]
created: "2026-07-12"
---

## 觀測敘述

利率進入平台期後，銀行淨利差擴大效果消失，多數銀行回報淨利差持平或略降。

## 解讀

反駁機制在「利率平台期」仍然成立；標記 `context_change`——原機制描述的是升息階段，
而非利率持平階段。
