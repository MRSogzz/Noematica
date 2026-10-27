# LLM WIKI（application/）

> 人機協作知識管理系統 — Markdown SSOT × 代碼 I/O 週期表 × 測試監控 × CLI 工具

這是原本 `LLMwiki_hub` 專案的完整程式碼，現在是 `my-knowledge-repo` 這個 monorepo 底下的
Application Layer。它是一個**自帶完整工具鏈的獨立 Node/TS 專案**——`package.json`、
`tsconfig.json`、`node_modules/` 都在這一層，不在 repo 根目錄。

**跟原本 repo 的唯一差異**：`docs/` 搬到了 repo 頂層的 `../knowledge/docs/`，
AI 產出的 `wiki/` 搬到了 `../knowledge/wiki/`——因為它們是「知識內容」而非「應用程式碼」。
所有指令一樣在這個目錄（`application/`）底下執行，路徑會自動透過 `DOCS_DIR`/`WIKI_DIR`
環境變數（預設 `../knowledge/docs`、`../knowledge/wiki`）找到正確位置。

---

## 快速開始

```bash
cd application
npm install

cp .env.example .env
# 填入 GITHUB_TOKEN、OPENAI_API_KEY、ANTHROPIC_API_KEY 等

npm run dev:all           # 同時啟動 Python epistemic 服務 + Node 後端
npx serve frontend/       # 另開終端：前端 HUD（port 3000）
npm run wiki -- help      # 另開終端：CLI
```

---

## 🔌 Epistemic 整合（方案 1：HTTP 服務）

`epistemic/` + `runtime/` 是 Python，這裡是 Node/TypeScript，兩者語言不同沒辦法互相
`import`。整合方式：把 `integration/epistemic_adapter/adapter.py` 包成一個獨立的 FastAPI
服務（`integration/epistemic_adapter/http_server.py`，預設監聽 `127.0.0.1:8765`），
`backend/server.ts` 用 `fetch()` 呼叫它——跟現在呼叫 Anthropic/OpenAI 是同一種整合模式。

```
Node 後端 (application/backend/server.ts)
   │  fetch('http://127.0.0.1:8765/query' 或 '/feedback')
   ▼
Python 服務 (integration/epistemic_adapter/http_server.py, FastAPI)
   │  jsonschema 驗證 → adapter.handle_query() / handle_feedback()
   ▼
runtime/reasoning → runtime/activation → runtime/policy → epistemic/*.md
```

**新增的端點/指令：**

| 層 | 位置 | 說明 |
|---|---|---|
| Node API | `GET /api/epistemic/health` | 檢查 Python 服務是否連線正常 |
| Node API | `POST /api/epistemic/query` | Query Contract → Belief Contract |
| Node API | `POST /api/epistemic/feedback` | Feedback Contract → 寫入 `epistemic/7_Query_History/` |
| CLI | `wiki epistemic health` | 同上，CLI 版本 |
| CLI | `wiki epistemic query --atom <uid> [--context '{}']` | 同上 |
| CLI | `wiki epistemic feedback --target <uid> --signal <signal> [--note ...]` | 同上 |

**同時啟動兩個服務**：`npm run dev:all`（跑 `scripts/dev-all.sh`，Ctrl+C 會把兩個
process 一起關掉）。**Windows 上用 `npm run dev:all:win`**（跑 `scripts/dev-all.ps1`，
PowerShell 版，需要 `pwsh`（PowerShell 7+）在 PATH 上；用 Windows 內建的 PowerShell 5.1
也能跑，但 Ctrl+C 清理行為沒有 pwsh 穩定）。也可以手動分兩個終端機：

```bash
# 終端機 1（macOS / Linux）
python3 ../integration/epistemic_adapter/http_server.py
# 終端機 1（Windows PowerShell）
python ..\integration\epistemic_adapter\http_server.py

# 終端機 2
npm run dev
```

**容錯行為**：如果 Python 服務沒開，`GET /api/epistemic/health` 會回 502 + 說明；
Query/Feedback 驗證失敗會回 422 + jsonschema 的具體錯誤訊息，不會讓 Node 整個掛掉。

---

## 🛰️ M 面板：Activation Orbit（取代原本的 3D 卡片地圖）

按 `M` 鍵開啟。原本是 Three.js 畫的可拖拽 3D 卡片牆，**這次整個換掉**，改成
`frontend/panel-m-orbit.html`——純 HTML/CSS Grid/SVG/Vanilla JS，不用 Three.js、
不依賴 WebGL 或外部 CDN。舊檔案 `panel-m-map.html` 還留著（開頭加了棄用註記），
但 `hud-core.js` 的 `openModal()` 已經不指向它了。

**為什麼換掉，不是單純美化**：實體數量變多之後，把全部節點攤在同一個 3D 空間裡，
人眼找不到東西；而且這個視覺隱喻本身有問題——它暗示了一種「一次看到全部知識」的
全局視角，但 Activation Engine 從來不是這樣運作的，它永遠是「以一個焦點為中心，
有限跳數內展開」。新設計直接把這個語義做成介面，而不是另外發明一套跟後端邏輯無關
的視覺分組。

