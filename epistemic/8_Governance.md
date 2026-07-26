# 8_Governance.md — 系統憲法

本文件是給「人」看的治理說明；機器實際讀取的參數在 [`../runtime/policy/policy.yaml`](../runtime/policy/policy.yaml)
（由 `runtime/policy/policy_engine.py` 載入，供 Activation Engine 與 Governance Auditor 共用）。
兩者必須保持一致。若你調整任一數值，**兩個檔案都要改**，並在下方「變更紀錄」留下一筆。

## 1. 分層原則（不可違反）

| 層級 | 目錄 | 可變性 |
|---|---|---|
| Entity | `1_Entities/` | 可編輯（描述性資訊） |
| Atom | `2_Atoms/` | **骨架不可修改**，只能變更 `status`/`lifecycle`；機制若被推翻，建新 Atom 並用 `lineage` 指回舊節點 |
| Observation | `3_Observations/` | 只增不改；發現錯誤就新增一筆 `stance: contradict` 並填 `contradiction_reason`，而不是刪除舊紀錄 |
| Source | `4_Sources/` | 可編輯摘要，但 `source_fingerprint` 一旦使用不可更改 |

這個「Atom 不可變、Observation 只增」的設計，是整套系統能撐過長時間、多人協作而不腐化的核心——
歷史判斷永遠留痕，新證據永遠是疊加而非覆寫。

## 2. 信心衰減政策

不同類型的 Atom，其「推導信心」有不同上限（見 `runtime_policy.yaml: confidence_decay`）：

- `definition`（定義類）上限最高 0.95 —— 定義通常穩定。
- `causal`（因果類）上限 0.60 —— 因果宣稱天生有更高不確定性。
- `heuristic`（經驗法則）與 `analogy`（類比）上限最低（0.45 / 0.35）——最容易過度推廣。

## 3. 證據獨立性規則

證據強度以**去重後的 `source_fingerprint` 數量**計算，而非 Observation 篇數。
十篇引用同一份央行報告的觀測，證據獨立性等同於一篇。

## 4. 棄權門檻（Abstention）

系統在以下任一情況必須明確棄權，而不是給出低信心但仍然肯定的答案：

- Path Confidence < 0.4
- 激活的 Observation 少於 2 筆
- Context 五維度匹配率 < 60%

棄權不是失敗，是誠實。棄權時應退化為「歷史基線」模式並明確告知使用者依據薄弱。

## 5. 調解提案觸發門檻

當同一個 Atom 底下，support 與 contradict 的 Observation 合計超過 5 筆，
且時間跨度達 18 個月以上，Governance Auditor 才會自動產生 `mediation_proposal_[atom_uid].md`。
門檻刻意設高，避免系統對正常的、短期的訊號雜訊過度反應。

## 6. 生命週期自動審查規則

若一個 `causal` 或 `heuristic` 類型的 Atom，最後一筆 `stance: support` 的 Observation
已超過 24 個月未更新，會被自動列入 `.index/generated/debt_report.tsv`，
提示人類：這個關係可能已經過時、需要重新檢驗是否仍成立。

## 7. 人類的職責邊界

系統自動化了索引、激活、稽核；但以下判斷永遠保留給人類：

- 是否要新增全新的 Atom（機制假設本身需要人的判斷）。
- 是否接受 `mediation_proposal`（是否形成 Meta-Observation 共識）。
- 是否調整本文件與 `runtime_policy.yaml` 中的門檻參數。

## 變更紀錄

| 日期 | 變更內容 | 變更者 |
|---|---|---|
| （建立日）| 初版建立 | — |
