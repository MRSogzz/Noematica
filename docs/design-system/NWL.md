# NWL — Noematica Window Layout

> 視窗（`.modal` 系列）的邊框／尺寸／版面規範。`NDL.md` 定義視覺 token，`NUG.md` 定義元件語法，`NAL.md` 定義素材本身怎麼切；這三份都沒有回答「素材切好之後，視窗在螢幕上實際要長什麼樣、要能響應式縮放」這件事，這份文件補這一塊。

> **核心立場**：版面尺寸永遠由功能內容／視窗大小決定，不是由圖片原生尺寸決定；圖片是額外疊加的裝飾層，載入快慢／成功失敗都不能影響版面正確性。這份文件目前是第四版，三次修改的脈絡見 §0。

---

## 0. 版本脈絡

1. **第一版**：反推一個等比例縮放倍率，讓 `.modal` 尺寸跟著素材原生尺寸放大——版面還是被圖片長寬比綁死，不是真響應式。
2. **第二版**：改用 `border-image` 九宮格 + `border-image-repeat: round` 平鋪——邊條可以響應式了，但四個角落沒辦法各自獨立放不同的功能圖示（`border-image` 的四角本來就是切自同一張來源圖）。
3. **第三版**：放棄 `border-image`，邊條改用 CSS `border-color` 模擬（不用圖片），四個角落改成獨立、絕對定位、固定尺寸的圖層——解決了「角落要各自獨立」的問題，但尺寸還是這份文件自己訂的一套 `clamp()` 數字，跟 F3/F4 用的 `.modal` 基礎尺寸（`hud.css` 的 92vw/90vh）不一樣，兩種面板大小不統一；而且皮膚 class 一掛上去就立刻套用顏色/圖片，沒有跟圖片是否載入完成脫鉤。
4. **第四版（目前）**：兩個問題一起解決——**尺寸完全不再覆寫**，B/H/F1/F2 直接沿用 `hud.css` 的 `.modal` 基礎尺寸，跟 F3/F4 統一同一個標準；**外觀改成兩階段**，面板剛開啟時（`.modal-skin-<id>` 剛掛上）長得跟 F3/F4 一模一樣（深色科技風），只有等角落圖示預先載入確認完成後，才多掛一個 `.skin-ready`，這時候顏色/圖片才會生效。

---

## 1. 尺寸：完全沿用 F3/F4 的標準，不覆寫

```css
/* hud.css 的 .modal（F3/F4 直接用這個，沒有額外皮膚） */
.modal {
  width: 92vw; height: 90vh;
  max-width: 1300px; max-height: 860px;
}
```

`panel-skins.css` 對 B/H/F1/F2 這四個面板**完全沒有另外寫 width/height**——不管是固定 px 還是 `clamp()`，一律不覆寫，直接沿用上面這個基礎規則。這樣「跟 F3/F4 統一標準」不是靠兩邊各自訂一套數字再對齊，而是**四個皮膚跟 F3/F4 從頭到尾用的就是同一條 CSS 規則**，之後 `hud.css` 這條規則如果調整，六個面板會一起變，不會有兩套標準各自維護、容易兜不起來的問題。

側欄（`.m-sidebar`，80px）、詳情欄（`.m-detail`，280px）也一樣——不再另外收窄，直接沿用 `hud.css` 的預設寬度，跟 F3/F4 一致。

---

## 2. 兩階段外觀：載入前跟 F3/F4 一樣，載入完成才換皮膚

### 2.1 為什麼要分兩階段

使用者的要求是「圖片不能影響設計，要做好隔離」。如果皮膚 class 一掛上就立刻套用顏色/圖片，會有兩個問題：圖片還沒載入完成的當下畫面會是「顏色已經換了，但角落圖示是空的」這種半吊子狀態；如果圖片載入失敗，畫面會卡在這個半吊子狀態出不來。兩階段設計把這兩個問題都消掉：**任何時間點，畫面都是一個完整、正確的樣子**——不是「F3/F4 同款深色科技風」，就是「皮膚完全到位的樣子」，沒有中間態。

### 2.2 機制

```js
// hud-core.js openModal()
modalEl.classList.add('modal-skin-' + id, 'nw-frame');      // 立刻掛上，但此時視覺上沒有作用
preloadImages(SKIN_CORNER_ASSETS[id]).then(() => {          // 預先載入角落圖示
  if (仍然是同一個面板) modalEl.classList.add('skin-ready'); // 載入完成（含失敗）才掛，這時候才真正變色
});
```