**五個區塊，對應五個新的後端查詢函式（都在 `adapter.py`）：**

| 區塊 | 對應函式 / 端點 | 做什麼 |
|---|---|---|
| 🔍 Search（頂欄） | `handle_search()` / `GET /search` | 模糊比對 Entity name/aliases、Atom 兩端名稱；domain 現在只是篩選參數，不再是獨立導覽層 |
| Activation Queue（左） | `handle_orbit()` 的 `queue` 部分 | 依 **Path Confidence** 分 Strong/Medium/Weak/Hidden，門檔在 `policy.yaml` 的 `activation_queue` |
| Orbit（中央） | `handle_orbit()` 的 `layers`+`edges` 部分 | 以焦點為中心的同心圓分層（Layer 0/1/2...），滾輪 = 展開層數，**不是縮放** |
| Runtime / Explain（右） | `handle_explain()` / `GET /explain/{uid}` | 這個實體所有關聯 Atom 的證據彙總成 support/contradiction/baseline + Reasoning 路徑 |
| Timeline（底部） | `handle_timeline()` / `GET /timeline/{uid}` | 關聯觀測依 `epoch` 分組——`epoch` 欄位以前存在但沒有任何介面用過 |

**Activation Queue 的分數不是距離，是 Path Confidence**：`min(沿路徑的 edge_score) *
depth_penalty^(hops-1)`，跟 `policy_engine.path_confidence()` 同一個公式，不是另外
發明一套標準。這代表距離遠但沿途信心都很高的實體，排名可能比距離近但信心低的實體
更前面——這是刻意的，Queue 反映的是「這個關聯有多可信」，不是純空間距離（純距離
是 Orbit 同心圓在做的事，兩者故意分開算）。

**Reasoning 路徑是「敘事鏈」，不是「最可信路徑」**：從 `search_origin`（最後一次
用 Search 設定的起點，點 Orbit 卡片切換焦點不會重置，只有下一次搜尋才會）到目前
焦點的**最短跳數路徑**（`handle_reasoning_path()` / `GET /reasoning-path?from=&to=`），
用來畫「A → B → C」這種一句話講得完的鏈，跟 Queue 用的信心排序是兩回事。

**domains 降級成純篩選條件，不是獨立頁面**：這是設計討論時明確決定的——`domains`
陣列的本質是標籤，一個 Entity 可以同時屬於多個領域，硬做成「領域總覽」首頁反而
違背這個資料模型（要嘛用 symlink，要嘛被迫歸到單一「主要領域」）。現在 Search
可以帶 `domain` 參數篩選，僅此而已；`GET /domains`（`handle_list_domains()`）只是
給篩選下拉選單用的一份去重清單。

**治理提示是頂欄一個小按鈕，不是獨立儀表板頁面**：`GET /governance-summary`
（`handle_governance_summary()`）回傳 `{debt_count, mediation_count}`，有數字才顯示
按鈕，點下去直接開既有的「📋 審查草稿」Modal——複用容器，沒有新增一個要維護的畫面。
量還小的時候，一個獨立頁面的維護成本比它省下來的時間還高；等這兩個數字長期維持
兩位數，才值得升級成專門的頁面。

**筆記抽取 / 草稿審查兩個 Modal 原封不動搬過來**（邏輯完全沒變，只是換了個檔案）：

- **頂欄「📝 筆記抽取」**：跟之前一樣，讀 `.system/user/notes/` 或直接貼文字，呼叫
  `note_extractor.py`，Modal 顯示「目前使用：xxx」告知會打哪個 LLM provider
  （讀跟 H 面板同一份 `localStorage` 設定）。
- **頂欄「📋 審查草稿」**：列表/查看/核准/拒絕/編譯 `0_Inbox/` 草稿，細節不變，
  CLI 對應 `wiki epistemic inbox list|approve|reject|compile`。

**這次是真的用無頭瀏覽器完整測過的**，不是只測 API：初始畫面自動抓第一個存在的
Entity 當焦點、Orbit 正確畫出節點、Queue 正確分桶、Explain 正確顯示證據、Timeline
正確顯示 6 個 epoch 點；用 Search 找到「Transformer 架構」並切換焦點；點 Orbit 卡片
再切換一次焦點到「位置編碼機制」，Reasoning 正確顯示「Transformer 架構→位置編碼機制」；
治理提示按鈕正確顯示「2 個知識債務、0 個矛盾提案」；筆記抽取/草稿審查 Modal 搬過來
之後重新測過一次核准→編譯，確認還是正常運作。

測試過程中抓到並修掉兩個真的 bug：
1. `loadReasoningPath()` 原本跟 `loadExplain()` 並行呼叫，但 Reasoning 那個 DOM
   元素是 `loadExplain()` 非同步 render 出來的——快取命中時 race condition 會讓
   `document.getElementById()` 找不到元素、整個 no-op。改成在 `loadExplain()`
   把 DOM 寫進去之後才呼叫。
2. `handle_governance_summary()` 這個函式早就寫好了，但忘記接 HTTP 端點跟 Node
   代理路由，導致治理提示按鈕永遠不會顯示——純粹是忘記接線，不是邏輯錯誤，已補上
   `GET /governance-summary` 跟對應的 Node 路由。

