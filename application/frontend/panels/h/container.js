/* ============================================================
   panels/h/container.js — H（AI 知識整理助手）的 Container 層
   ============================================================
   跟其他已遷移面板同一套分工：api() → restClient，手寫 spinner/錯誤
   字串 → <panel-shell>，其餘商業邏輯（wiki/ 目錄樹、AI 對話、確認寫入）
   逐行照搬。

   ⚠️ window.mAiSend / mConfirmWrite / mCancelWrite / mWikiOpen /
   mWikiDelete / mClearHistory 這幾個名字保留原本的 m 前綴（不是打錯字）
   ——原始檔案開頭就註明「內部函式/全域變數保留 m 前綴，純粹是搬遷後的
   歷史命名，跟現在掛在哪個按鍵無關」，view.js 產生的 onclick 字串全部
   寫死呼叫這些名字，改了會連按鈕都壞掉。

   window._hSetActiveDomain 是新加的，因為原本 docsToolbarHtml() 的
   「＋ AI 整理」按鈕 onclick 字串裡有一段 `activeDomain='__ai__'`
   ——這是直接對閉包變數賦值，原版能這樣寫是因為 setToolbar() 那段
   template literal 跟 activeDomain 變數在同一個函式作用域；搬進
   view.js（純函式，沒有這個閉包）之後沒辦法再這樣賦值，所以額外
   掛一個 window 函式讓 Container 把這個賦值動作補回來。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

function injectStyleOnce() {
  if (document.getElementById(view.STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = view.STYLE_ID;
  s.textContent = view.STYLE_CSS;
  document.head.appendChild(s);
}

export async function mountH(gridWrapEl) {
  let wikiDocs = [];
  let wikiTree = [];
  let aiHistory = [];
  let pendingFiles = [];
  let activeDomain = '__all__';

  injectStyleOnce();

  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="h-shell" state="loading"></panel-shell>';
    return $('h-shell');
  }

  function showReady(html) {
    const shell = $('h-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
    return content;
  }

  async function loadWikiTree() {
    try {
      const data = await restClient.get('/api/wiki/tree');
      wikiTree = data.tree || [];
      wikiDocs = view.flattenTree(wikiTree);
    } catch { wikiTree = []; wikiDocs = []; }
  }

  function rebuildSidebar() {
    renderSidebar(view.sidebarItems(wikiTree), activeDomain, (id) => {
      activeDomain = id;
      if (id === '__ai__') showAIPanel();
      else showDocsPanel(id);
    });
  }

  function setToolbar(domId) {
    if (domId === '__ai__') {
      renderToolbar(view.aiToolbarHtml());
      window.mClearHistory = () => { aiHistory = []; pendingFiles = []; showAIPanel(); };
    } else {
      const cnt = domId === '__all__' ? wikiDocs.length
        : wikiDocs.filter(d => d.path.startsWith(domId + '/')).length;
      renderToolbar(view.docsToolbarHtml(cnt));
    }
  }

  window._hSetActiveDomain = (id) => { activeDomain = id; };

  function showDocsPanel(domId) {
    setToolbar(domId);
    const docs = domId === '__all__' ? wikiDocs : wikiDocs.filter(d => d.path.startsWith(domId + '/'));

    if (!docs.length) {
      showReady(view.emptyDocsHtml());
      $('m-detail-actions').style.display = 'none';
      return;
    }

    showReady(view.docsListHtml(docs));

    window.mWikiOpen = async (i) => {
      document.querySelectorAll('.wiki-doc-item').forEach((el, n) => el.classList.toggle('active', n === i));
      const doc = docs[i];
      renderDetail(view.docDetailConfig(doc));
      try {
        const d = await restClient.get('/api/wiki/file?path=' + encodeURIComponent(doc.path));
        $('m-detail-body').innerHTML = view.docPreviewHtml(d);
      } catch { /* 預覽失敗就不顯示片段，跟原版行為一致（靜默失敗） */ }
    };

    window.mWikiDelete = async (p) => {
      if (!confirm('確定刪除 wiki/' + p + ' ？')) return;
      try {
        await restClient.delete('/api/wiki/file?path=' + encodeURIComponent(p));
        toast('已刪除：' + p);
        await loadWikiTree();
        rebuildSidebar();
        showDocsPanel(activeDomain);
      } catch (e) { toast('刪除失敗：' + e.message); }
    };
  }

  function showAIPanel() {
    setToolbar('__ai__');
    const content = showReady(view.aiPanelHtml(aiHistory, pendingFiles));
    setTimeout(() => {
      const chat = content.querySelector('#wiki-chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
      content.querySelector('#wiki-ai-input')?.focus();
    }, 50);
    $('m-detail').style.display = 'none';
  }
  window.showAIPanel = showAIPanel; // docsToolbarHtml() 的「＋ AI 整理」按鈕字串裡有呼叫

  window.mAiSend = async () => {
    const inp = $('wiki-ai-input');
    const txt = inp?.value?.trim();
    if (!txt) return;
    inp.value = ''; inp.style.height = 'auto';

    const sendBtn = $('wiki-ai-send');
    if (sendBtn) sendBtn.disabled = true;

    aiHistory.push({ role: 'user', content: txt });
    showAIPanel();

    const chat = $('wiki-chat');
    if (chat) {
      chat.appendChild(view.loadingMessageNode());
      chat.scrollTop = chat.scrollHeight;
    }

    const aiConfig = (() => {
      try { return JSON.parse(localStorage.getItem('llm-wiki-config') || '{}'); } catch { return {}; }
    })();

    try {
      const res = await restClient.post('/api/wiki/generate', {
        instruction: txt,
        history: aiHistory.slice(0, -1).filter(h => !h._type).map(h => ({ role: h.role, content: h.content })),
        aiConfig,
      });

      if (res.type === 'files' && res.files?.length) {
        pendingFiles = res.files;
        aiHistory.push({ role: 'assistant', content: '', _type: 'pending', _files: res.files, _summary: res.summary });
      } else if (res.type === 'question') {
        aiHistory.push({ role: 'assistant', content: res.message, _isQ: true });
      } else {
        aiHistory.push({ role: 'assistant', content: res.message || '（無回應）' });
      }
    } catch (e) {
      aiHistory.push({ role: 'assistant', content: '⚠ 連線失敗：' + e.message });
    }

    if (sendBtn) sendBtn.disabled = false;
    showAIPanel();
  };

  window.mConfirmWrite = async () => {
    if (!pendingFiles.length) return;
    const files = [...pendingFiles];
    pendingFiles = [];

    let ok = 0, fail = 0;
    for (const f of files) {
      try {
        await restClient.post('/api/wiki/save', { path: f.path, content: f.content });
        ok++;
      } catch { fail++; }
    }

    const last = aiHistory.findLast(h => h._type === 'pending');
    if (last) { last._type = 'files'; }

    toast(`✓ 已寫入 ${ok} 個文件${fail ? `，${fail} 個失敗` : ''}`);
    await loadWikiTree();
    rebuildSidebar();
    showAIPanel();
  };

  window.mCancelWrite = () => {
    pendingFiles = [];
    const last = aiHistory.findLast(h => h._type === 'pending');
    if (last) aiHistory.splice(aiHistory.indexOf(last), 1);
    showAIPanel();
    toast('已取消');
  };

  // ── 初始化 ──
  $('m-detail').style.display = '';
  mountShell();
  await loadWikiTree();
  rebuildSidebar();

  if (wikiDocs.length === 0) {
    activeDomain = '__ai__';
    window._setSbActive?.('__ai__');
    showAIPanel();
  } else {
    showDocsPanel('__all__');
  }
}