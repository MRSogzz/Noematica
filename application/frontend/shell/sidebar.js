/* ============================================================
   shell/sidebar.js — WorkspaceShell 的 Sidebar 層
   ============================================================
   F1/F2/F4/F5/B/H 六個共用四層的面板，Sidebar 的「行為」完全一樣
   （分類清單 + 點擊切換），只有資料不同——這個函式就是那份共用行為，
   各面板的 Container 呼叫時只傳自己的 categories/activeId/onSelect。

   如果以後某個面板的 Sidebar 需要長成不一樣的東西（不是分類清單，
   例如搜尋框、樹狀結構），代表 Sidebar 這層要分化出第二種實作，
   不是繼續加參數把這個函式改得更複雜——先有具體案例再做，見架構
   討論裡「可替換指的是換皮膚還是換行為」那段。
   ============================================================ */

function renderSidebar(categories, activeId, onSelect) {
  // 存到 window 給 onclick="" 字串式事件呼叫（跟其他面板 onclick 呼叫
  // window._bSel(...) 這類既有慣例一致，見 panel-components/slot-cell.js
  // → ui/slot-cell.js）。
  window._catCb   = onSelect;
  window._catDefs = categories;

  function buildSb(curActive) {
    $('m-sidebar').innerHTML = categories.map(c => `
      <div class="m-cat ${c.id === curActive ? 'active' : ''}"
           data-catid="${c.id}"
           onclick="window._catCb('${c.id}'); _setSbActive('${c.id}')">
        <div class="m-cat-icon">${c.icon}</div>
        <div class="m-cat-lbl">${c.label}</div>
      </div>
      ${c.divider ? '<div class="m-cat-divider"></div>' : ''}
    `).join('');
  }

  window._setSbActive = (id) => {
    document.querySelectorAll('.m-cat').forEach(el =>
      el.classList.toggle('active', el.dataset.catid === id)
    );
  };

  buildSb(activeId);
}