---

## 🧠 LLM Provider 統一：`runtime/llm_client.py`

`note_extractor.py`（筆記抽取）跟 `correlation_engine.py`（跨筆記關聯分析的 stance 維度）
原本各自寫死呼叫 Anthropic API。現在兩者都改呼叫 `runtime/llm_client.py` 的
`call_llm(system_prompt, user_content, ai_config)`，`ai_config` 的形狀跟
`backend/server.ts` 的 `/api/wiki/generate` 用的 `aiConfig` 完全一致
（`ai_provider: anthropic|openai|llama|custom`，加上各自需要的 host/port/base_url），
支援四種 provider，邏輯是 Node 端那四個分支的 Python 版本：

| provider | 呼叫方式 |
|---|---|
| `anthropic`（預設，沒傳 `ai_config` 時走這個） | Anthropic Messages API，需要 `ANTHROPIC_API_KEY` |
| `llama` | `{llama_host}:{llama_port}/v1/chat/completions`（llama.cpp 的 OpenAI-compatible 端點） |
| `openai` | OpenAI `/v1/chat/completions`，需要 `OPENAI_API_KEY` |
| `custom` | 任何 OpenAI-compatible 端點（`custom_base_url`/`custom_model`/`custom_api_key`） |

**這條路徑已經端到端測過**：起一個假的 `/v1/chat/completions` 伺服器模擬 llama.cpp，
帶 `ai_config: {ai_provider:"llama", llama_host:"http://127.0.0.1", llama_port:"9999"}`
呼叫 `/api/epistemic/extract`，確認整條鏈（前端會送出的請求形狀 → Node 代理 → Python →
llama.cpp 端點）真的打到指定位址，而且完全沒有設定 `ANTHROPIC_API_KEY` 也能成功；
也測過端點打不到時（port 沒有服務在監聽）會清楚報錯，**不會**偷偷 fallback 去打
Anthropic——這是刻意的，provider 選擇錯誤應該讓你知道，不是被系統偷偷「幫你」修正。

CLI 也支援指定 provider（見下面「wiki epistemic」章節的 `--provider` 等旗標），但 CLI
沒有瀏覽器的 `localStorage`，不指定 `--provider` 時一律預設 `anthropic`；真正會自動讀
設定頁配置的是前端的抽取 Modal（M 面板）跟 H 面板的 AI 整理助手。

---

## 📝 把筆記變成候選知識：`runtime/extraction/note_extractor.py`

**先講清楚這不是什麼**：這不是統計因果推斷，不會從時間序列資料跑格蘭傑因果檢定
或因果圖演算法去「算出」誰影響誰。它做的是：**用 LLM 讀你寫的筆記，把你自己已經
判斷出來的因果/相關關係轉成結構化草稿**——判斷的責任還是在寫筆記的人身上，
LLM 只是幫你把「升息可能讓資本支出轉趨保守」這種句子轉成 Atom/Observation 的格式，
省去手動填 frontmatter 的功夫。而且**永遠不會自動核准**：所有抽取結果都先進
`0_Inbox/`（`approved: false`），一定要人看過改成 `true`，再跑 Compiler 才會變成正式知識。

**資料流：**

```
你的筆記（.system/user/notes/*.md 或直接輸入文字）
   │
   ▼
POST /api/epistemic/extract  { text, title?, date? }
   │  Node 代理
   ▼
Python http_server.py  POST /extract
   │
   ▼
adapter.handle_extract()
   │
   ▼
runtime/extraction/note_extractor.py
   │  1. 把現有 epistemic/1_Entities/ 清單一起丟給 LLM，要求「同一個實體就重用既有 uid」
   │  2. 呼叫 Anthropic API（需要 ANTHROPIC_API_KEY），要求輸出嚴格 JSON
   │  3. 對每個候選關係：查 epistemic/2_Atoms/ 有沒有同樣 (from,to,type) 的 Atom
   │       有 → 只新增 Observation（新證據，不重複建機制）
   │       沒有 → 新增 Atom + Observation
   ▼
epistemic/0_Inbox/draft_*.md（全部 approved: false）+ 一份 extraction_summary_*.md 方便一次看完
```

**用法：**

```bash
# CLI：從既有筆記抽取（F1 個人日誌寫的筆記）
npm run wiki -- epistemic extract --note 2026-07-16.md

# CLI：直接丟文字，不用先存成筆記
npm run wiki -- epistemic extract --text "升息可能讓半導體資本支出轉趨保守" --title "投資筆記"

# HTTP（前端或其他工具要接的話）
curl -X POST http://localhost:3001/api/epistemic/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"升息可能讓半導體資本支出轉趨保守","title":"投資筆記"}'
```

跑完之後：

```bash
# 打開 epistemic/0_Inbox/ 底下新增的 draft_*.md，逐一檢查內容合不合理
# 覺得沒問題的，把 frontmatter 的 approved: false 改成 approved: true
python3 runtime/compiler/compiler.py    # 通過驗證的編譯進正式層，沒通過的進 6_Rejected/
python3 runtime/indexer/index_builder.py   # 重建索引
```

