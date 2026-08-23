/* ============================================================
   panels/f2/container.js — F2（協作大廳）的 Container 層
   ============================================================
   跟 panels/f1/container.js 同一套分工。跟舊版 PANELS.f2()（已從
   hud-panels.js 刪除）的差異一樣只有兩處：api() → restClient，手寫
   spinner/錯誤字串 → <panel-shell>，其餘商業邏輯（分類切換、重新整理、
   commit 詳情）逐行照搬。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountF2(gridWrapEl) {
  let commits = [];

  renderSidebar(view.SIDEBAR_CATEGORIES, 'commits', (id) => window.f2SelectCat(id));
  renderToolbar(view.loadingToolbarHtml());

  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="f2-shell" state="loading"></panel-shell>';
    return $('f2-shell');
  }

  function showReady(html) {
    const shell = $('f2-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
  }

  function showError(message) {
    const shell = $('f2-shell') || mountShell();
    shell.setAttribute('state', 'error');
    shell.setAttribute('error-text', `無法連線後端：${message}（確認 npm run dev 已啟動，port 3001）`);
  }

  async function loadCommitsAndStatus() {
    mountShell();
    try {
      const [log, status] = await Promise.all([
        restClient.get('/api/git/commits?limit=50'),
        restClient.get('/api/git/status'),
      ]);
      commits = log.commits || [];

      const badge = $('f2-badge');
      if (badge && status.ahead > 0) { badge.textContent = status.ahead; badge.style.display = 'flex'; }

      renderToolbar(view.statusToolbarHtml(status));
      showReady(view.commitListHtml(commits));

      window.f2Show = (i) => renderDetail(view.commitDetailConfig(commits[i]));
      // 目前的分類是 commits（預設），status 分類要重打一次 /api/git/status，
      // 不重用這裡拿到的 status——跟舊版行為一致：切到「工作狀態」分類時
      // 永遠拿最新資料，不是沿用進面板當下那一刻的快照。
    } catch (e) {
      showError(e.message);
      renderToolbar('');
    }
  }

  async function showStatus() {
    mountShell();
    try {
      const status = await restClient.get('/api/git/status');
      showReady(view.statusGroupsHtml(status));
      renderDetail(view.statusDetailConfig(status));
    } catch (e) {
      showError(e.message);
    }
  }

  window.f2SelectCat = (id) => {
    if (id === 'status') showStatus();
    else loadCommitsAndStatus();
  };

  window.f2Refresh = () => loadCommitsAndStatus();

  await loadCommitsAndStatus();
}
