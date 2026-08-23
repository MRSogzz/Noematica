/* ============================================================
   panels/f5/view.js — F5（知識圖鑑）的 View 層
   ============================================================
   跟其他已遷移面板同一套分工。ListLayout / DocItem 是全域函式
   （classic script 載入），在這裡當一般識別字直接呼叫。
   ============================================================ */

export const SIDEBAR_CATEGORIES = [
  { id: 'search', icon: '🔍', label: '搜尋' },
  { id: 'all',    icon: '📚', label: '全部文件' },
];

export function toolbarHtml() {
  return `
    <input class="m-search" id="f5-q" placeholder="搜尋知識庫文件…" oninput="f5Do()" style="max-width:320px"/>
    <span style="font-size:10px;color:rgba(255,255,255,0.35)" id="f5-cnt"></span>
    <span style="font-size:10px;padding:3px 10px;border-radius:12px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:rgba(148,163,184,0.7);margin-left:auto;">🔒 唯讀 — 手動放置檔案至 docs/</span>
  `;
}

export function promptHtml() {
  return `<div class="m-empty"><div style="font-size:12px;color:rgba(255,255,255,0.2)">輸入關鍵字開始搜尋</div></div>`;
}

/** 把巢狀的文件樹（資料夾/檔案混雜）攤平成純檔案清單 */
export function flattenTree(nodes) {
  const out = [];
  (function walk(list) {
    (list || []).forEach(n => {
      if (n.type === 'file') out.push(n);
      else if (n.children) walk(n.children);
    });
  })(nodes);
  return out;
}

export function allDocsListHtml(docs) {
  return ListLayout.render({
    items: docs,
    renderItem: (d, i) => DocItem(d, { onClick: `f5Open(${i})`, variant: 'plain' }),
  });
}

export function searchResultsListHtml(results) {
  return ListLayout.render({
    items: results,
    emptyIcon: '🔍',
    emptyText: '找不到符合文件',
    renderItem: (r, i) => DocItem(r, { onClick: `f5Open(${i})`, variant: 'result' }),
  });
}

/** variant='all' 時 d 是文件樹節點（name/path），'result' 時 d 是搜尋結果（title/path/excerpt） */
export function docDetailConfig(d, variant) {
  if (variant === 'all') {
    return { icon: '📄', name: d.name.replace('.md', ''), tag: d.path.split('/').pop(), attrs: [{ icon: '📂', text: d.path }], desc: '' };
  }
  return { icon: '📄', name: d.title, tag: d.path.split('/').pop(), attrs: [{ icon: '📂', text: d.path }], desc: d.excerpt };
}

/** 內文預覽片段——Container 抓完全文後呼叫這個組 HTML，append 進
    detail body（不是取代，是接在 renderDetail() 產生的內容後面，這是
    既有行為，不是這次遷移引入的）。*/
export function previewHtml(content) {
  const escaped = (content || '').replace(/</g, '&lt;').slice(0, 600);
  return `<div style="margin-top:10px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;max-height:200px;overflow-y:auto"><pre style="font-size:10px;color:rgba(240,234,216,0.6);white-space:pre-wrap;word-break:break-all;line-height:1.55">${escaped}</pre></div>`;
}