**這次順手擴充的地方（不只是加一個新端點）：**
- `runtime/compiler/compiler.py` 原本只認得 `entity`/`atom`/`observation` 三種草稿類型，
  現在加了 `source`——因為筆記本身要變成 Observation 的證據來源，需要能編譯出 Source 卡片。
- Entity 去重不是只比對 uid：如果 LLM 取了不同的 uid 但名稱/別名其實對得上現有實體，
  一樣會重用既有的，不會建出兩個代表同一個東西的 Entity。
- 已經用假資料完整測試過整條流程（重用既有實體、重用既有 Atom 只加 Observation、
  找不到對應實體時的容錯與警告訊息、Compiler 把四種草稿類型都編譯成功）——**唯獨真正
  呼叫 LLM 那一步沒辦法在這個開發環境測試，因為需要你自己的 `ANTHROPIC_API_KEY`**。
  沒設定這個環境變數時，API 會回清楚的錯誤訊息（HTTP 500 + 說明），不會安靜地失敗
  或回傳假資料。

---

## 🔗 跨筆記關聯分析：`runtime/correlation/correlation_engine.py`

分析兩篇筆記之間的關聯程度，三個維度：

1. **實體重疊度**：兩篇筆記各自提到哪些「已經存在於 `epistemic/1_Entities/`」的實體，
   算 Jaccard 相似度（交集/聯集）。
2. **認知圖距離**：兩篇筆記的核心實體，在 `epistemic/2_Atoms/` 構成的圖上最短路徑多近。
   這個維度權重最高——字面上看不出關聯，但圖譜上緊密相連，往往比關鍵字重疊更有價值。
   為了不跟第一個維度重複，會優先在「兩篇筆記各自獨有」的實體之間找橋接，只有真的
   找不到才退而求其次，允許用兩邊都提到的詞當錨點。
3. **立場關係**：呼叫 LLM，判斷兩篇筆記是加強(reinforce)、互補(complementary)、
   矛盾(contradict)、還是無關(neutral)。**這個維度需要 `ANTHROPIC_API_KEY`；
   呼叫失敗時系統會誠實回報「沒有這個維度的判斷」,不會用預設值假裝算出了立場關係
   ——這也是為什麼 propose() 在 stance 呼叫失敗時會直接拒絕產生提案，而不是照樣生成一份
   其實只有三分之二資訊、看起來卻很篤定的草稿。**

三個維度的權重、比對門檻都在 `runtime/policy/policy.yaml` 的 `correlation_engine` 區塊，
跟系統其他門檻的設計方式一致。

**跟直覺可能不同的地方**：分數超過門檻時，不是每次都會產生新 Atom：

- 兩個錨點實體之間**已經有 Atom** → 只提案一筆新 **Observation**（兩篇筆記互相印證這個
  既有機制），不會建重複的 Atom，符合系統「Atom 不可變、Observation 只增」的核心原則。
- 兩個錨點實體之間**還沒有 Atom** → 提案新增 Atom + Observation（LLM 會一併建議
  Atom 的 `type`／`mechanism`）。
- LLM 判斷兩篇筆記是 `contradict`（矛盾）→ 不自動提案，這種情況比較適合人工判斷是
  `context_change` 還是 `true_conflict`，硬塞一個提案反而可能誤導審查者。

**用法：**

```bash
# CLI：兩個檔名都從 .system/user/notes/ 讀取
npm run wiki -- epistemic correlate "note_a.md" "note_b.md"

# HTTP
curl -X POST http://localhost:3001/api/epistemic/correlate \
  -H "Content-Type: application/json" \
  -d '{"text_a":"...","title_a":"筆記A","text_b":"...","title_b":"筆記B"}'
```

**已經用真實資料測試過**（不是編出來的範例）：`epistemic/1_Entities/` 裡加了
`transformer_architecture`、`word2vec`、`positional_encoding_mechanism`、`word_embedding`
四個 NLP 領域的種子實體，以及兩個對應的 Atom（`word2vec →causal→ transformer_architecture`、
`transformer_architecture →constraint→ positional_encoding_mechanism`），拿兩篇真實的
Markdown 筆記（NLP 向量化演進史 × 位置編碼原理）跑過完整流程：實體重疊度 0.5、
圖距離 0.333（`word2vec ↔ positional_encoding_mechanism`，2 跳，刻意避開兩篇都提到的
`transformer_architecture` 當錨點，找到更有資訊量的橋接），用模擬的 LLM 回應驗證過
「已有 Atom → 提案 Observation」「還沒有 Atom → 提案 Atom」兩種分支都能正確產生
draft，且能被 Compiler 正確編譯。真正呼叫 LLM 判斷立場那一步，一樣需要你自己的
`ANTHROPIC_API_KEY` 才能在你的環境裡測到。

---

## ⚠️ 搬遷過程中發現並修好的一個既有 bug（跟 epistemic 整合無關）

`cli/commands/doc.ts` 檔案開頭的 JSDoc 註解裡寫著 `儲存位置：docs/**/*.md`——但
`**/ ` 這個 glob pattern 剛好含有 `*` 接 `/` 的組合，會讓 TypeScript 的區塊註解
**在那裡意外提前結束**，導致後面殘留的字元變成語法錯誤的程式碼。

