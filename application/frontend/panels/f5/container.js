/* ============================================================
   panels/f5/container.js — F5（知識圖鑑）的 Container 層
   ============================================================
   跟其他已遷移面板同一套分工：api() → restClient，手寫 spinner/錯誤
   字串 → <panel-shell>，其餘商業邏輯逐行照搬。

   跟舊版一個實質差異：window.f5Open 原本在「全部文件」跟「搜尋結果」
   兩個分支裡各自重新賦值一次（閉包各自抓自己的 docs/results 陣列），
   這裡改成單一定義、讀 Container 的共用狀態（currentDocs +
   currentVariant）——行為完全一樣，只是不用每次切分類就重新定義一次
   window 函式。原本第二個參數 `_src`（`f5Open(${i},'all')` 那個 'all'）
   在舊版裡從頭到尾沒被用到（函式簽名是 `async (i, _src) => {...}`），
   這裡直接拿掉，不是遺漏。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountF5(gridWrapEl) {
  let currentDocs = [];
  let currentVariant = 'all'; // 'all' | 'result'

  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="f5-shell" state="loading"></panel-shell>';
    return $('f5-shell');
  }

  function showReady(html) {
    const shell = $('f5-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
  }

  function showError(message) {
    const shell = $('f5-shell') || mountShell();
    shell.setAttribute('state', 'error');
    shell.setAttribute('error-text', `無法連線後端：${message}（確認 npm run dev 已啟動，port 3001）`);
  }

  function showPrompt() {
    gridWrapEl.innerHTML = '';
    gridWrapEl.innerHTML = view.promptHtml();
  }

  window.f5Open = async (i) => {
    const d = currentDocs[i];
    if (!d) return;
    renderDetail(view.docDetailConfig(d, currentVariant));
    try {
      const doc = await restClient.get('/api/docs/file?path=' + encodeURIComponent(d.path));
      $('m-detail-body').innerHTML += view.previewHtml(doc.content);
    } catch { /* 預覽失敗就不顯示片段，跟原版行為一致（靜默失敗） */ }
  };

  window._f5SelectCat = (id) => {
    if (id === 'all') {
      currentVariant = 'all';
      $('f5-q').value = '';
      $('f5-cnt').textContent = '';
      mountShell();
      restClient.get('/api/docs/tree').then(data => {
        currentDocs = view.flattenTree(data.tree || []);
        $('f5-cnt').textContent = currentDocs.length + ' 筆';
        showReady(view.allDocsListHtml(currentDocs));
      }).catch(e => showError(e.message));
    } else {
      showPrompt();
      setTimeout(() => $('f5-q')?.focus(), 50);
    }
  };

  window.f5Do = async () => {
    const q = $('f5-q')?.value?.trim();
    if (!q) { showPrompt(); return; }
    mountShell();
    try {
      const d = await restClient.get('/api/docs/search?q=' + encodeURIComponent(q));
      $('f5-cnt').textContent = d.count + ' 筆';
      currentVariant = 'result';
      currentDocs = d.results || [];
      showReady(view.searchResultsListHtml(currentDocs));
    } catch (e) {
      showError(e.message);
    }
  };

  renderSidebar(view.SIDEBAR_CATEGORIES, 'search', (id) => window._f5SelectCat(id));
  renderToolbar(view.toolbarHtml());
  showPrompt();
}