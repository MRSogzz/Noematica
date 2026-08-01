/* ============================================================
   theme-boot.js — 給「用 <iframe> 載入的獨立面板」用的主題套用腳本
   （目前是 panel-m-orbit.html、panel-tests.html；同一份 HTML 文件裡直接
   render 出來的 F1/F2/F4/F5/B/H 面板，本來就跟主 HUD 共用同一個 document，
   不需要這支腳本，直接讀 hud.css 裡 applyTheme() 設好的 CSS 變數即可）。

   iframe 是獨立的瀏覽器文件，主 HUD 對 document.documentElement 設的 CSS
   變數完全不會傳進來，所以每個 iframe 面板要自己重新 fetch 一次 theme.json、
   自己設一份同名的 CSS 變數。變數命名刻意跟 hud.css 的 :root 對齊
   （--accent / --text / --border / --panel-bg / --muted 等等），面板自己的
   :root 只需要用 var(--xxx, fallback) 接手，不用重新發明一套命名。

   已知限制：這裡固定讀 assets/themes/default/theme.json，不會動態跟著使用者
   在設定面板手動上傳的 theme.json 走（那個是純前端 File 物件，沒有一個可以
   讓 iframe 也讀到的 URL）。如果之後要讓「手動上傳的主題」也套用到已經開著
   的面板，需要改成 postMessage 從主文件把套用過的顏色轉發進來，目前先用
   簡單版本，夠用再說。
   ============================================================ */
(function () {
  fetch('assets/themes/default/theme.json')
    .then(r => r.json())
    .then(t => {
      const root = document.documentElement, c = t.colors || {};
      const map = {
        '--accent':       c.accent,
        '--accent2':      c.accent2,
        '--text':         c.text,
        '--muted':        c.muted,
        '--border':       c.border,
        '--border2':      c.border2,
        '--panel-bg':     c.panelBg,
        '--key-bg':       c.keyBg,
        '--overlay-color':c.overlayColor,
      };
      Object.entries(map).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });
    })
    .catch(err => console.warn('[Theme Boot] 無法載入主題，沿用面板內建配色：', err));
})();