這個 bug 一直存在，但兩個原因讓它沒被發現：
1. `tsconfig.json` 的 `include` 只有 `backend/**/*.ts` 跟 `modules/**/*.ts`，
   從來沒包含 `cli/**/*.ts`，所以 `npm run type-check` 從來沒真的檢查過 CLI（已修正）。
2. 原本用的 `ts-node/esm` 在 Node 22 上不會給出清楚的語法錯誤，只會丟出一個
   難以辨識的 `[Object: null prototype]` 例外，很容易被誤判成環境問題而不是程式碼問題。

**已經做的修正**：
- 改寫了那段註解，不再用會提前結束區塊註解的符號組合。
- `tsconfig.json` 的 `include` 加入 `cli/**/*.ts`，以後 `type-check` 真的會檢查 CLI。
- 把所有 npm script 從 `node --loader ts-node/esm`（已停止維護、跟新版 Node 的 ESM
  loader hooks API 不相容）換成 `tsx`（`npm install --save-dev tsx`），這是目前
  TypeScript/Node 生態圈的標準做法，錯誤訊息也清楚很多。

---

## 目前完整測試方式（照這個順序跑一遍，可以確認整條系統功能齊全）

以下全部指令都在 `application/` 目錄下執行。**注意**：背景啟動的服務要留在同一個
終端機 session，不要中途關閉，否則測試會連不到。

### 1. 靜態檢查（最快，先確認程式碼本身沒問題）

```bash
npm install
npm run type-check   # 應該 0 錯誤（現在真的涵蓋 cli/ 了）
```

### 2. 啟動兩個服務

```bash
npm run dev:all
```

看到這兩行代表都成功了：
```
[dev-all] Epistemic 服務就緒。
[LLM WIKI] API server ready → http://localhost:3001
```

### 3. HTTP 層測試（另開一個終端機）

```bash
# 3a. Python 服務本身
curl http://127.0.0.1:8765/health
# 預期：{"status":"ok","service":"epistemic_adapter"}

# 3b. 透過 Node 代理
curl http://127.0.0.1:3001/api/epistemic/health
# 預期：跟 3a 一樣

# 3c. 正常查詢（epistemic/ 裡已經有一組範例資料：升息 → 銀行淨利差）
curl -X POST http://127.0.0.1:3001/api/epistemic/query \
  -H "Content-Type: application/json" \
  -d '{"query":"","atom":"rate_affects_bank_nim","context":{}}'
# 預期：support 2 筆、contradiction 4 筆、abstained:false

# 3d. 找不到 Atom，應該棄權
curl -X POST http://127.0.0.1:3001/api/epistemic/query \
  -H "Content-Type: application/json" \
  -d '{"query":"完全不存在的主題","context":{}}'
# 預期：abstained:true, abstain_reason:"no_matching_atom"

# 3e. Feedback 正常寫入
curl -X POST http://127.0.0.1:3001/api/epistemic/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"feedback","target":"2023Q1_rate_nim_obs","signal":"low_confidence"}'
# 預期：{"status":"recorded","path":"epistemic/7_Query_History/feedback_....json"}

# 3f. Feedback 帶不合法 signal，應該 422
curl -w "\n%{http_code}\n" -X POST http://127.0.0.1:3001/api/epistemic/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"feedback","target":"x","signal":"not_a_real_signal"}'
# 預期：HTTP 422 + jsonschema 錯誤訊息

# 3g. 把 Python 服務關掉（Ctrl+C 那個終端機），Node 代理應該回 502 而不是整個掛掉
curl -w "\n%{http_code}\n" http://127.0.0.1:3001/api/epistemic/health
# 預期：HTTP 502
```

### 4. CLI 層測試（另開一個終端機，Python + Node 都要還在跑）

```bash
npm run wiki -- epistemic health
npm run wiki -- epistemic query --atom rate_affects_bank_nim
npm run wiki -- epistemic feedback --target 2023Q1_rate_nim_obs --signal high_confidence --note "測試"
npm run wiki -- epistemic feedback --target x   # 故意漏參數，應該印出清楚的錯誤訊息，不是當掉

# 需要 ANTHROPIC_API_KEY 才會真的成功；沒設定的話應該看到清楚的錯誤訊息（不是空白或當掉）
npm run wiki -- epistemic extract --text "升息可能讓半導體資本支出轉趨保守" --title "測試筆記"

# 兩篇筆記的關聯分析；entity_overlap 跟 graph_distance 兩個維度不需要 API key 就能看到分數，
# stance 維度跟最終的提案生成需要 ANTHROPIC_API_KEY
npm run wiki -- epistemic correlate "note_a.md" "note_b.md"
```

### 5. 對照組（確認沒有動到原本就有的功能）

```bash
npm run wiki -- doc tree        # 應該看到 finance/ 跟 llm-wiki/ 兩個 domain
npm run wiki -- milestone ls    # 應該看到 Phase 1 里程碑，進度 100%
npm run wiki -- module ls       # 應該看到 tokenize、embedVec 兩個模組
```

