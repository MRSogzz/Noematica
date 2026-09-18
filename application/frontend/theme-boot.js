/* ============================================================
   theme-boot.js — 給「用 <iframe> 載入的獨立面板」用的主題套用腳本
   （目前是 panel-m-orbit.html；panel-tests.html 雖然不再被 iframe 注入，
   還能獨立開啟，也保留載入這支腳本。同一份 HTML 文件裡直接 render 出來的
   F1/F2/F3/F4/F5/B/H 面板，本來就跟主 HUD 共用同一個 document，不需要這
   支腳本，直接讀 hud.css 裡 applyTheme() 設好的 CSS 變數即可）。

   iframe 是獨立的瀏覽器文件，主 HUD 對 document.documentElement 設的 CSS
   變數完全不會傳進來，所以每個 iframe 面板要自己重新 fetch 一次 theme.json、
   自己設一份同名的 CSS 變數（顏色 + 字型）。變數命名刻意跟 hud.css 的
   :root 對齊（--accent / --text / --border / --panel-bg / --muted /
   --font-heading / --font-body / --font-mono 等等），面板自己的 :root
   只需要用 var(--xxx, fallback) 接手，不用重新發明一套命名。

   要套用哪個主題：讀 URL 的 ?theme= 參數（由 shell/modal-shell.js 的 openModal()
   建立 iframe 時帶進來，見該檔案），沒帶的話（例如 panel-tests.html
   獨立開啟、或直接開 panel-m-orbit.html 沒經過 query string）才退回
   'default'——不是永遠寫死抓 default，這樣主 HUD 目前實際套用的主題
   跟 iframe 才會一致。

   已知限制：如果使用者是從設定面板手動上傳 theme.json（不是選內建的
   default/gamification/noematica 這種有固定 URL 的），這裡沒辦法取得
   那份資料——手動上傳的是純前端 File 物件，沒有一個 iframe 也讀得到的
   URL。要支援的話需要改成 postMessage 從主文件把套用過的顏色/字型轉發
   進來，目前先用「讀 query string 選內建主題」這個簡單版本，夠用再說。
   ============================================================ */
(function () {
  const params = new URLSearchParams(location.search);
  const themeId = params.get('theme') || 'noematica';

  fetch(`assets/themes/${themeId}/theme.json`)
    .then(r => r.json())
    .then(t => {
      const root = document.documentElement, c = t.colors || {};
      const colorMap = {
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
      Object.entries(colorMap).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });

      // 字型（選填）：跟 hud-utils.js 的 applyTheme() 同一套「有定義才
      // 套用」邏輯，也是同一組變數名（--font-heading/--font-body/
      // --font-mono），沒有這個欄位的主題（目前 gamification/cyber）
      // 就完全不影響 iframe 面板原本內建的字型。
      const f = t.fonts;
      if (f) {
        if (f.heading) root.style.setProperty('--font-heading', f.heading);
        if (f.body)    root.style.setProperty('--font-body', f.body);
        if (f.mono)    root.style.setProperty('--font-mono', f.mono);
        if (f.googleFontsUrl && !document.querySelector('link[data-theme-font]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = f.googleFontsUrl;
          link.dataset.themeFont = 'true';
          document.head.appendChild(link);
        }
      }
    })
    .catch(err => console.warn('[Theme Boot] 無法載入主題，沿用面板內建配色：', err));
})();