```css
/* panel-skins.css：幾乎所有跟顏色/圖片有關的規則都掛在 .skin-ready 底下 */
.modal.nw-frame.skin-ready { background: var(--nw-body); border-color: var(--nw-trim-side); ... }
.modal.nw-frame .nw-corner { display: none; }              /* 沒有 .skin-ready 之前，角落裝飾完全不存在 */
.modal.nw-frame.skin-ready .nw-corner { display: block; }
```

`preloadImages()` 用 `new Image()` 對每張圖分別掛 `onload`／`onerror`，兩者都會 `resolve`（失敗也算「處理完了」，不會讓 `Promise.all` 卡住）——這代表就算某張圖 404 或載入失敗，`.skin-ready` 還是會準時掛上，只是那個角落看起來是空的，不會讓整個皮膚都套用不上去。

### 2.3 載入前後兩個狀態長什麼樣

| | 載入前（`.modal-skin-<id>` 剛掛上，沒有 `.skin-ready`） | 載入後（多了 `.skin-ready`） |
|---|---|---|
| 尺寸 | 跟 F3/F4 一樣（§1，自始至終沒變過） | 不變 |
| 邊框/底色 | `hud.css` 預設深色科技風 | 皮膚配色（`--nw-body`／`--nw-trim-*`） |
| 標題列 | 正常顯示，跟 F3/F4 同樣大小、同樣位置 | 只換底色/文字色，位置大小不變 |
| 關閉鈕 | `hud.css` 預設圓形按鈕＋「✕」文字，跟 F3/F4 同一個元件、同一個位置 | 只換視覺（顯示圖示），位置不變 |
| 四個角落裝飾 | 完全不存在（`display:none`，不佔版面空間） | 顯示徽章／裝飾邊角 |
| B 的道具格／F1／F2 清單 | 跟 F3/F4 一樣是預設深色方格 | B 換成 b_slot.png 底圖；F1/F2 換成單欄清單、邊緣透明 |
| 文字顏色 | `hud.css` 預設淺色（給深色底用） | `rgb(45,30,27)` 咖啡色 |

**標題不會太小、內容區不會太小**：因為載入前後都是同一份 `hud.css` 標題/內容區樣式在跑，沒有另外覆寫過字級或版面尺寸，這正是「跟 F3/F4 統一標準」在視覺上的直接結果。

---

## 3. 邊框元件（NW）細節

### 3.1 邊條：CSS 邊框顏色，不用圖片

```css
.modal.nw-frame.skin-ready {
  border-color: var(--nw-trim-side);
  border-top: 3px solid var(--nw-trim-top);
}
```

邊條就是 `.modal` 自己的 CSS `border`，天生響應式安全——沒有圖片需要拉伸或平鋪。

### 3.2 四個角落：獨立、固定尺寸、絕對定位、載入前不存在

```css
.modal.nw-frame .nw-corner {
  display: none;                                    /* 載入前：不存在 */
  position: absolute; width: 44px; height: 44px;    /* 載入後：固定尺寸，不隨 .modal 縮放 */
}
.modal.nw-frame.skin-ready .nw-corner { display: block; }
```

- **左上（`.nw-corner-tl.nw-badge`）**：面板專屬圖示，`--nw-badge-url` 指定圖片。
- **左下／右下（`.nw-corner-bl` / `.nw-corner-br`）**：純裝飾，CSS 畫的邊角框，不用圖片。
- **右上（關閉鈕）**：**沒有獨立的 `.nw-corner`**——直接沿用 `hud.css` 原本在 `.modal-header` 裡的 `.modal-close`，跟 F3/F4 用同一個元件、同一個位置（`margin-left:auto` 讓它自然貼齊 header 右側），`.skin-ready` 只換視覺，不換位置。這是跟第三版的差異：第三版把關閉鈕也做成一個獨立 `.nw-corner-tr` 疊在角落，這一版拿掉了，因為跟「關閉鈕位置要跟 F3/F4 一致」衝突。

### 3.3 CSS 變數

