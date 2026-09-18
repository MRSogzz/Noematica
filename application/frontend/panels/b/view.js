/* ============================================================
   panels/b/view.js — B（模組背包）的 View 層
   ============================================================
   跟其他已遷移面板同一套分工。GridLayout / SlotCell 是全域函式
   （classic script 載入），在這裡當一般識別字直接呼叫。

   ⚠️ 這裡刻意沒有搬 hud-panels.js 舊版 b() 裡的 compat(a,b) 函式——
   查過了，那個函式從頭到尾沒有被任何地方呼叫（只有宣告、沒有使用），
   註解寫「前端本地快速判斷，與後端邏輯一致」，但實際的型別相容判斷
   全部是靠 /api/validate/pipeline 後端回應，這個函式是死碼。不搬進新架構，
   不是遺漏。
   ============================================================ */

export const SIDEBAR_CATEGORIES = [
  { id: 'all',     icon: '🧪', label: '全部' },
  { id: 'DONE',    icon: '✅', label: 'DONE' },
  { id: 'WIP',     icon: '⚙️', label: 'WIP' },
  { id: 'BLOCKED', icon: '🚫', label: 'BLOCKED' },
];

export function loadingToolbarHtml() {
  return `<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入模組清單…</span>`;
}

/** Pipeline 狀態列：目前串好的模組鏈 + 校驗結果 + 校驗/清除按鈕 */
export function pipelineBarHtml(pipeline, result) {
  if (!pipeline.length) return '<span style="color:rgba(255,255,255,0.2);font-size:10px">點擊模組加入 Pipeline</span>';

  const steps = pipeline.map((m, i) => {
    const step = result?.steps?.[i - 1]; // step[i-1] = 第 i-1 → i 連接
    const color = i === 0 ? '#A97FE8'
      : step?.compatible === false ? '#f87171'
      : step?.compatible === true ? '#4ade80'
      : 'rgba(255,255,255,0.4)';
    const arrow = i === 0 ? ''
      : `<span style="color:${color};font-size:12px;margin:0 3px">→</span>`;
    return `${arrow}<span style="color:${color};font-size:10px;font-family:'JetBrains Mono',monospace
      ;padding:2px 6px;border-radius:3px;border:1px solid ${color}44">${m.name}</span>`;
  }).join('');

  const status = !result ? ''
    : result.valid
      ? `<span style="color:#4ade80;font-size:11px;font-weight:700;margin-left:10px">✓ Pipeline 相容</span>`
      : `<span style="color:#f87171;font-size:11px;font-weight:700;margin-left:10px">✗ TypeMismatch</span>`;

  return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
    ${steps}${status}
    <button class="m-action-btn secondary b-btn-validate"
      style="margin-left:8px;padding:3px 8px;font-size:9px;flex:none"
      title="校驗" onclick="window._bValidate()">校驗</button>
    <button class="m-action-btn secondary b-btn-clear"
      style="padding:3px 8px;font-size:9px;flex:none"
      title="清除" onclick="window._bClear()">清除</button>
  </div>`;
}

export function toolbarHtml(listLength, pipeline, result) {
  return `
    <input class="m-search" id="b-q" placeholder="搜尋名稱 / 標籤…"
           oninput="window._bFilter()" style="max-width:180px"/>
    <span style="font-size:10px;color:rgba(255,255,255,0.3)">${listLength} 個模組</span>
    <div style="margin-left:auto;flex:1;min-width:0">${pipelineBarHtml(pipeline, result)}</div>
  `;
}

/** result 有錯誤時，出錯的兩個模組要標紅、其餘已通過的節點標綠 */
/** 找出 pipeline 裡第一個 TypeMismatch 發生在哪個索引。
    ⚠️ 這裡刻意不用 result.steps.indexOf(result.firstError) —— 原本 hud-panels.js
    的舊版就是這樣寫，但這是一個真的會壞的 bug：result 是後端 API 回應
    JSON.parse() 出來的，firstError 跟 steps 陣列裡對應的項目是兩個不同的
    物件（JSON 反序列化不保留參照關係），indexOf 用參照比對永遠回傳 -1，
    導致 highlightMap 只會標到其中一個模組（甚至完全標錯），
    mismatchDetailConfig 直接回傳 null（因為 pipeline[-1] 是 undefined）。
    改成直接找「第一個 compatible === false 的 step」，語意跟原意完全
    一樣（firstError 本來就該是第一個不相容的 step），但不依賴參照相等，
    不管後端序列化過程有沒有保留物件參照都能正確運作。 */
function findErrorIndex(result) {
  return result.steps.findIndex(s => s.compatible === false);
}

export function buildHighlightMap(pipeline, result) {
  const highlightMap = {};
  if (result && !result.valid) {
    const errIdx = findErrorIndex(result);
    const mA = pipeline[errIdx], mB = pipeline[errIdx + 1];
    if (mA) highlightMap[mA.id] = 'error';
    if (mB) highlightMap[mB.id] = 'error';
    result.steps.forEach((s, i) => {
      if (s.compatible) {
        const pa = pipeline[i], pb = pipeline[i + 1];
        if (pa && !highlightMap[pa.id]) highlightMap[pa.id] = 'ok';
        if (pb && !highlightMap[pb.id]) highlightMap[pb.id] = 'ok';
      }
    });
  } else if (result?.valid) {
    pipeline.forEach(m => { highlightMap[m.id] = 'ok'; });
  }
  return highlightMap;
}

export function moduleGridHtml(list, modules, pipeline, result) {
  const highlightMap = buildHighlightMap(pipeline, result);
  return GridLayout.render({
    items: list,
    loading: !modules.length,
    renderItem: (m) => SlotCell(m, { pipeline, highlight: highlightMap[m.id] || null }),
    emptyIcon: '🔍',
    emptyText: '此分類無模組',
    gridId: 'b-grid',
  });
}

/** TypeMismatch 高亮詳情，result.valid 或沒有 result 時回傳 null（Container 決定要不要呼叫 renderDetail） */
export function mismatchDetailConfig(result, pipeline) {
  if (!result || result.valid) return null;
  const err = result.firstError;
  const errIdx = findErrorIndex(result);
  const mA = pipeline[errIdx], mB = pipeline[errIdx + 1];
  if (!mA || !mB) return null;

  return {
    icon: '⚠️', name: 'TypeMismatchException', tag: 'BLOCKED',
    attrs: [
      { icon: '📤', text: `${mA.name}() OUTPUT: ${err.outputType}` },
      { icon: '📥', text: `${mB.name}() INPUT:  ${err.inputType}` },
      { icon: '🔍', text: `原因：${err.reason || '頂層型別不符'}` },
      { icon: '🔧', text: `建議 Adapter：${err.adapterSuggestion || '—'}` },
    ],
    desc: err.message,
    actions: [
      { label: '移除 ' + mA.name, cls: 'secondary', onclick: `window._bRemove(${mA.id})` },
      { label: '移除 ' + mB.name, cls: 'secondary', onclick: `window._bRemove(${mB.id})` },
    ],
  };
}

export function moduleDetailConfig(m, pipeline) {
  const inPipe = pipeline.includes(m);
  return {
    icon: '🧩', name: m.name + '()', tag: m.status,
    attrs: [
      { icon: '📥', text: `INPUT：${m.input?.type || '?'}` },
      { icon: '📤', text: `OUTPUT：${m.output?.type || '?'}` },
      { icon: '⚡', text: `延遲：${m.latency || '—'}` },
      { icon: '🏷', text: (m.tags || []).join('、') || '無標籤' },
    ],
    desc: m.description || '',
    actions: [
      { label: inPipe ? '✓ 已在 Pipeline' : '＋ 加入 Pipeline',
        cls: inPipe ? 'secondary' : 'primary',
        onclick: `window._bSel(${m.id})` },
      ...(inPipe ? [{ label: '移除', cls: 'secondary', onclick: `window._bRemove(${m.id})` }] : []),
    ],
  };
}

/** 完整 I/O Schema 預覽——Container 呼叫 renderDetail() 之後，再把這段
    append 進 detail body（不是取代，這是既有行為）。*/
export function schemaPreviewHtml(m) {
  const inputSchema = m.input ? JSON.stringify(m.input, null, 2) : '—';
  const outputSchema = m.output ? JSON.stringify(m.output, null, 2) : '—';
  const ti = SlotCell.TYPE_COLORS[(m.input?.type || '').toUpperCase()] || '#aaa';
  const to = SlotCell.TYPE_COLORS[(m.output?.type || '').toUpperCase()] || '#aaa';

  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      <div>
        <div style="font-size:9px;font-weight:700;color:${ti};letter-spacing:.1em;
                    margin-bottom:4px;font-family:'JetBrains Mono',monospace">INPUT SCHEMA</div>
        <pre style="background:rgba(0,0,0,0.3);border:1px solid ${ti}33;border-radius:5px;
                    padding:8px;font-size:10px;color:var(--text)cc;line-height:1.6;
                    white-space:pre-wrap;word-break:break-all;margin:0">${inputSchema.replace(/</g, '&lt;')}</pre>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:${to};letter-spacing:.1em;
                    margin-bottom:4px;font-family:'JetBrains Mono',monospace">OUTPUT SCHEMA</div>
        <pre style="background:rgba(0,0,0,0.3);border:1px solid ${to}33;border-radius:5px;
                    padding:8px;font-size:10px;color:var(--text)cc;line-height:1.6;
                    white-space:pre-wrap;word-break:break-all;margin:0">${outputSchema.replace(/</g, '&lt;')}</pre>
      </div>
    </div>`;
}
