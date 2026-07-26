# integration/contracts/ — 三份 Contract

`application/`（llm-wiki）與 `epistemic/`（認知核心）之間，只允許透過這三份
JSON Schema 定義的形狀溝通，彼此不互相 import 內部實作。

| Contract | 方向 | 檔案 | 由誰產生 |
|---|---|---|---|
| Query Contract | llm-wiki → epistemic | `query_contract.schema.json` | LLM 把使用者問題解析成結構化查詢 |
| Belief Contract | epistemic → llm-wiki | `belief_contract.schema.json` | `runtime/reasoning/reasoning_engine.py` |
| Feedback Contract | llm-wiki → epistemic | `feedback_contract.schema.json` | 使用者對某次回答的反饋 |

`integration/epistemic_adapter/adapter.py` 是唯一實際做 schema 驗證＋呼叫 runtime 的地方
（`jsonschema.validate` 在 `handle_query` / `handle_feedback` 開頭就會擋掉不合規格的輸入）。

## 開發順序（建議照這個順序做，不要一次全上）

- **Step 1（唯讀）**：`application/` 呼叫 `adapter.handle_query()`，只做 Query → Observation 回傳。
  目前 repo 這個狀態已經可以動（見 `integration/wiki_adapter/client_example.py`）。
- **Step 2**：Activation Engine 的 Support / Contradiction / Baseline 三桶邏輯（已完成，
  見 `runtime/activation/activation_engine.py`）。
- **Step 3**：Policy Engine 的 confidence / abstention / uncertainty（已完成，
  見 `runtime/policy/policy_engine.py`，並整合進 Activation Engine 與 Reasoning Engine）。
- **Step 4（寫回）**：讓 LLM 可以透過 Feedback Contract 建 Observation / Inbox 提案 / Blind Spot。
  目前 `adapter.handle_feedback()` 只做「忠實記錄進 `7_Query_History/`」，**故意不**
  自動建立 Observation——那一步應該經過 `runtime/compiler/compiler.py` 的驗證與人類核准
  （`approved: true`）才能落地，避免 LLM 的反饋沒有把關就污染知識庫。這是與原建議文件
  唯一的刻意偏離之處，理由見下方「設計決策」。

## 設計決策：為什麼 Feedback 不直接寫 Observation

原建議文件裡 Feedback Contract 的例子（`signal: low_confidence`）看起來像是要直接
影響某筆 Observation 的信心值。但 `epistemic/8_Governance.md` 的核心原則是
「Observation 只增不改」——如果 Feedback 可以繞過 Compiler 直接改資料，
這條原則就形同虛設。所以目前的實作把 Feedback 定位成「新的一筆待審資料」，
真正要影響知識庫，走的路徑是：

```
使用者反饋 → 7_Query_History/feedback_*.json（本次已完成）
           → （未來）Governance Auditor 或人類，判斷是否要為此建一筆新 Observation
           → 草稿寫進 0_Inbox/（draft_type: observation, approved: false）
           → 人類审閱後把 approved 改成 true
           → Compiler 編譯進 3_Observations/
```

如果你要的是「LLM 自動根據反饋建草稿」，可以在 `runtime/reasoning/` 加一個函式，
把 feedback 轉成 `0_Inbox/` 的草稿檔（`approved: false`），但預設不核准，
這樣既能自動化又不破壞治理原則。目前版本沒有實作這一步，先留一個明確的擴充點。
