/* ============================================================
   CommitRow — 協作大廳 (F2) commit 條列（Component 層）
   ============================================================
   跟 ListLayout 搭配使用，DOM 結構刻意跟 panel-skins.css 的
   `.modal-skin-f2 .m-item` 選擇器對齊（見 list-layout.js 的說明）。
   ============================================================ */

function CommitRow(c, { onClick } = {}) {
  return `<div class="m-item" style="aspect-ratio:unset;flex-direction:row;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;height:auto" onclick="${onClick}">
    <div style="width:8px;height:8px;border-radius:50%;background:#4fc3f7;flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.message}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">${c.author} · ${new Date(c.date).toLocaleString('zh-TW')}</div>
    </div>
    <code style="font-size:10px;color:#4fc3f7;flex-shrink:0">${c.hash}</code>
  </div>`;
}