### 6. 前端（需要瀏覽器；M 面板需要 Python + Node 兩個服務都在跑）

```bash
npx serve frontend/
```

開瀏覽器到 `http://localhost:3000`，按 `M` 鍵：應該會看到 Activation Orbit——中央是
以某個 Entity 為中心的同心圓（目前範例資料預設會抓到「銀行淨利差」或「台積電」之類
第一個存在的實體當焦點），左側 Activation Queue 依信心分 Strong/Medium/Weak，右側
Explain 顯示這個實體的支持/反駁證據，底部 Timeline 顯示觀測的時間分佈。

- **在頂欄 Search 打字**（例如「Transformer」）：應該跳出下拉選單，列出符合的 Entity/Atom；
  點一個結果，Orbit 應該重新以它為中心展開。
- **點 Orbit 裡的卡片**：焦點切換過去，Queue/Explain/Timeline 都跟著換；如果這是你
  搜尋之後點的第二次以上，Explain 面板的 Reasoning 區塊應該顯示一條「A → B → C」的路徑
  （從你最後一次搜尋的起點，到目前焦點）。
- **在 Orbit 上滾滑鼠滾輪**：右上角「Layer 0–N」的數字應該變化（展開/收合層數，不是縮放
  畫面大小）——如果數字沒變，通常代表這個焦點在目前資料量下就是只有這麼多層可以展開，
  不一定是壞掉（範例資料量還小，很容易碰到這個情況）。
- **頂欄如果出現「⚠ N 個知識債務、N 個矛盾提案」的黃色按鈕**：代表 `debt_report.tsv`
  或 `0_Inbox/` 裡有東西要看，點下去會直接開「審查草稿」Modal。

如果畫面停在「正在讀取…」或顯示錯誤訊息，代表 Python/Node 服務沒開（`npm run dev:all`）。

頂欄「📝 筆記抽取」按鈕，點開會看到「目前使用：xxx」——先去右上角齒輪圖示
的設定頁把「AI 提供者」切成 `llama`、填好本機 llama.cpp 的 host/port（預設
`http://127.0.0.1:8080`），回來這裡應該會顯示「目前使用：llama.cpp（本機）」。挑一篇
既有筆記或直接貼文字，點「開始抽取」，成功的話會看到「✔ 完成：新建 Entity N 筆…」，
且這次呼叫打的是你在設定頁指定的 llama.cpp，不是 Anthropic（確認方式：不設定
`ANTHROPIC_API_KEY` 也能成功，就是最直接的證明）。

頂欄另一個「📋 審查草稿」按鈕：點開應該會看到剛剛抽取出來的草稿列表（如果
0_Inbox/ 是空的會顯示「目前沒有待審查的草稿」）。點「查看內容」應該展開顯示完整的
原始檔案；點「✔ 核准」狀態應該變成「✔ 已核准」；核准幾筆之後點最下面「編譯已核准的
草稿」，成功的話會顯示「✔ 編譯完成：成功 N 筆」，草稿列表也會跟著更新（已編譯的會消失）。
重新整理頁面應該能在 Orbit 上（搜尋一下）看到剛剛核准編譯的新實體。

按 `H` 鍵：原本掛在 `M` 的「AI 知識整理助手」搬到這裡了（讀 `../knowledge/wiki/`，
呼叫 AI 整理 `../knowledge/docs/` 的內容）。

若以上全部符合預期，代表 Node ↔ Python 的整合、Contract 驗證、容錯機制、CLI、
Activation Orbit、筆記抽取 UI、草稿審查 UI 都是完整可用的。

---

## 目錄結構與儲存位置

```
application/                        ← 這個 Node/TS 專案的根目錄（package.json 在這）
│
├── .system/                        ← 系統自動生成（git-ignored，見 .gitignore）
│   ├── index.json                  ← 模組索引快取
│   ├── vector-cache.json           ← 向量索引快取
│   ├── ci/ci-runs.json             ← CI writeback 執行記錄
│   └── user/notes/                 ← F1 個人筆記（*.md，本機、不進版控）
│
├── modules/                        ← B 模組背包：代碼模組（嚴格 schema，見下方）
│   ├── tokenize/
│   └── embedVec/
│
├── milestones/                     ← F4 專案時程活動：里程碑文件
│
├── backend/                        ← API Server（port 3001）
│   ├── server.ts
│   ├── parser/metadata-parser.ts
│   ├── type-checker/type-checker.ts
│   ├── ci-watcher/ci-watcher.ts
│   └── vector/vector-index.ts
│
├── cli/                            ← CLI 工具（wiki 命令）
├── frontend/                       ← HUD 前端（靜態 HTML）
│   ├── hud-main.html               ← 真正的入口（F1-F5、B、H、M 快捷鍵）
│   ├── hud-core.js / hud-panels.js / hud-utils.js / hud-settings.js
│   ├── panel-h.js                  ← H 鍵：AI 知識整理（原本掛在 M，這次搬過來）
│   ├── panel-m-map.html            ← M 鍵：認知地圖，iframe 注入（原本掛 hud-panels.js 的簡易版）
│   └── hud-shell.html              ← ⚠️ 未使用的舊版原型，見檔案內註記
├── .env.example / .env
├── package.json / tsconfig.json
└── .gitignore                      ← 這個 Node 專案自己的 ignore 規則

../knowledge/docs/                  ← F5 知識圖鑑唯讀來源（DOCS_DIR，搬到頂層了）
../knowledge/wiki/                  ← AI 整理產出（WIKI_DIR，搬到頂層了，獨立於 docs/）
```

