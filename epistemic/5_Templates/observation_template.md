---
uid: ""                        # 唯一識別碼，如 2024Q1_rate_bank_obs
atom: ""                       # 指向 Atom uid
epoch: ""                      # 如 2024Q1、2024-03 等，需與其他觀測可比較排序
context:
  market_regime:      { value: "", confidence: 0.0 }   # 如 risk_on / risk_off
  monetary_policy:     { value: "", confidence: 0.0 }   # 如 tightening / easing / neutral
  liquidity:           { value: "", confidence: 0.0 }   # 如 ample / tight
  inflation:           { value: "", confidence: 0.0 }   # 如 rising / falling / stable
  geopolitical:        { value: "", confidence: 0.0 }   # 如 stable / elevated_risk
impact: 0                      # 數值，如 80 或 -60，代表對 Atom 關係強度/方向的影響
probability: 0.0               # 0~1，此觀測描述之事件/關係成立的機率
stance: neutral                 # support | contradict | neutral
contradicts: []                # 若 stance = contradict，填被反駁的 Observation uid
contradiction_reason: ""       # context_change | mechanism_change | measurement_error | true_conflict
confidence:
  value: 0.0                   # 0~1
  basis: direct                # direct | derived | inherited
evidence: []                   # 指向 [[4_Sources/xxx.md]] 的引用列表
created: ""                    # YYYY-MM-DD
---

## 觀測敘述

（具體發生了什麼？盡量客觀陳述，避免與「機制解釋」混淆——機制屬於 Atom 層。）

## 解讀

（此觀測支持、反駁、或補充了對應 Atom 的哪個面向？）
