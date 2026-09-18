/* ============================================================
   ListLayout — 單欄條列排列（四層架構的 Layout 層）
   ============================================================
   對應 panel-skins.css 裡 F2（協作大廳）/ F5（知識圖鑑）的做法：
   「一條一條」不是方格，容器本身不掛 .m-item-grid，直接是
   flex-column 排列，裡面的 .m-item 各自用 flex-row 呈現。

   ⚠️ 這個 DOM 結構是刻意跟 panel-skins.css 對齊的，不要改成
   .m-item-grid：panel-skins.css 裡 `.modal-skin-f2 .m-item` /
   `.modal-skin-f5 .m-item` 這兩組規則是直接蓋在 .m-item 上，
   假設它「不是」被包在 .m-item-grid 底下（見該檔案 F2/F5 區塊
   的註解）。如果哪天要讓 List 也走 .m-item-grid + .nw-list，
   要記得同步改 panel-skins.css 那幾條選擇器。

   用法：
     renderGrid(ListLayout.render({
       items: commits,
       renderItem: (c, i) => CommitRow(c, { onClick: `f2Show(${i})` }),
       loading: false,
       emptyIcon: '📭',
       emptyText: '尚無 Commit 記錄',
     }));
   ============================================================ */

const ListLayout = {
  render({
    items,
    renderItem,
    loading = false,
    emptyIcon = '📭',
    emptyText = '無資料',
    emptyHint = '',
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
    return `<div class="m-list" style="display:flex;flex-direction:column;gap:4px;padding:4px 0">
      ${items.map(renderItem).join('')}
    </div>`;
  },
};
