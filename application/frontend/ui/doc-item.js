/* ============================================================
   DocItem — 知識圖鑑 (F5) 文件條列（Component 層）
   ============================================================
   原本 hud-panels.js 的 f5() 裡有兩份幾乎一樣的 row 樣板：
   「全部文件」清單（無摘要/標籤）跟「搜尋結果」清單（有摘要/
   標籤/加大 icon）。合併成一個 Component，用 variant 切換要不要
   顯示摘要跟標籤，兩處呼叫都改吃同一份樣板，之後要調整條列外觀
   （字級、間距、hover 效果）只要改這一個檔案。
   ============================================================ */

function DocItem(d, { onClick, variant = 'plain' } = {}) {
  if (variant === 'result') {
    // 搜尋結果：icon 稍大、多摘要跟標籤
    return `<div class="m-item" onclick="${onClick}"
                 style="aspect-ratio:unset;flex-direction:row;align-items:flex-start;gap:12px;padding:14px 16px;height:auto;border-radius:8px">
      <span style="font-size:22px;flex-shrink:0">📄</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${d.title}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin:2px 0">${d.path}</div>
        <div style="font-size:11px;color:rgba(240,234,216,0.5)">${d.excerpt}</div>
        <div style="margin-top:5px">${(d.tags || []).map(t => `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(232,200,115,0.1);color:var(--accent);border:1px solid rgba(232,200,115,0.2);margin-right:4px">${t}</span>`).join('')}</div>
      </div>
    </div>`;
  }
  // plain：全部文件清單，只有檔名 + 路徑
  return `<div class="m-item" onclick="${onClick}"
               style="aspect-ratio:unset;flex-direction:row;align-items:center;gap:12px;padding:12px 16px;height:auto;border-radius:8px">
    <span style="font-size:20px">📄</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700;color:var(--text)">${(d.name || '').replace('.md', '')}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.3)">${d.path}</div>
    </div>
  </div>`;
}
