# Noematica

Noematica is a Git-native cognitive operating system for structured knowledge management.

It combines knowledge cards, LLM-assisted extraction, evidence tracking, activation-based reasoning, and human review into a unified workflow.
```
███╗   ██╗ ██████╗ ███████╗███╗   ███╗██████╗ ████████╗██╗ ██████╗██╗  ██╗
████╗  ██║██╔═══██╗██╔════╝████╗ ████║██╔══██╗╚══██╔══╝██║██╔════╝██║  ██║
██╔██╗ ██║██║   ██║█████╗  ██╔████╔██║███████║   ██║   ██║██║     ███████║
██║╚██╗██║██║   ██║██╔══╝  ██║╚██╔╝██║██╔══██║   ██║   ██║██║     ██╔══██║
██║ ╚████║╚██████╔╝███████╗██║ ╚═╝ ██║██║  ██║   ██║   ██║╚██████╗██║  ██║
```
Noematica 是一套以知識卡片為核心的 Git Native 認知系統，將知識管理、LLM 抽取、證據追蹤、Activation 推理以及人工審查整合成同一套工作流程。
---

# 系統概述
application/ Web UI、API 服務（Node/TS）
knowledge/ 人類可讀的敘事型文件（docs/<domain>/<topic>/*.md）及 AI 產出草稿（wiki/）
epistemic/ 認知核心：Entity / Atom / Observation / Source，Git 追蹤全部歷史
runtime/ 推理與自動化服務（索引、激活、政策、編譯、推理、抽取、關聯）
integration/ 橋接層（epistemic_adapter HTTP 服務 + 合約定義）


四層之間僅透過 `integration/` 溝通，`application/`（Node/TS）與 `epistemic/`+`runtime/`（Python）各自獨立，透過 HTTP 服務整合。

---

# 核心功能

## 認知圖譜（Entity‑Atom‑Observation‑Source）

- **Entity**：實體卡片（uid / name / type / domains / aliases）
- **Atom**：關係骨架（from → to / type / abstraction / status / lifecycle / lineage）— 永不覆寫，僅可變更狀態
- **Observation**：觀測紀錄（atom / epoch / context 五維 / impact / probability / stance / confidence / evidence）— 只增不減
- **Source**：原始證據錨點（title / source_fingerprint / published_date）

所有卡片皆以 Markdown + frontmatter 儲存於 `epistemic/` 對應目錄，版本由 Git 完整追蹤。

## 認知地圖 — Activation Orbit（M 鍵）

- **搜尋**：依名稱／別名／uid／領域／類型篩選 Entity 與 Atom，取代「在 3D 圖裡用眼睛找卡片」
- **Activation Queue（左側）**：以焦點實體為中心，沿知識圖譜計算每個可達實體的 **Path Confidence**（路徑上最弱一段的信心，乘以每多一跳的信心衰減係數），依信心分成 **Strong / Medium / Weak / Hidden** 四桶——**這是多跳（multi-hop）關聯查詢，已優化為不再侷限於單跳**
- **Orbit（中央同心圓）**：以焦點實體為中心展開 Layer 0 / 1 / 2 / 3…，滑鼠滾輪展開／收合層數（層數上限由 `runtime/policy/policy.yaml` 的 `activation_queue.max_layer` 設定，預設 4 層）；點節點卡片可切換焦點並重新展開
- **Explain 面板**：彙總該實體所有關聯 Atom 底下的證據（support／contradiction／baseline）
- **Reasoning Path 面板**：計算並顯示從搜尋起點到目前焦點之間的最短路徑（敘事鏈，非最高信心路徑）
- **Timeline 面板**：該實體所有關聯觀測依 epoch 分組呈現
- 「筆記抽取」與「草稿審查」側欄按鈕（見下方兩節）仍在此面板中

## AI 知識整理（H 鍵，原 M 功能移至此）

- 讀取 `knowledge/docs/` 中的人類筆記，經 LLM 整理為結構化摘要，寫入 `knowledge/wiki/`
- 支援 Anthropic、OpenAI、Llama（本機）、自訂端點四種 provider

## 筆記抽取為知識（M 面板側欄）

- 將自由文字（筆記內容）經 LLM 抽取為候選 Entity / Atom / Observation
- 自動比對既有 Entity 以重用 uid；若關係 (from,to,type) 已存在則僅新增 Observation 而不重複建立 Atom
- 產出草稿寫入 `epistemic/0_Inbox/`，需經人工審查才編譯進正式層
- 前端顯示當前使用的 LLM provider（與設定頁同步）

## 跨筆記關聯分析（CLI / API）

- 分析兩篇筆記的關聯程度，基於三個維度：
  1. **實體重疊度**（Jaccard）
  2. **認知圖距離**（Atom 圖上的最短路徑）
  3. **立場關係**（LLM 判斷：reinforce / complementary / contradict / neutral）
- 分數超過門檻（可調）即產生提案：
  - 若錨點間已有 Atom → 提案新 Observation
  - 若無 → 提案新 Atom + Observation
  - 若 LLM 判斷為矛盾 → 不產生提案（避免錯誤關聯）

## 草稿審查閉環（M 面板側欄 / CLI）

- 列表檢視 `0_Inbox/` 中所有 Entity / Atom / Observation / Source 草稿
- 查看完整原始內容（frontmatter + body）
- 核准（僅標記 `approved: true`）
- 拒絕（附原因，移入 `6_Rejected/` 作為反模式記憶）
- 編譯（呼叫 Compiler 驗證格式並寫入對應正式目錄，成功後草稿自 `0_Inbox/` 消失）

## 認知查詢與反饋（CLI / API）

- 針對特定 Atom 查詢支持／反駁／不確定性（經 Activation Engine 計算 Path Confidence）
- 使用者反饋寫入 `7_Query_History/`（不直接修改 Observation）

## 索引與治理稽核（自動化服務）

- **Index Builder**：掃描四層卡片生成 TSV 索引與知識債務報表（`.index/`）
- **Governance Auditor**：離線掃描全圖，自動產生調解提案、生命週期審查提案、復活提案（寫入 `0_Inbox/`）
- **Policy Engine**：統一管理信心衰減、棄權門檻、調解觸發、生命週期規則（`runtime/policy/policy.yaml`）

# HUD 面板

| 功能 | HUD 按鍵 | CLI | HTTP | 資料位置 |
|---|---|---|---|---|
| 個人日誌 | F1 | `wiki note` | `/api/notes` | `application/.system/user/notes/` |
| 協作大廳 | F2 | `wiki git` | `/api/git/*` | `.git` |
| 測試套件監控 | F3 | `wiki test` | `/api/tests` | mock |
| 目標專案時程 | F4 | `wiki milestone` | `/api/milestones` | `application/milestones/` |
| 知識圖鑑 | F5 | `wiki doc` | `/api/docs/*` | `knowledge/docs/` |
| 模組背包 | B | `wiki module` | `/api/modules/*` | `application/modules/*/README.md` |
| AI 知識整理（原 M） | **H** | — | `/api/wiki/*` | 讀 `knowledge/docs/`，寫 `knowledge/wiki/` |
| **認知地圖 — Activation Orbit**（已優化，取代舊版 3D 圖） | **M** | — | `/api/epistemic/search`、`/domains`、`/orbit/:uid`、`/explain/:uid`、`/reasoning-path`、`/timeline/:uid` | `epistemic/1_Entities` + `2_Atoms` + `3_Observations` |
| 認知查詢（單一 Atom，單跳） | — | `wiki epistemic query` | `/api/epistemic/query` | `epistemic/` 全部四層 |
| 反饋 | — | `wiki epistemic feedback` | `/api/epistemic/feedback` | `epistemic/7_Query_History/` |
| **筆記抽取**（新） | **M 面板側欄按鈕** | `wiki epistemic extract` | `/api/epistemic/extract` | 寫 `epistemic/0_Inbox/` |
| **跨筆記關聯**（新） | — | `wiki epistemic correlate` | `/api/epistemic/correlate` | 寫 `epistemic/0_Inbox/` |
| **草稿審查**（新） | **M 面板側欄按鈕** | `wiki epistemic inbox list\|approve\|reject\|compile` | `/api/epistemic/inbox*`、`/compile` | 讀寫 `epistemic/0_Inbox/`，編譯進四層正式資料 |
| **LLM Provider 統一**（新） | （抽取 Modal 顯示目前 provider） | `--provider llama\|...` | `ai_config` 欄位 | `runtime/llm_client.py` |
| 治理摘要 | M 面板頂欄提示 | — | `/api/epistemic/governance-summary` | `epistemic/` 全部四層 |
| 知識庫索引重建 | — | — | — | `python3 runtime/indexer/index_builder.py` |
| 治理稽核 | — | — | — | `python3 runtime/policy/governance_auditor.py` |
| 草稿編譯 | **M 面板「審查」Modal 裡的編譯按鈕** | `wiki epistemic inbox compile` | `POST /api/epistemic/compile` | `python3 runtime/compiler/compiler.py`（三種介面共用同一份邏輯） |

---


## 架構與橋接

- **Python 服務**（`integration/epistemic_adapter/http_server.py`，FastAPI）監聽 `127.0.0.1:8765`
- **Node 後端**（`application/backend/server.ts`）代理所有 `/api/epistemic/*` 請求至 Python 服務
- **正式合約**（`integration/contracts/*.schema.json`）：Query、Belief、Feedback，確保前後端資料形狀一致
- **API 端點**（Node 代理層）：
  - `GET /api/epistemic/health` — 檢查 Python 連線
  - `POST /api/epistemic/query` — 單一 Atom 認知查詢，單跳（回傳 Belief Contract）
  - `POST /api/epistemic/feedback` — 寫入查詢歷史
  - `GET /api/epistemic/graph` — 取得完整 Entity‑Atom 圖譜（供舊版 3D 地圖使用，已不建議依賴）
  - `POST /api/epistemic/extract` — 筆記抽取（需指定 LLM 配置）
  - `POST /api/epistemic/correlate` — 跨筆記關聯分析
  - `POST /api/epistemic/inbox/list` / `approve` / `reject` / `compile` — 草稿審查操作
  - `GET /api/epistemic/domains` — 取得所有 domain（供 Orbit 搜尋篩選下拉選單）
  - `GET /api/epistemic/search` — 依名稱／別名／uid／domain／type 搜尋 Entity 與 Atom（Orbit 面板入口）
  - `GET /api/epistemic/orbit/:uid` — **Orbit 核心資料**：以 uid 為中心的 Layer 分層 + Activation Queue（多跳 Path Confidence 分桶）
  - `GET /api/epistemic/explain/:uid` — 該實體所有關聯 Atom 的證據彙總（support／contradiction／baseline）
  - `GET /api/epistemic/reasoning-path?from=&to=` — 兩實體間最短路徑（敘事鏈）
  - `GET /api/epistemic/timeline/:uid` — 該實體關聯觀測依 epoch 分組
  - `GET /api/epistemic/governance-summary` — 治理提示摘要（頂欄按鈕用）

---

# 啟動說明

## 首次安裝

```bash
git clone <your-repo>
cd my-knowledge-repo
```
## Python 依賴

```bash
pip install -r requirements.txt
```

## Git hook（選用）

```bash
cp pre-commit.sample .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

## Node 依賴

```bash
cd application
npm install
cp .env.example .env
```

## 填入 ANTHROPIC_API_KEY、OPENAI_API_KEY 等（若使用本機 llama，可留空）

日常執行

```bash
cd application
npm run dev:all          # 同時啟動 Python 服務 + Node 後端
```

另開終端機提供前端靜態檔：

```bash
npx serve frontend/
```
瀏覽器開啟 `http://localhost:3000`，即可使用所有 HUD 功能（F1–F5、B、M、H）。

# CLI 工具（需 Python + Node 皆運行中）

```bash
npm run wiki -- help
```

常用指令：

```bash
npm run wiki -- epistemic health

npm run wiki -- epistemic query --atom <atom-uid>

npm run wiki -- epistemic extract --text "..." --title "..." [--provider llama]

npm run wiki -- epistemic correlate "note1.md" "note2.md"

npm run wiki -- epistemic inbox list|approve|reject|compile [--filename ...]
```

索引與稽核（手動觸發

```bash
python3 runtime/indexer/index_builder.py
python3 runtime/policy/governance_auditor.py
```

目錄結構

```text
my-knowledge-repo/
├── application/                 # Node/TS 專案（含後端、CLI、前端）
│   ├── backend/server.ts        # API 服務 + epistemic 代理
│   ├── cli/wiki.ts              # CLI 入口
│   ├── frontend/                # HUD 介面（hud-main.html 為入口）
│   ├── modules/                 # I/O 週期表模組
│   ├── milestones/              # F4 里程碑
│   └── .system/                 # 快取與個人筆記
├── knowledge/
│   ├── docs/<domain>/<topic>/   # 人類可讀知識文件（F5）
│   └── wiki/                    # AI 整理產出草稿
├── epistemic/                   # 認知核心（0_Inbox ~ 9_Blind_Spots + .index/）
├── runtime/                     # 服務：indexer / activation / policy / compiler / reasoning / extraction / correlation
├── integration/
│   ├── epistemic_adapter/       # HTTP 服務（FastAPI）+ adapter
│   ├── wiki_adapter/            # Python 端呼叫範例
│   └── contracts/               # JSON Schema 合約
├── pre-commit.sample            # Git hook 範例
└── requirements.txt             # Python 依賴
```

---

## 已知限制

筆記抽取與關聯分析需依賴 LLM（Anthropic / OpenAI / 本機 llama）。若使用本機 llama，需自行啟動 llama-server 且端點與設定一致。

wiki map（CLI 瀏覽 docs/ 目錄樹）與 HUD 的 M 鍵是不同功能，此為既有設計，未予變更。

草稿審查的「核准」與「編譯」為兩步驟操作，避免誤觸導致未經完整驗證即寫入正式層。


# License

Source Code

AGPL-3.0

Knowledge Base

CC BY-NC-SA 4.0

Commercial Licensing

Commercial licenses are available.

See COMMERCIAL_LICENSE.md