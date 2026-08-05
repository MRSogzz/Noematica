# LLM WIKI — 換殼資源目錄說明

## 目錄結構

```
assets/themes/
  <主題ID>/
    theme.json        ← 主題設定檔（必要）
    bg/
      bg.jpg          ← 全螢幕背景圖（建議 1920×1080，JPG/PNG/WebP）
    minimap/
      minimap.png     ← 小地圖底圖（建議 260×260，PNG，圓形裁切）
    keys/
      key-f1.png      ← F1 快捷鍵圖示（建議 88×88，PNG，透明背景）
      key-f2.png      ← F2 快捷鍵圖示
      key-f3.png      ← F3 快捷鍵圖示
      key-f4.png      ← F4 快捷鍵圖示
      key-b.png       ← B 鍵圖示
      key-m.png       ← M 鍵圖示
    avatars/
      avatar-0.png    ← 角色頭像 0（建議 104×104，PNG）
      avatar-1.png    ← 角色頭像 1
      avatar-2.png    ← 角色頭像 2
```

## 圖片規格建議

| 用途       | 路徑              | 尺寸        | 格式      | 備注                    |
|-----------|------------------|------------|----------|------------------------|
| 背景圖     | bg/bg.jpg        | 1920×1080  | JPG/WebP | 深色場景效果最佳          |
| 雷達底圖   | minimap/minimap.png | 260×260 | PNG      | 圓形區域，中心為玩家位置   |
| 快捷鍵圖示 | keys/key-*.png   | 88×88      | PNG      | 透明背景，深色或半透明圖示 |
| 角色頭像   | avatars/avatar-*.png | 104×104 | PNG   | 上半身為主，透明背景      |

## 新增自訂主題

1. 在 `assets/themes/` 下建立新資料夾（例如 `my-theme/`）
2. 複製 `default/theme.json` 並修改 `id`、`name`、`colors` 設定
3. 將圖片放入對應子目錄
4. 在 `hud-main.html` 的 `THEMES` 陣列加入新主題 ID
5. 重新整理頁面即可看到新主題

## theme.json 欄位說明

```json
{
  "id":          "主題唯一識別碼",
  "name":        "顯示名稱",
  "description": "描述文字",
  "colors": {
    "accent":    "主色（任務菱形、鍵位文字、進度條）",
    "accent2":   "副色（進度條漸層右端）",
    "text":      "主文字色",
    "muted":     "次要文字色",
    "border":    "邊框色（低強調）",
    "border2":   "邊框色（高強調）",
    "panelBg":   "側滑面板背景",
    "keyBg":     "快捷鍵按鈕背景",
    "questBg":   "任務欄漸層深色端",
    "bgBlur":    "背景毛玻璃模糊值（如 '12px'）",
    "hpColor":   "血條顏色左端",
    "hpColor2":  "血條顏色右端"
  },
  "assets": {
    "bg":        "背景圖路徑（相對於 frontend/）",
    "minimap":   "雷達圖路徑",
    "keys": { "f1": "...", "f2": "...", ... },
    "avatars": { "0": "...", "1": "...", "2": "..." }
  },
  "panelSkins": {
    "__comment": "選填。B/H/F1/F2 四個面板的美術皮膚開關，見 docs/design-system/NWL.md §2。不填這個欄位（目前 default/gamification/cyber 都沒填）時，這四個面板開啟時會跟 F3/F4 一樣是預設深色科技風；只有 enabled 明確是 true，才會套用下面的顏色/圖片。",
    "enabled":  "true 才會啟用，其他情況（缺欄位／false）視為不啟用",
    "trimTop":  "四個面板共用的邊條標題列色，例如 '#2c5c8f'",
    "trimSide": "四個面板共用的邊條滾邊色，例如 '#c9a86a'",
    "text":     "四個面板套用皮膚後的文字色，例如 'rgb(45,30,27)'",
    "panels": {
      "b":  { "body": "背包內容區底色", "badge": "左上角落圖示路徑", "close": "關閉鈕圖示路徑" },
      "h":  { "body": "...", "badge": "...", "close": "..." },
      "f1": { "body": "...", "badge": "...", "close": "..." },
      "f2": { "body": "...", "badge": "...", "close": "..." }
    }
  }
}
```
