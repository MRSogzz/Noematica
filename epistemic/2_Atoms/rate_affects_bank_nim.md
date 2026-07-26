---
uid: rate_affects_bank_nim
from: fed_funds_rate
to: bank_net_interest_margin
type: causal
abstraction:
  level: 2
  jump_allowed: false
status: active
lifecycle:
  status: active
  last_review: "2026-07-12"
lineage:
  type: ""
  parents: []
  inherit_rules: []
domains: [macro, finance]
created: "2026-07-12"
---

## 機制說明

升息通常使銀行放款利率上調速度快於存款利率，短期內擴大淨利差；但升息週期後段若存款競爭加劇
或客戶轉向高息商品，淨利差擴大效果會遞減甚至反轉。

## 已知限制 / 適用邊界

- 在流動性極度寬鬆、銀行不缺存款時，效果較弱。
- 若殖利率曲線倒掛，長短期利差壓縮可能抵銷此效果。