---

## CLI 完整指令手冊

用法：`npm run wiki -- <command> [subcommand] [options]`

### `wiki note` — F1 個人日誌（`.system/user/notes/*.md`）

| 指令 | 說明 |
|---|---|
| `note ls` | 列出所有筆記 |
| `note new <title>` | 新增筆記 |
| `note read <filename>` | 讀取筆記內容 |
| `note save <filename>` | 儲存/覆寫筆記 |
| `note append <filename>` | 附加內容到筆記末尾 |
| `note rm <filename>` | 刪除筆記 |

### `wiki git` — F2 協作大廳（`.git`）

`git log` / `git status` / `git diff [file]` / `git branch`

### `wiki test` — F3 測試套件（`/api/tests`）

`test ls` / `test ls --type unit` / `test show <id>` / `test run [<id>]`

### `wiki milestone` — F4 目標專案時程（`milestones/*.md`）

`milestone ls` / `milestone show <name>`

### `wiki doc` — F5 知識圖鑑（`../knowledge/docs/**/*.md`）

`doc search <keyword>` / `doc read <path>` / `doc tree`

### `wiki module` — B 模組背包（`modules/<name>/README.md`）

`module ls` / `module ls --status DONE` / `module show <name|id>` /
`module validate <A> <B>` / `module connect <A> <B> [C...]`

### `wiki map` — 文件目錄樹瀏覽（`../knowledge/docs/` 目錄樹）

`map tree` / `map domain <name>`

（跟 HUD 的 M 鍵無關，見上面「HUD 快捷鍵說明」的提醒）

### `wiki vector` — 向量索引（`.system/vector-cache.json`）

`vector build` / `vector search <query>` / `vector status`

### `wiki ci` — CI Writeback

`ci writeback --module <id> --status <DONE|WIP|BLOCKED> ...` / `ci log`

### `wiki epistemic` — 認知核心（`epistemic/`，經 Python 服務代理）

`epistemic health` / `epistemic query --atom <uid> [--context '{}']` /
`epistemic feedback --target <obs_uid> --signal <signal> [--note ...]` /
`epistemic extract [--note <filename> | --text <text>] [--title ...] [--date ...]` /
`epistemic correlate <noteA> <noteB>` /
`epistemic inbox list|approve <filename>|reject <filename> [--reason ...]|compile`

`extract`/`correlate` 都支援 `--provider anthropic|openai|llama|custom`（不指定預設
`anthropic`），provider 是 `llama` 時可加 `--llama-host`/`--llama-port`，是 `custom`
時可加 `--custom-base-url`/`--custom-model`/`--custom-api-key`，形狀跟前端設定頁的
`ai_config` 一致（見上面「LLM Provider 統一」一節）。例：

```bash
npm run wiki -- epistemic extract --text "測試" --provider llama --llama-port 8080
```

`inbox` 是 M 面板「📋 審查 0_Inbox 草稿」的 CLI 版本，功能完全一樣（`approve` 只是標記
核准，要另外跑 `compile` 才會真的編譯進正式層）：

```bash
npm run wiki -- epistemic inbox list
npm run wiki -- epistemic inbox approve draft_xxx.md
npm run wiki -- epistemic inbox reject draft_xxx.md --reason "內容不合理"
npm run wiki -- epistemic inbox compile
```

---

## HUD 快捷鍵說明

| 按鍵 | 面板名稱 | CLI 對應 | 備註 |
|---|---|---|---|
| F1 | 個人日誌 | `wiki note` | |
| F2 | 協作大廳 | `wiki git` | |
| F3 | 測試套件 | `wiki test` | |
| F4 | 目標專案時程 | `wiki milestone` | |
| F5 | 知識圖鑑 | `wiki doc` | 讀 `../knowledge/docs/` |
| B | 模組背包 | `wiki module` | |
| H | AI 知識整理 | （無，純前端）| 原本掛在 M 鍵，這次搬過來；讀 `../knowledge/wiki/` |
| M | **認知地圖**（3D 卡片關聯圖）| `wiki epistemic query` | **這次新加的**；資料來自 `epistemic/`，點關聯項目可即時查詢 belief |

> `wiki map`（CLI）跟 HUD 的 M 鍵其實一直是兩個獨立功能（CLI 的 `map` 指令是瀏覽
> `docs/` 目錄樹，跟 HUD 的 M 鍵無關）——這個落差是原本 repo 就有的，這次沒有動它，
> 只是提醒一下避免你以為兩者是同一個東西。

---

## 模組規格格式（`modules/<name>/README.md`）

