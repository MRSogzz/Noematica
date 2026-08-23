/* ============================================================
   StatusFileRow — Git 工作目錄狀態的檔案列（Component 層）
   ============================================================
   原本 hud-panels.js 的 F2 status 分類裡，modified/staged/untracked
   三種清單各寫一次幾乎一樣的 row 樣板，只有 icon 跟顏色不同。合併成一個
   Component，三處呼叫都改吃同一份，之後要調整列外觀只改這一個檔案。
   ============================================================ */

function StatusFileRow(filename, { icon, color }) {
  return `<div class="m-item" style="aspect-ratio:unset;flex-direction:row;padding:10px 14px;height:auto;gap:10px;border-radius:6px">
    <span style="font-size:14px">${icon}</span>
    <span style="font-size:11px;color:${color}">${filename}</span>
  </div>`;
}
