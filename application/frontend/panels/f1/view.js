/* ============================================================
   panels/f1/view.js — F1（個人日誌）的 View 層
   ============================================================
   純函式：吃資料、吐 HTML 字串或 DOM 節點，不呼叫 API、不管理狀態、
   不知道 Container 怎麼抓資料的。跟 container.js 的分工：
     Container   抓資料、管狀態（notes/currentFile）、呼叫 restClient
     View        本檔案，只管「畫面長什麼樣子」

   注意：GridLayout / NoteCard 是全域函式（來自 layouts/grid-layout.js、
   panel-components/note-card.js，classic <script> 載入，不是 ES module），
   在這裡當一般全域識別字直接呼叫——跟 panel-m-orbit.html 的
   <script type="module"> 呼叫全域 PluginBadge() 是同一種、已經驗證過能
   正常運作的跨腳本呼叫方式，不是 import。
   ============================================================ */

export const SIDEBAR_CATEGORIES = [
  { id: 'all', icon: '📋', label: '所有筆記' },
  { id: 'new', icon: '✏️', label: '新增筆記' },
  { id: 'today', icon: '📅', label: '今日' },
];

export function toolbarHtml(defFile) {
  return `
    <input class="m-search" id="f1-fn" value="${defFile}" placeholder="筆記檔名 (note-YYYY-MM-DD.md)" style="max-width:280px"/>
    <button class="m-action-btn primary" style="flex:none;padding:7px 16px;font-size:11px" onclick="f1Save()">儲存 Ctrl+S</button>
    <button class="m-action-btn secondary" id="f1-del" onclick="f1Delete()" style="flex:none;padding:7px 14px;font-size:11px;display:none">🗑 刪除</button>
    <span style="font-size:10px;color:rgba(255,255,255,0.25);margin-left:6px" id="f1-saved"></span>
  `;
}

/** 筆記列表：重用 GridLayout + NoteCard，不重寫排列邏輯 */
export function noteGridHtml(notes, currentFile) {
  return GridLayout.render({
    items: notes,
    renderItem: (n) => NoteCard(n, { currentFile }),
    emptyIcon: '📝',
    emptyText: '尚無筆記',
    emptyHint: '點上方「儲存」建立第一篇',
  });
}

export function todayGridHtml(todayNotes) {
  return GridLayout.render({
    items: todayNotes,
    renderItem: (n) => NoteCard(n, { badge: 'time' }),
    emptyIcon: '📅',
    emptyText: '今日尚無筆記',
    emptyHint: '切換「新增筆記」建立',
  });
}

/** 編輯器 DOM 節點（用 DOM API 組裝，不是字串拼接，避免 textarea 內容跑 XSS） */
export function editorNode(content, onSave) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'height:100%;display:flex;flex-direction:column;padding:14px;gap:8px';
  const ta = document.createElement('textarea');
  ta.id = 'f1-editor';
  ta.style.cssText = 'flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:16px;font-family:"JetBrains Mono",monospace;font-size:13px;color:var(--text);resize:none;outline:none;line-height:1.8';
  ta.value = content;
  ta.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); onSave(); }
  });
  wrap.appendChild(ta);
  return wrap;
}

export function noteDetailConfig(fn, modified) {
  return {
    icon: '📄', name: fn.replace('.md', ''), tag: 'Markdown 筆記',
    attrs: [
      { icon: '📅', text: '修改：' + new Date(modified || Date.now()).toLocaleString('zh-TW') },
      { icon: '💾', text: 'Ctrl+S 快速儲存' },
    ],
    desc: '',
    actions: [{ label: '💾 儲存', cls: 'primary', onclick: 'f1Save()' }],
  };
}

export function todayDetailConfig(count) {
  return count
    ? { icon: '📅', name: '今日筆記', tag: count + ' 筆', attrs: [{ icon: '📊', text: `共 ${count} 篇` }], desc: '' }
    : { icon: '📅', name: '今日筆記', tag: '—', attrs: [{ icon: '📝', text: '今日尚無筆記' }], desc: '' };
}