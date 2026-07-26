<!-- 本檔案由自動化服務產生，請勿手動編輯內容以外的區塊。重新執行會覆寫本檔案的自動部分，但保留「人類決議」區塊。 -->

# 調解提案：rate_affects_bank_nim

- Atom: `rate_affects_bank_nim` (fed_funds_rate → bank_net_interest_margin, type=causal)
- 衝突觀測總數: 6（support: 2, contradict: 4）
- 觀測時間跨度: 21.0 個月

### 建議下一步

1. 檢視是否為 `context_change`——若是，考慮拆分為兩個更精確的子 Atom（`lineage.type = split`）。
2. 檢視是否為 `mechanism_change`——若機制已改變，建新 Atom 並用 `lineage.type = replacement` 指回本節點，並將本節點 `status` 改為 `deprecated`。
3. 若屬雜訊或真實對立且無法化解，可新增一筆 Meta-Observation 記錄共識（非強制）。


## 人類決議

- [ ] 已審閱
- 決議：（待填寫）
- 決議日期：（待填寫）
