/* ============================================================
   panels/f4/container.js — F4（目標專案時程）的 Container 層
   ============================================================
   跟 panels/f1/、panels/f2/ 同一套分工。跟舊版 PANELS.f4()（已從
   hud-panels.js 刪除）的差異一樣只有兩處：api() → restClient，手寫
   spinner/錯誤字串 → <panel-shell>，其餘商業邏輯（分類篩選、預設選取
   第一筆）逐行照搬。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountF4(gridWrapEl) {
  let msData = [];

  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="f4-shell" state="loading"></panel-shell>';
    return $('f4-shell');
  }

  function showReady(html) {
    const shell = $('f4-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
  }

  function showError(message) {
    const shell = $('f4-shell') || mountShell();
    shell.setAttribute('state', 'error');
    shell.setAttribute('error-text', `無法連線後端：${message}（確認 npm run dev 已啟動，port 3001）`);
  }

  window._f4RenderMs = (filter) => showReady(view.milestoneGridHtml(msData, filter));
  window._f4Show = (i) => {
    const m = msData[i];
    if (m) renderDetail(view.milestoneDetailConfig(m));
  };

  renderSidebar(view.SIDEBAR_CATEGORIES, 'all', (id) => window._f4RenderMs(id));
  mountShell();
  renderToolbar(view.loadingToolbarHtml());

  try {
    const data = await restClient.get('/api/milestones');
    msData = data.milestones || [];
    renderToolbar(view.countToolbarHtml(msData.length));
    window._f4RenderMs('all');
    if (msData.length) window._f4Show(0);
  } catch (e) {
    showError(e.message);
  }
}