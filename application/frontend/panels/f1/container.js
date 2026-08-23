/* ============================================================
   panels/f1/container.js — F1（個人日誌）的 Container 層
   ============================================================
   對應重構文件的 Container：資料獲取、狀態管理，呼叫 restClient（api/
   rest-client.js），不直接操作 DOM 細節（那是 view.js 的事）。

   跟舊版 PANELS.f1()（還留在 hud-panels.js 裡，其他 7 個面板還在用）的
   差異只有兩個地方，其餘商業邏輯逐行照搬，行為不變：
     1. api('/api/notes') → restClient.get('/api/notes')　（可替換的 API 層）
     2. 手寫的 spinner/錯誤字串 → <panel-shell> 元件　（統一外殼）
   其他像「儲存後保留游標位置」「刪除後清空詳情欄」這些既有的 UX 細節
   都保留，不是重寫時順手簡化掉。

   mount(gridWrapEl) 由 registry/panel-registry.js 呼叫，gridWrapEl 目前
   固定是 $('m-grid-wrap')（跟舊架構共用同一個三欄版面容器，這次遷移不動
   版面本身，只動 F1 面板內部怎麼組織程式碼）。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountF1(gridWrapEl) {
  let notes = [];
  let currentFile = null;
  const today = new Date().toISOString().slice(0, 10);
  const defFile = `note-${today}.md`;

  renderSidebar(view.SIDEBAR_CATEGORIES, 'all', (id) => window.f1SelectCat(id));
  renderToolbar(view.toolbarHtml(defFile));

  // ── PanelShell：統一管「這次抓資料」的載入中／錯誤狀態 ──────────────
  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="f1-shell" state="loading"></panel-shell>';
    return $('f1-shell');
  }

  function showReady(html) {
    const shell = $('f1-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
  }

  function showError(message) {
    const shell = $('f1-shell') || mountShell();
    shell.setAttribute('state', 'error');
    shell.setAttribute('error-text', `無法連線後端：${message}（確認 npm run dev 已啟動，port 3001）`);
  }

  async function loadNotes(render = true) {
    mountShell();
    try {
      const d = await restClient.get('/api/notes');
      notes = d.notes || [];
      if (render) showReady(view.noteGridHtml(notes, currentFile));
    } catch (e) {
      showError(e.message);
    }
  }

  // ── 事件處理：沿用 window.f1* 的命名慣例（toolbar/note-card 的 onclick
  //    是字串拼接出來的，只能呼叫 window 上的函式，這是 innerHTML +
  //    onclick 這種寫法的既有限制，不是這次遷移引入的） ─────────────────

  window.f1Open = async (fn) => {
    currentFile = fn;
    $('f1-fn').value = fn;
    $('f1-del').style.display = '';
    try {
      const d = await restClient.get('/api/notes/' + fn);
      renderDetail(view.noteDetailConfig(fn, notes.find(n => n.filename === fn)?.modified));

      const grid = $('m-grid-wrap');
      grid.innerHTML = '';
      grid.appendChild(view.editorNode(d.content, () => window.f1Save()));
      $('f1-editor').focus();

      document.querySelectorAll('.m-item').forEach(el => {
        el.classList.toggle('active', el.onclick?.toString().includes(`'${fn}'`));
      });
    } catch (e) {
      toast('讀取失敗：' + e.message);
    }
  };

  window.f1Save = async () => {
    const fn = $('f1-fn')?.value?.trim() || defFile;
    const editor = $('f1-editor');
    const content = editor ? editor.value : '';
    if (!fn.endsWith('.md')) { toast('檔名必須以 .md 結尾'); return; }
    try {
      await restClient.post('/api/notes/' + fn, { content });
      currentFile = fn;
      $('f1-saved').textContent = '✓ ' + new Date().toLocaleTimeString('zh-TW');

      const cursorStart = editor?.selectionStart;
      const cursorEnd = editor?.selectionEnd;
      const d = await restClient.get('/api/notes');
      notes = d.notes || [];

      document.querySelectorAll('.m-item').forEach(el => {
        const itemFn = el.querySelector('.m-item-name')?.textContent + '.md';
        el.classList.toggle('active', itemFn === fn);
      });
      if (editor && cursorStart != null) {
        editor.selectionStart = cursorStart;
        editor.selectionEnd = cursorEnd;
      }
      const delBtn = $('f1-del');
      if (delBtn) delBtn.style.display = '';
      toast('筆記已儲存：' + fn);
    } catch (e) {
      toast('儲存失敗：' + e.message);
    }
  };

  window.f1Delete = async () => {
    if (!currentFile || !confirm('確定刪除 ' + currentFile + '?')) return;
    try {
      await restClient.delete('/api/notes/' + currentFile);
      currentFile = null;
      $('f1-del').style.display = 'none';
      renderDetail({ icon: '📄', name: '選擇一個項目', tag: '—', attrs: [], desc: '' });
      await loadNotes();
      toast('已刪除');
    } catch (e) {
      toast('刪除失敗');
    }
  };

  window.f1SelectCat = (id) => {
    if (id === 'new') {
      currentFile = null;
      $('f1-fn').value = defFile;
      $('f1-del').style.display = 'none';
      renderDetail({ icon: '✏️', name: '新增筆記', tag: defFile, attrs: [], desc: '' });
      // 編輯器是即時輸入用的 DOM 節點（含 keydown listener），跟列表類的
      // showReady(html字串) 不同路徑，直接掛節點，不走 innerHTML 字串化：
      const grid = $('m-grid-wrap');
      grid.innerHTML = '';
      grid.appendChild(view.editorNode('', () => window.f1Save()));
      $('f1-editor').focus();
      return;
    }
    if (id === 'today') {
      const todayNotes = notes.filter(n => n.filename.includes(today));
      showReady(view.todayGridHtml(todayNotes));
      renderDetail(view.todayDetailConfig(todayNotes.length));
      return;
    }
    showReady(view.noteGridHtml(notes, currentFile));
  };

  await loadNotes();
}