每個 `modules/<name>/README.md` **必須**包含 YAML Front Matter（`id`/`name`/`status`/...）
與 `//INPUT`、`//OUTPUT` 兩個 JSON code block。**不符合這個格式的資料夾不要放進 `modules/`**
——parser 會把 `modules/` 底下每個子資料夾都當成代碼模組解析，格式不對會在啟動時噴警告
（我先前誤把一份純文字說明放進這裡，已經移除；純文件性質的東西應該放
`../knowledge/docs/` 或這份 README，不要放 `modules/`）。

```
---
id: 001
name: tokenize
status: DONE
latency: ~12ms
author: alice
created: 2025-06-18
updated: 2025-06-18
tags: [nlp, tokenizer]
---

# tokenize()

文字切詞模組。

```json //INPUT
{ "type": "string", "description": "原始輸入文字" }
```

```json //OUTPUT
{ "type": "array", "items": { "type": "string" }, "description": "token 陣列" }
```
```

## 型別系統

| 型別 | 語義 |
|---|---|
| `STR` | 字串 | `INT` | 整數 | `FLOAT` | 浮點數 | `BOOL` | 布林值 |
| `ARR` | 陣列 | `OBJ` | 物件 | `NUM` | 數值泛型（INT∪FLOAT） | `ANY` | 泛型 |

`ANY` 可接收任意型別；`NUM` 可接收 `INT` 或 `FLOAT`；其他須完全一致，否則拋出 `TypeMismatchException`。

---

## API 端點

後端 server 預設監聽 `http://localhost:3001`（可用 `WIKI_API` 環境變數覆蓋）。

| 面板 | 方法/路徑 | 資料位置 |
|---|---|---|
| F1 筆記 | `GET/POST/DELETE /api/notes[/:filename]` | `.system/user/notes/` |
| F2 Git | `GET /api/git/commits`、`/api/git/status` | `.git` |
| F3 測試 | `GET /api/tests[/:id]`、`POST /api/tests/run` | mock（接 vitest --json） |
| F4 里程碑 | `GET /api/milestones` | `milestones/*.md` |
| F5/M 文件 | `GET /api/docs/tree`、`/search?q=`、`/file?path=` | `../knowledge/docs/**/*.md` |
| B 模組 | `GET /api/modules[/...]`、`POST /api/validate[/pipeline]` | `modules/*/README.md` |
| CI | `POST /api/ci/writeback` | `modules/<name>/README.md` + `.system/ci/` |
| AI 整理（M） | `GET/POST /api/wiki/*` | `../knowledge/wiki/**/*.md`（讀 docs/ 唯讀，寫 wiki/） |
| 認知核心 | `GET /api/epistemic/health`、`POST /api/epistemic/query`、`/feedback`、`/extract`、`/correlate`、`GET /graph` | 代理到 Python 服務（見「Epistemic 整合」「筆記抽取」「跨筆記關聯分析」三節） |
| 草稿審查 | `GET /api/epistemic/inbox`、`GET /inbox/:filename`、`POST /inbox/:filename/approve`、`/reject`、`POST /api/epistemic/compile` | 列表/查看/核准/拒絕/編譯 `epistemic/0_Inbox/` 草稿 |
| Activation Orbit（M 面板） | `GET /api/epistemic/domains`、`/search`、`/orbit/:uid`、`/explain/:uid`、`/reasoning-path`、`/timeline/:uid`、`/governance-summary` | 見「M 面板：Activation Orbit」一節 |

`/api/wiki/generate` 支援四種 AI provider：`anthropic`（預設）、`openai`、`llama`（本機
llama.cpp）、`hermes`（Hermes Agent 多輪 tool-calling，工具集：`search_docs`/`read_doc`/
`list_wiki`/`write_wiki`/`finish`）。所有 API Key 一律從 `.env` 讀取，不接受從 request body 傳入。

---

## 開發指令

```bash
npm run dev                # 啟動後端 API server（port 3001）
npm run dev:all            # 同時啟動 Python epistemic 服務 + Node 後端（macOS/Linux）
npm run dev:all:win        # 同上，Windows / PowerShell 版
npm run wiki -- help       # CLI 說明
npm run type-check        # TypeScript 型別檢查
npm run parse              # 手動解析 modules/ → .system/index.json
npm run vector:build      # 重建向量索引（需 OPENAI_API_KEY）
npm run build              # 編譯 TypeScript → dist/
npm run start              # 執行 production server
```

---

## ⚠️ 先前技術宣告（Prior Art Declaration）

依據國際專利法之「先前技術公開」原則，本專案以下列具體之原創系統設計、架構拓撲及系統
工作流進行防禦性公開存證。詳見原始 GitHub repo（`MRSogzz/LLMwiki_hub`）README 的完整
中英文條款（Markdown SSOT 非阻塞寫回機制、方格四角拓撲型別校驗管線、剛性 HUD 互動控制層、
卡片式測試監控系統、雙層非同步模組規格）——這份聲明是這個專案的重要法律資產，
**搬遷過程沒有更動任何文字，內容以原始 repo 為準**，這裡不重複貼一次全文避免版本不同步。

## 授權（Licensing）

本專案採用 **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0)**，見 repo 根目錄 `LICENSE`。非商業性限制與著作權人聲明條款同樣以原始
repo 為準。

© 2026 LLM WIKI Contributors
