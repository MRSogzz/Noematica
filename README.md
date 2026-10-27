<div align="center">

# Noematica

### 讓你的知識庫不只儲存內容，還能回答「為什麼」

**開源、Git-native 的認知知識核心，把零散筆記轉成結構化、可推理、可追溯的知識圖譜。LLM provider 不綁定，雲端或本地皆可；完全本地執行時零成本。**

[![Python 3](https://img.shields.io/badge/python-3-blue.svg)](https://www.python.org/downloads/)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-yellow.svg)](LICENSE)
[![Git-native](https://img.shields.io/badge/Git-native-black.svg)](#核心概念)
[![LLM-agnostic](https://img.shields.io/badge/LLM-agnostic-green.svg)](#系統架構)

[English](README.en.md) · **繁體中文**

[快速開始](#快速開始) · [核心概念](#核心概念) · [主要功能](#主要功能) · [系統架構](#系統架構) · [API 端點](#api-端點) · [已知限制](#已知限制) · [FAQ](#faq)

</div>

---

Noematica 不是一般的筆記軟體，而是一套 **epistemic（認知／知識論）導向的知識基礎設施**。它的核心主張是：

- **知識應該以「實體—關係—觀測—來源」四層結構來組織**，而非散落的頁面或區塊。
- **關係（Atom）永不覆寫，只能變更狀態**；觀測（Observation）只增不減，確保推理鏈可回溯。
- **LLM 負責抽取與整理，人類負責審查與核准**——兩者之間有明確的草稿佇列與編譯流程把關。
- **Git 是唯一的版本來源**，所有認知單元的變更歷史都可追蹤、可 diff、可協作。

如果你需要一個「能回答為什麼、能展示證據、能隨時間演化」的知識庫，而不是又一個靜態 wiki，Noematica 就是為此設計的。

---

## 快速開始

### 前置需求

- Git
- Node.js / TypeScript（`application/` 層）
- Python 3（`epistemic/` + `runtime/` 層）
- 可選：Anthropic / OpenAI API Key，或本機 llama-server（用於筆記抽取與關聯分析）

### 安裝

```bash
git clone https://github.com/MRSogzz/Noematica.git
cd Noematica
pip install -r requirements.txt
# Node 端依賴請依 application/ 內的 package.json 安裝
```

### 啟動

```bash
# 啟動 Python 認知服務（FastAPI，預設 127.0.0.1:8765）
python3 integration/epistemic_adapter/http_server.py

# 啟動 Node 後端與前端（請依 application/ 的啟動方式）
# 例如：
# cd application && npm install && npm run dev
```

開啟 HUD 介面後，按 **M 鍵**進入認知地圖（Activation Orbit），按 **H 鍵**進入 AI 知識整理面板。

---

## 核心概念

### 認知圖譜（Entity‑Atom‑Observation‑Source）

Noematica 的知識由四種卡片構成：

| 層級 | 角色 | 關鍵欄位 | 特性 |
|---|---|---|---|
| **Entity** | 實體卡片 | uid / name / type / domains / aliases | 可被多個 Atom 引用 |
| **Atom** | 關係骨架 | from → to / type / abstraction / status / lifecycle / lineage | **永不覆寫，僅變更狀態** |
| **Observation** | 觀測紀錄 | atom / epoch / 五維 context / impact / probability / stance / confidence / evidence | **只增不減** |
| **Source** | 原始證據錨點 | title / source_fingerprint / published_date | 證據的根 |

所有卡片皆以 **Markdown + frontmatter** 儲存於 `epistemic/` 對應目錄，版本由 Git 完整追蹤。

### 四層架構與橋接

系統分為四層，彼此僅透過 `integration/` 溝通：

- `application/` — Web UI、API 服務（Node/TS）
- `knowledge/` — 人類可讀的敘事文件（`docs/`）與 AI 產出草稿（`wiki/`）
- `epistemic/` — 認知核心：Entity / Atom / Observation / Source
- `runtime/` — 推理與自動化服務（索引、激活、政策、編譯、推理、抽取、關聯）
- `integration/` — 橋接層（`epistemic_adapter` HTTP 服務 + 合約定義）

`application/`（Node/TS）與 `epistemic/` + `runtime/`（Python）各自獨立，透過 HTTP 服務整合。

---

## 主要功能

### 認知地圖 — Activation Orbit（M 鍵）

以焦點實體為中心，沿知識圖譜進行**多跳關聯查詢**：

- **搜尋**：依名稱／別名／uid／領域／類型篩選 Entity 與 Atom。
- **Activation Queue（左側）**：計算每個可達實體的 **Path Confidence**（路徑上最弱一段的信心 × 每多一跳的衰減係數），分成 **Strong / Medium / Weak / Hidden** 四桶。
- **Orbit（中央同心圓）**：Layer 0 / 1 / 2 / 3… 分層展開，層數上限由 `runtime/policy/policy.yaml` 的 `activation_queue.max_layer` 控制（預設 4 層）。
- **Explain 面板**：彙總關聯 Atom 底下的證據（support／contradiction／baseline）。
- **Reasoning Path 面板**：顯示從搜尋起點到目前焦點的最短路徑（敘事鏈）。
- **Timeline 面板**：關聯觀測依 epoch 分組呈現。

### AI 知識整理（H 鍵）

讀取 `knowledge/docs/` 中的人類筆記，經 LLM 整理為結構化摘要，寫入 `knowledge/wiki/`。支援 **Anthropic、OpenAI、Llama（本機）、自訂端點** 四種 provider。

### 筆記抽取為知識（M 面板側欄）

將自由文字經 LLM 抽取為候選 Entity / Atom / Observation，自動比對既有 Entity 以重用 uid。產出草稿寫入 `epistemic/0_Inbox/`，需經人工審查才編譯進正式層。

### 草稿審查閉環

- 列表檢視 `0_Inbox/` 中所有草稿。
- 核准（標記 `approved: true`）／拒絕（附原因，移入 `6_Rejected/` 作為反模式記憶）。
- 編譯：呼叫 Compiler 驗證格式並寫入對應正式目錄，成功後草稿自 `0_Inbox/` 消失。

### 跨筆記關聯分析（CLI / API）

分析兩篇筆記的關聯程度，基於三維度：**實體重疊度（Jaccard）**、**認知圖距離（Atom 圖最短路徑）**、**立場關係（LLM 判斷：reinforce / complementary / contradict / neutral）**。分數超過門檻即產生提案。

### 索引與治理稽核

- **Index Builder**：掃描四層卡片生成 TSV 索引與知識債務報表（`.index/`）。
- **Governance Auditor**：離線掃描全圖，產生調解、生命週期審查、復活提案（寫入 `0_Inbox/`）。
- **Policy Engine**：統一管理信心衰減、棄權門檻、調解觸發、生命週期規則（`runtime/policy/policy.yaml`）。

---

## 系統架構

### 服務組成

- **Python 認知服務**：`integration/epistemic_adapter/http_server.py`（FastAPI），監聽 `127.0.0.1:8765`。
- **Node 後端**：`application/backend/server.ts`，代理所有 `/api/epistemic/*` 請求至 Python 服務。
- **正式合約**：`integration/contracts/*.schema.json`（Query、Belief、Feedback），確保前後端資料形狀一致。

### HUD 面板一覽

| 功能 | HUD 按鍵 | CLI | HTTP | 資料位置 |
|---|---|---|---|---|
| 個人日誌 | F1 | `wiki note` | `/api/notes` | `application/.system/user/notes/` |
| 協作大廳 | F2 | `wiki git` | `/api/git/*` | `.git` |
| 認知地圖 | **M** | — | `/api/epistemic/orbit/:uid` 等 | `epistemic/` 四層 |
| AI 知識整理 | **H** | — | `/api/ai/*` | `knowledge/wiki/` |
| 筆記抽取 | M 面板側欄 | `wiki epistemic extract` | `/api/epistemic/extract` | `epistemic/0_Inbox/` |
| 跨筆記關聯 | — | `wiki epistemic correlate` | `/api/epistemic/correlate` | `epistemic/0_Inbox/` |
| 草稿審查 | M 面板側欄 | `wiki epistemic inbox list\|approve\|reject\|compile` | `/api/epistemic/inbox*`、`/compile` | `epistemic/0_Inbox/` → 正式層 |
| 治理摘要 | M 面板頂欄 | — | `/api/epistemic/governance-summary` | `epistemic/` 全部四層 |
| 知識庫索引重建 | — | `python3 runtime/indexer/index_builder.py` | — | `.index/` |
| 治理稽核 | — | `python3 runtime/policy/governance_auditor.py` | — | `0_Inbox/` |
| 草稿編譯 | M 面板「審查」Modal | `wiki epistemic inbox compile` | `POST /api/epistemic/compile` | 正式四層 |

---

## API 端點

以下為 Node 代理層暴露的端點：

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/api/epistemic/health` | 檢查 Python 連線 |
| `POST` | `/api/epistemic/query` | 單一 Atom 認知查詢（回傳 Belief Contract） |
| `POST` | `/api/epistemic/feedback` | 寫入查詢歷史 |
| `GET` | `/api/epistemic/graph` | 完整 Entity‑Atom 圖譜（舊版 3D 地圖用，已不建議依賴） |
| `POST` | `/api/epistemic/extract` | 筆記抽取（需指定 LLM 配置） |
| `POST` | `/api/epistemic/correlate` | 跨筆記關聯分析 |
| `POST` | `/api/epistemic/inbox/list` / `approve` / `reject` / `compile` | 草稿審查操作 |
| `GET` | `/api/epistemic/domains` | 取得所有 domain（Orbit 搜尋篩選用） |
| `GET` | `/api/epistemic/search` | 依名稱／別名／uid／domain／type 搜尋 |
| `GET` | `/api/epistemic/orbit/:uid` | **Orbit 核心資料**：Layer 分層 + Activation Queue（多跳 Path Confidence） |
| `GET` | `/api/epistemic/explain/:uid` | 關聯 Atom 的證據彙總 |
| `GET` | `/api/epistemic/reasoning-path?from=&to=` | 兩實體間最短路徑（敘事鏈） |
| `GET` | `/api/epistemic/timeline/:uid` | 關聯觀測依 epoch 分組 |
| `GET` | `/api/epistemic/governance-summary` | 治理提示摘要 |

---

## 目錄結構

```
my-knowledge-repo/
├── application/              # Node/TS 專案（後端、CLI、前端）
│   ├── backend/server.ts     # API 服務 + epistemic 代理
│   ├── cli/wiki.ts           # CLI 入口
│   ├── frontend/             # HUD 介面（hud-main.html 為入口）
│   ├── modules/              # I/O 週期表模組
│   ├── milestones/           # F4 里程碑
│   └── .system/              # 快取與個人筆記
├── knowledge/
│   ├── docs/                 # 人類可讀知識文件（F5）
│   └── wiki/                 # AI 整理產出草稿
├── epistemic/                # 認知核心（0_Inbox ~ 9_Blind_Spots + .index/）
├── runtime/                  # indexer / activation / policy / compiler / reasoning / extraction / correlation
├── integration/
│   ├── epistemic_adapter/    # HTTP 服務（FastAPI）+ adapter
│   ├── wiki_adapter/         # Python 端呼叫範例
│   └── contracts/            # JSON Schema 合約
├── pre-commit.sample         # Git hook 範例
└── requirements.txt          # Python 依賴
```

---

## 已知限制

- **筆記抽取與關聯分析需依賴 LLM**（Anthropic / OpenAI / 本機 llama）。使用本機 llama 時需自行啟動 `llama-server`，且端點與設定一致。
- **`wiki map`（CLI 瀏覽 docs 目錄樹）與 HUD 的 M 鍵是不同功能**，此為既有設計。
- **草稿審查的「核准」與「編譯」為兩步驟操作**，避免誤觸導致未經完整驗證即寫入正式層。

---

## FAQ

<details>
<summary><b>Noematica 跟 Obsidian、Logseq、Notion 有什麼不同？</b></summary>

那些工具的核心單位是**頁面或區塊**，連結是附加的裝飾；Noematica 的核心單位是**關係（Atom）與觀測（Observation）**，頁面只是它們的載體。

差別在三個地方：

- **關係是一等公民，且不可覆寫。** 一條 Atom 代表「A 與 B 之間存在某種關係」，它只能變更狀態（`status`／`lifecycle`），不能改寫歷史。雙向連結沒有這個約束。
- **每條斷言都能回溯到證據。** Observation 綁定 Source，並記錄信心、立場、影響等維度；一般筆記的連結不帶證據鏈。
- **LLM 抽取、人工審查、編譯是必經流程。** 知識進入正式層前要經過草稿佇列，而不是直接寫進頁面。

如果你要的是「快速記東西」，用 Obsidian 就好；如果你要的是「知識之間為什麼成立、證據是什麼、隨時間怎麼演化」，那才是 Noematica 的場景。
</details>

<details>
<summary><b>不用 LLM 也能用嗎？</b></summary>

可以，但功能會大幅降級。

核心的認知圖譜、Atom／Observation／Source 四層、Git 版本追蹤、Orbit 關聯查詢、治理稽核、草稿審查編譯——這些都是**不依賴 LLM** 的，你完全可以手動建立與維護卡片。

需要 LLM 的是三件事：**筆記抽取**（自由文字 → 候選卡片）、**AI 知識整理**（docs → wiki 摘要）、**跨筆記關聯分析**（立場判斷）。

換句話說：**LLM 是加速器，不是地基。** 沒有它，你手動填卡片；有它，你把手寫筆記丟進去讓它幫你起草，再由你審查。
</details>

<details>
<summary><b>支援哪些 LLM？可以完全本地嗎？</b></summary>

支援四種 provider：**Anthropic、OpenAI、Llama（本機 llama-server）、自訂端點**。這四種已涵蓋絕大多數主流服務——任何走 OpenAI 相容格式的端點（Ollama、LM Studio、vLLM、OpenRouter、各類雲端模型）都能歸進「自訂端點」使用。

完全本地是可行的：用本機 `llama-server` 跑開源模型，抽取與整理都在自己機器上完成，資料不出門，成本為零。前提是你得先自行啟動 `llama-server`，並讓端點與設定一致。

雲端與本地可以混用——例如抽取用本地小模型省錢，關聯分析的立場判斷用雲端大模型。
</details>

<details>
<summary><b>為什麼關係（Atom）不能改，只能變更狀態？</b></summary>

因為**歷史本身就是知識的一部分**。

如果一條「A 導致 B」的關係可以被直接改寫成「A 與 B 無關」，你就失去了「當初為什麼認為它們有關、後來為什麼推翻」的推理軌跡。Noematica 的做法是：Atom 的內容骨架固定，但你可以變更它的 `status`（例如 active／retracted）、`lifecycle`，並透過新的 Observation 記錄「現在的看法」。舊的觀測不會消失，新舊並存，推理鏈因此可回溯。

代價是：你不能「刪掉一條關係假裝它沒存在過」，只能標記它已失效。這是刻意的取捨。
</details>

<details>
<summary><b>為什麼一定要人工審查，不能全自動寫入嗎？</b></summary>

可以全自動，但 Noematica 刻意不做。

LLM 抽取出來的 Entity／Atom／Observation 會先寫進 `epistemic/0_Inbox/` 草稿佇列，**必須經人工核准並編譯**才會進入正式層。原因很簡單：LLM 會出錯，而且錯得很自信。如果讓它直接寫入正式知識層，錯誤會污染整張圖譜，而圖譜是用來推理的——污染的推理鏈比沒有推理鏈更危險。

這個設計讓「抽取」與「採信」分離：機器負責廣度，人負責把關。
</details>

<details>
<summary><b>為什麼用 Git，而不是資料庫？</b></summary>

因為 Noematica 要的是**可追溯、可 diff、可協作的知識歷史**，而 Git 本來就是為這件事設計的。

所有認知單元都是 Markdown + frontmatter，存在檔案系統裡，版本由 Git 完整追蹤。你能看到「三個月前這條關係的信心是多少、誰在什麼時候基於什麼證據改了它」。用資料庫也能做版本，但你得自己造一套；Git 免費給你、而且生態成熟（分支、PR、code review 的工作流直接複用）。

代價是：查詢效能不如資料庫，大規模時需要額外索引層。這也是為什麼有 `runtime/indexer` 生成 TSV 索引與知識債務報表。
</details>

<details>
<summary><b>資料存在哪？可以備份或搬移嗎？</b></summary>

全部在你的 repo 裡：

```text
epistemic/          # 四層卡片（Markdown + frontmatter）
knowledge/docs/     # 人類可讀文件
knowledge/wiki/     # AI 整理草稿
.index/             # 索引與報表（可重建）
application/.system/user/notes/   # 個人日誌
```

沒有隱藏的雲端資料庫。備份就是 `git push` 或複製整個目錄；搬移就是 clone 到另一台機器。`.index/` 是衍生物，刪掉可重建。
</details>

<details>
<summary><b>Path Confidence 是怎麼算的？</b></summary>

沿知識圖譜從焦點實體往外走，每個可達實體會得到一個分數，規則是：**路徑上最弱一段的信心 × 每多一跳的衰減係數（0.9）**。

也就是說，一條鏈的整體信心不會高於它最弱的一環（木桶原理），而且每多走一跳就乘上 0.9，走得越遠衰減越多。分數最後分成 **Strong / Medium / Weak / Hidden** 四桶，顯示在 Activation Queue。層數上限（預設 4 層）由 `runtime/policy/policy.yaml` 的 `activation_queue.max_layer` 控制，可調。
</details>

<details>
<summary><b>沒有 Web UI 嗎？HUD 是什麼？</b></summary>

有 HUD，它是**瀏覽器載入的本機介面**——前端是 `application/frontend/hud-main.html`，由 Node 後端提供，預設在 `localhost` 開啟。

HUD 提供鍵盤操作的面板：F1 個人日誌、F2 協作大廳、**M 鍵**認知地圖（Activation Orbit）、**H 鍵** AI 知識整理。

雖然預設是本機使用，但因為它就是一般的網頁介面，**也可以部署到伺服器**讓他人存取。不過要注意：Noematica 本身沒有內建多用戶鑑權與儲存隔離，若要當多人服務用，這些得自己補上。
</details>

<details>
<summary><b>能匯入既有的 Markdown／Obsidian 筆記嗎？</b></summary>

**Markdown 可以，Obsidian 特有語法不行。**

任何標準 Markdown 檔案放進 `knowledge/docs/`，就會被視為人類可讀文件，可以走 **H 鍵的 AI 知識整理**產生 wiki 摘要，或走**筆記抽取**流程把內容抽成候選 Entity／Atom／Observation。Noematica 本身就是 Markdown + frontmatter，所以檔案格式天然相容。

但**不支援 Obsidian 特有語法**：

- `[[wikilink]]` 雙向連結不會被解析成 Entity 關係——Noematica 的關係是顯式的 Atom 卡片，不是隱含的連結。
- Obsidian 的 frontmatter 慣例、`dataview` 查詢、Callouts（`> [!note]`）、`.obsidian/` 設定與外掛，都不會被讀取。
- 沒有內建的一鍵轉換器把 Obsidian vault 對映到四層卡片。

如果你想從 Obsidian 遷移，實際路徑是：把 `.md` 檔丟進 `knowledge/docs/` → 讓 LLM 抽取成候選卡片 → 人工審查 → 編譯進正式層。`[[wikilink]]` 若要變成 Atom，得先自己寫腳本轉換成 Entity 引用，這部分目前沒有現成工具。
</details>

<details>
<summary><b>能處理多大的知識量？</b></summary>

**設計目標是 10 萬張卡片以上，但目前沒有實測。**

架構上是為大規模設計的：四層卡片存在檔案系統、由 Git 追蹤，`runtime/indexer` 生成 TSV 索引加速查詢，Orbit 多跳查詢用層數上限（預設 4 層）與 Path Confidence 控制展開成本，避免在稠密圖上爆炸。

但要老實說：**目前沒有公開的規模基準測試**，10 萬+ 是設計目標而非已驗證的數字。實際效能會受圖譜密度、查詢跳數、硬體影響。如果你有實測數據，歡迎開 issue 回報，會直接補進這裡。
</details>

<details>
<summary><b>授權怎麼看？商用可以嗎？</b></summary>

分兩層：

- **程式碼**：AGPL-3.0。你可以自由使用、修改、散布；但若你把 Noematica 作為網路服務提供給他人，必須公開你的原始碼。
- **知識庫內容**：CC BY-NC-SA 4.0，非商業、相同方式分享。

**商業授權另議**：如果你要在閉源產品中整合，或不想受 AGPL 的網路服務條款約束，需要取得商業授權（詳見 `COMMERCIAL_LICENSE.md`）。純個人、研究、開源用途不受影響。
</details>

<details>
<summary><b>跟 RAG／向量資料庫有什麼不同？</b></summary>

**Noematica 沒有 RAG，也不使用向量檢索。** 兩者解決的是不同問題。

RAG 解決「**從大量文本中找回相關片段**」，本質是相似度搜尋；Noematica 解決「**知識之間為什麼成立、證據是什麼**」，本質是結構化推理。它靠的是顯式的實體—關係—觀測結構，加上多跳 Path Confidence 做關聯排序，而不是 embedding 相似度。

這帶來一個關鍵差異：RAG 回傳的片段你只能「相信它相關」；Noematica 回傳的關聯可以**沿著 Atom 與 Observation 一路回溯到 Source**，看得出這條關聯是基於什麼證據、信心多少、有沒有被標記為衝突。

兩者可以互補：如果你已經有 RAG 系統，Noematica 可以作為它之上的「結構化知識層」，處理需要展示證據鏈與關係演化的查詢。但 Noematica 本身不含向量資料庫元件。
</details>

---

## 授權

- **Source Code**：AGPL-3.0
- **Knowledge Base**：CC BY-NC-SA 4.0
- **Commercial Licensing**：available，詳見 `COMMERCIAL_LICENSE.md`

---

## 貢獻

歡迎 Issues 與 Pull Requests。由於本專案涉及認知層的寫入與編譯流程，建議在提交前先閱讀 `integration/contracts/*.schema.json` 與相關 runtime 服務的規則，確保變更符合四層架構的邊界。

---

<div align="center">

**如果 Noematica 對你的知識工作有幫助，一顆 ⭐ 能讓更多人找到它。**

</div>