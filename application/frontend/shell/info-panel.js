/* ============================================================
   shell/info-panel.js — WorkspaceShell 的 Info Panel 層
   ============================================================
   跟 sidebar.js 同一種分工：六個面板的 InfoPanel 長相完全一樣
   （icon + 名稱 + 標籤 + 屬性列 + 說明 + 操作按鈕），只有資料不同，
   這裡是那份共用的畫面邏輯。

   H（AI 知識整理）在對話模式下會直接把 #m-detail 整個隱藏掉
   （$('m-detail').style.display = 'none'，見 panels/h/container.js），
   繞過了這裡——這是目前唯一一個「四層裡有一層不穩定存在」的案例，
   在把四層變成正式介面（例如 Container 回傳宣告式的
   { sidebar, content, infoPanel } 而不是指令式呼叫）之前，這個函式
   本身管不到、也不該管 H 要不要顯示自己，只能先在架構文件裡記錄這個
   已知的不一致。
   ============================================================ */

function renderDetail({ icon, name, tag, attrs, desc, actions }) {
  $('m-detail-icon').textContent = icon || '📦';
  $('m-detail-name').textContent = name || '—';
  $('m-detail-tag').textContent  = tag  || '—';
  $('m-detail-body').innerHTML = `
    ${attrs ? attrs.map(a => `
      <div class="m-attr">
        <span class="m-attr-icon">${a.icon}</span>
        <span class="m-attr-text">${a.text}</span>
      </div>`).join('') : ''}
    ${desc ? `<div class="m-detail-desc">${desc}</div>` : ''}
  `;
  if (actions && actions.length) {
    $('m-detail-actions').style.display = 'flex';
    $('m-detail-actions').innerHTML = actions.map(a =>
      `<button class="m-action-btn ${a.cls||'secondary'}" onclick="${a.onclick}">${a.label}</button>`
    ).join('');
  } else {
    $('m-detail-actions').style.display = 'none';
  }
}