| 變數 | 誰定義 | 說明 |
|---|---|---|
| `--nw-body` | 各 `.modal-skin-*` | `.skin-ready` 後的內容區底色 |
| `--nw-badge-url` | 各 `.modal-skin-*` | 左上角落圖示 |
| `--nw-close-url` | 各 `.modal-skin-*` | 關閉鈕圖示 |
| `--nw-trim-top` / `--nw-trim-side` | `.nw-frame` 共用預設 | 邊條顏色，四個皮膚目前共用同一組 |
| `--text` | `.nw-frame.skin-ready` 覆寫 | 統一文字顏色，會透過 CSS 繼承傳到 inline `style="color:var(--text)"` 的地方（F1 編輯器、F2 commit 清單） |

---

## 4. 各面板現況

| 面板 | 左上角落 | 邊條色 | `.skin-ready` 後內容區底色 |
|---|---|---|---|
| B（背包） | `b_badge.png` | 藍頂／金邊（共用預設） | `#f6ecd9` |
| H（AI 小幫手） | `h_badge.png` | 同上 | `#f7ecd6` |
| F1（個人日誌，素材前綴 n_） | `n_badge.png` | 同上 | `#f5ecd9` |
| F2（協作大廳，素材前綴 l_） | `l_badge.png` | 同上 | `#f5ecd9` |

尺寸：跟 F3/F4 完全相同，見 §1，這裡不重複列。

九宮格 frame 圖（`b_frame.png` 等）現況見 `NAL.md` §6.3——CSS 已經不再引用，檔案保留但視覺上不生效。

---

## 5. Layout Type：Grid vs List vs Chat

- **Grid Layout**（B）：`.skin-ready` 前後都是方格，只是底圖從 `hud.css` 預設換成 `b_slot.png`。
- **List Layout**（F1／F2，靠 `.nw-list` 標記 class 啟用）：`.skin-ready` 前是跟 F3/F4 一樣的預設方格，`.skin-ready` 後換成單欄橫列、邊緣透明。F1 面板開啟時預設直接進入今天的筆記編輯畫面（見 `hud-panels.js` 的 `f1()`）。
- **Chat Layout**（H）：`panel-h.js` 完全自訂，不套用上面兩種骨架，也不受 `.skin-ready` 影響（聊天室內容本來就是動態資料，不算這份檔案的皮膚系統範圍）。

---

## 6. 隔離：確保不影響 F3/F4

- `.nw-frame`／`.nw-list`／`.modal-skin-<id>`／`.skin-ready` 四個 class 都只在 `hud-core.js` 的 `openModal()` 裡、id 屬於 `b`/`h`/`f1`/`f2` 時才會掛上，F3/F4 永遠不會有這幾個 class。
- `panel-skins.css` 裡沒有任何一條規則是寫裸的 `.modal { ... }`，每一條都至少掛在 `.modal-skin-*` 或 `.modal.nw-frame` 底下。
- 尺寸（§1）跟 F3/F4 共用同一條 `hud.css` 規則，不是「兩邊各自訂一套數字」，物理上不可能不同步。
- 圖片載入的預載/gating（§2）確保就算網路慢或圖片 404，也只會讓某個皮膚停在「跟 F3/F4 一樣的深色科技風」，不會出現半套皮膚或版面跑掉的中間態，也不會反過來影響到 F3/F4 本身（F3/F4 從頭到尾沒有被這套機制碰過）。

---

## 7. 新增／修改一個 `.modal-skin-*` 時的檢查清單

- [ ] **不要覆寫 `.modal` 的 width/height**——直接沿用 `hud.css` 的 92vw/90vh，這是跟 F3/F4 統一標準的關鍵
- [ ] 這個面板走 Grid／List／Chat 哪一種 Layout Type（§5）
- [ ] 定義 `--nw-body`／`--nw-badge-url`／`--nw-close-url` 三個變數
- [ ] 新規則都掛在 `.skin-ready` 底下（除非是完全不受載入狀態影響的固定語意色，例如 F2 的房間狀態徽章）
- [ ] 在 `hud-core.js` 的 `SKIN_CORNER_ASSETS` 裡加這個面板要預載的圖片路徑
- [ ] 四個角落的 HTML（`.nw-corner-tl/bl/br`）比照 `hud-main.html` 現有結構複製，關閉鈕不用額外處理，沿用 `hud.css` 原本的 `.modal-close`
- [ ] 確認新加的規則都掛在 `.modal-skin-<id>` 或 `.modal.nw-frame` 底下，不要寫出裸的 `.modal { ... }`（§6）
- [ ] 開 `style-guide.html` 看一次對應的預覽卡（預覽卡展示的是 `.skin-ready` 之後的樣子，手寫的靜態範例，不會自動同步 `hud-panels.js` 的產出）
