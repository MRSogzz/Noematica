# Noematica Frontend Component Library

Vanilla Web Components，落地 `NUG.md` 定義的知識概念映射規則。跟現有 `hud-panels.js` 那套 vanilla JS app 直接相容——不需要建置流程、不需要框架依賴，瀏覽器原生支援 `<script type="module">` 就能用。

---

## 為什麼選 Web Component

現有前端是純 HTML/CSS/Vanilla JS，React/Vue 元件庫沒辦法直接嵌進 `hud-panels.js` 產生的 innerHTML 裡，會需要額外的 runtime／建置流程／打包設定，等於在一個原本零依賴的專案裡引入一整條新的技術棧。Web Component 是瀏覽器原生 API，`document.createElement('entity-card')` 或直接寫 `<entity-card>` 標籤就能用，跟現有程式碼的互動方式（`innerHTML`、`renderGrid()` 這類字串拼接）完全相容。

**Shadow DOM 帶來的隔離**：每個元件的樣式包在各自的 Shadow Root 裡，不會被 `hud.css` 裡那些寫得很寬的選擇器（例如 `.m-item`、`.modal-body`）意外影響，也不會反過來污染既有樣式——這是「確保程式能正常運作」最直接的保障：新元件跟舊系統物理隔離，程式碼层面不可能互相干扰。

**CSS 自訂屬性會穿透 Shadow DOM**：這是唯一一種能穿過 Shadow 邊界的東西，所以元件內部直接用 `var(--accent)`、`var(--text)` 這些 NDL token，會自動吃到外層 `hud.css` 的 `:root` 設定跟 `applyTheme()` 執行期覆蓋的值——換主題時這些元件會自動跟著換色，不需要額外接線。

---

## 元件清單

| 元件 | 對應 NUG 章節 | 說明 |
|---|---|---|
| `<activation-badge>` | §4 Confidence/Activation | 信心分級徽章，內部自己做 Strong/Medium/Weak/Hidden 判斷 |
| `<stance-icon>` | §3 Observation | 立場圖示（支持/反對/中立） |
| `<entity-card>` | §1 Entity | 實體卡片（類型圖示＋名稱＋領域標籤＋描述） |
| `<evidence-card>` | §2 Atom + §5（組合呈現） | 關係卡片，內部組合 `<activation-badge>`，可插入 `<stance-icon>` 列表 |

每個元件的完整屬性說明寫在對應 `.js` 檔案開頭的註解裡，不在這裡重複。

**單一事實來源**：所有分級門檻、色碼、類型對照表都定義在 `nug-tokens.js`，其他元件一律從這裡 import，不在元件內部各自複製一份判斷邏輯——這是 `NUG.md` §4 明講的規則（「分級門檻以後要調，只能改一個地方」），這個檔案就是那「一個地方」。`NDL.md`/`NUG.md` 的色碼數值調整時，也只需要改這一個檔案。

---

## 使用方式

```html
<script type="module" src="components/index.js"></script>

<entity-card name="fed_funds_rate" type="macro_variable"
  domains="總經,貨幣政策" description="聯邦基金利率...">
</entity-card>

<evidence-card from-name="fed_funds_rate" to-name="bank_net_interest_margin"
  relation-type="causal" confidence="0.62">
  <stance-icon slot="observations" stance="support" label="2023Q1"></stance-icon>
  <stance-icon slot="observations" stance="contradict" label="2023Q2"></stance-icon>
</evidence-card>
```

只需要單一元件時，可以只 import 那一個檔案（例如 `import './components/activation-badge.js'`），不用整包 `index.js` 一起載入。`evidence-card.js` 內部依賴 `activation-badge.js`，已經在檔案裡自己 import，不用手動處理依賴順序。

---

## 測試

**Demo 頁面**（肉眼檢查渲染效果，用真實資料樣本，不是假占位資料）：

```
application/frontend/components/demo/demo.html
```

用瀏覽器直接開（或起個本地伺服器），會看到四種元件的完整狀態展示，包含刻意測試的邊界案例（Hidden 分級不畫東西、非法 stance 值正規化成中立、未知 Entity 類型 fallback 成預設圖示）。

**自動化功能測試**（驗證元件邏輯本身，不是只有語法檢查）：

```bash
cd application/frontend/components
npm install        # 只裝 jsdom 這個測試用的 devDependency，元件本身零執行期依賴
npm test
```

測試內容：確認四個 custom element 都正確註冊、`activation-badge` 在四個分級門檻的邊界值上判斷正確、`stance-icon` 對非法值的正規化行為、`entity-card` 對未知類型的 fallback、`evidence-card` 內部依賴 `activation-badge` 正確接上資料、不同 `relation-type` 產生的線條粗細確實有差異。全部斷言都是真的執行元件的 `connectedCallback`/`attributeChangedCallback` 邏輯，不是只檢查檔案能不能被 parse。

**已知的測試工具限制**：原本想額外做一層「真的用 HTTP 載入 `demo.html`、驗證 `<script type="module" src="...">` 真的執行」的端對端測試，但發現 jsdom（測試用的 DOM 模擬器）不支援執行 `<script type="module">`——連最小的一行測試腳本都不會跑，這是 jsdom 本身的已知限制，不是這份元件庫的問題（原生瀏覽器對 ES modules 的支援非常成熟，`<script type="module">` 不是新功能）。目前的測試策略是：直接 import 元件的 `.js` 檔案去驗證邏輯（涵蓋所有實際渲染行為），加上 demo.html 給人眼確認 HTML/CSS 呈現效果，兩者合起來已經覆蓋了元件庫的正確性，只是沒有自動化驗證「HTML 檔案本身透過瀏覽器載入模組」這一小段瀏覽器原生行為。

---

## 檔案結構

```
components/
├── nug-tokens.js       — 共用映射表（單一事實來源）
├── activation-badge.js
├── stance-icon.js
├── entity-card.js
├── evidence-card.js
├── index.js             — 一次 import 全部元件
├── package.json
├── test_components.mjs  — 自動化功能測試
└── demo/
    └── demo.html         — 瀏覽器可視化 demo
```

---

## 尚未涵蓋的部分

這一輪只做了 NUG 明確定義的四個知識概念元件。以下不在這次範圍內，但屬於同一套系統，未來如果要做：

- NDL 層級的通用元件（例如熱鍵按鈕、Modal 外殼本身）目前還是 `hud-panels.js`/`hud.css` 裡的字串拼接寫法，沒有轉成 Web Component——這是刻意的，因為那些元件已經穩定運作，重寫的風險大於收益，這次只針對「新的、還沒有實作」的 NUG 概念做元件化。
- Focus（鍵盤導覽）狀態——`NDL.md` §7 已經標記這是全系統缺失的一塊，這幾個元件目前也沒有補上，維持跟現況一致，不在這裡單獨補一塊其他地方沒有的無障礙功能。
