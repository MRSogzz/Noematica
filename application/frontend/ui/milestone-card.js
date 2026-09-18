/* ============================================================
   MilestoneCard — 目標專案時程 (F4) 方格卡片（Component 層）
   ============================================================
   跟 SlotCell 一樣裝在 GridLayout 裡，但長相完全不同（進度條 +
   完成度百分比，而不是 I/O 型別色塊）。Layout 層不用知道這個差異。
   ============================================================ */

function MilestoneCard(m, { index } = {}) {
  const pct = m.completion;
  return `<div class="m-item" onclick="window._f4Show(${index})"
               style="padding:12px 10px;aspect-ratio:unset;height:auto;gap:6px">
    <div style="font-size:24px">${pct === 100 ? '🏆' : pct >= 60 ? '⚡' : '📌'}</div>
    <div class="m-item-name" style="font-size:11px;font-weight:700;color:var(--text)">${m.title}</div>
    <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:linear-gradient(to right,var(--accent),var(--accent2));border-radius:2px"></div>
    </div>
    <div style="font-size:10px;color:${pct === 100 ? '#4ade80' : 'var(--accent)'}">${pct}% · ${m.doneTasks}/${m.totalTasks}</div>
  </div>`;
}
