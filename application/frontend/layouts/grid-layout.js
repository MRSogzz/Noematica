/* ============================================================
   GridLayout — 方格排列（四層架構的 Layout 層）
   ============================================================
   職責只有三件事，而且只做這三件：
     1. 載入中 / 空狀態 的統一畫面
     2. .m-item-grid 容器包裝（響應式斷點由 hud.css 的
        .m-item-grid 規則統一控制，這裡不重複寫任何 CSS）
     3. 把每一筆資料丟給呼叫端提供的 renderItem() 换成一張卡片

   Layout 層完全不知道卡片裡面長什麼樣（那是 Component 層的事），
   也不知道資料從哪來、點下去要做什麼（那是 Panel 層的事）。
   B 用 GridLayout 裝 SlotCell，F4 用 GridLayout 裝
   MilestoneCard，F1 用 GridLayout 裝 NoteCard —— 排列、空狀態、
   響應式斷點只有這一份，不會三邊各自寫一次、各自可能不一致。

   用法：
     renderGrid(GridLayout.render({
       items: modules,
       renderItem: (m) => SlotCell(m, { pipeline, highlight: highlightMap[m.id] }),
       loading: !modules.length,
       emptyIcon: '🔍',
       emptyText: '此分類無模組',
       gridId: 'b-grid',        // 選填，需要用 id 選取容器時才給
     }));
   ============================================================ */

const GridLayout = {
  render({
    items,
    renderItem,
    loading = false,
    emptyIcon = '📭',
    emptyText = '無資料',
    emptyHint = '',
    gridId = '',
  }) {
    if (loading) {
      return '<div class="m-empty"><div class="spin"></div></div>';
    }
    if (!items || !items.length) {
      return `<div class="m-empty">
        <div class="m-empty-icon">${emptyIcon}</div>
        <div>${emptyText}${emptyHint ? `<br><span style="opacity:.4;font-size:10px">${emptyHint}</span>` : ''}</div>
      </div>`;
    }
    return `<div class="m-item-grid"${gridId ? ` id="${gridId}"` : ''}>
      ${items.map(renderItem).join('')}
    </div>`;
  },
};
