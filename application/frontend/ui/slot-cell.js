/* ============================================================
   SlotCell — 背包 (B) 模組方格卡片（四層架構的 Component 層）
   ============================================================
   只負責「一格長什麼樣子」：不知道自己被排在 Grid 裡的第幾格、
   不知道 pipeline 資料存在哪、不呼叫 API。點擊時只發出
   window._bSel(id) 這個 Panel 層已經定義好的回呼。

   型別色碼 / 狀態色碼是這張卡片視覺呈現的一部分，所以歸在
   Component 層維護（掛在 SlotCell.TYPE_COLORS /
   SlotCell.STATUS_COLORS 上），Panel 層如果要在別處（例如詳情欄）
   顯示同樣的顏色，直接讀這兩個常數，不用重複定義一份。
   ============================================================ */

const SlotCell = Object.assign(
  function SlotCell(m, { pipeline = [], highlight = null } = {}) {
    const TC = SlotCell.TYPE_COLORS;
    const SC = SlotCell.STATUS_COLORS;
    const ti = TC[(m.input?.type || '').toUpperCase()] || '#aaa';
    const to = TC[(m.output?.type || '').toUpperCase()] || '#aaa';
    const sc = SC[m.status] || '#aaa';
    const idx = pipeline.indexOf(m);
    const inPipe = idx >= 0;

    let borderColor = 'rgba(255,255,255,0.08)';
    if (highlight === 'error') borderColor = '#f87171';
    else if (highlight === 'ok') borderColor = '#4ade80';
    else if (inPipe) borderColor = 'rgba(169,127,232,0.6)';

    const slotLabel = inPipe
      ? `<span style="position:absolute;top:4px;right:5px;font-size:8px;
          color:#A97FE8;font-family:'JetBrains Mono',monospace">#${idx + 1}</span>`
      : '';

    return `<div class="m-item ${inPipe ? 'active' : ''}"
        onclick="window._bSel(${m.id})"
        style="padding:8px 6px;gap:3px;position:relative;border-color:${borderColor};
               transition:border-color .15s">
      ${slotLabel}
      <div style="display:flex;justify-content:space-between;width:100%;
                  font-size:9px;font-family:'JetBrains Mono',monospace">
        <span style="color:${ti}">${m.input?.type || '?'}</span>
        <span style="color:${to}">${m.output?.type || '?'}</span>
      </div>
      <div class="m-item-name" style="font-size:11px;font-weight:700;color:var(--text);
           text-align:center;padding:2px 0">${m.name}</div>
      <div style="display:flex;justify-content:space-between;width:100%;font-size:9px">
        <span style="color:rgba(255,255,255,0.3)">#${String(m.id).padStart(2, '0')}</span>
        <span style="color:${sc}">${m.status === 'DONE' ? '✓ DONE' : m.status === 'BLOCKED' ? '✗ BLOCKED' : '… WIP'}</span>
      </div>
    </div>`;
  },
  {
    TYPE_COLORS: {
      STR: '#3A7FD5', INT: '#00C97A', FLOAT: '#F5A623', FLT: '#F5A623',
      BOOL: '#FF8C42', ARR: '#A97FE8', OBJ: '#FF4D6A', ANY: '#8A9DC0', NUM: '#4ECDC4',
    },
    STATUS_COLORS: { DONE: '#4ade80', WIP: '#A97FE8', BLOCKED: '#f87171' },
  }
);
