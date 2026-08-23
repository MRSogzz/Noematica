/* ============================================================
   panels/b/container.js — B（模組背包）的 Container 層
   ============================================================
   跟其他已遷移面板同一套分工：api() → restClient，手寫 spinner/錯誤
   字串 → <panel-shell>，其餘商業邏輯（pipeline 組裝、校驗、搜尋降級）
   逐行照搬。這是目前狀態最多的一個面板，doRenderMods()／
   renderModuleDetail() 保留成 Container 內部函式（不 export），因為
   兩者都要閉包存取 modules/pipeline/currentFilter/pipelineResult 這些
   可變狀態，硬拆成純函式只會變成要傳一堆參數，可讀性更差。

   ⚠️ window._bSel / _bRemove / _bValidate / _bFilter / _bClear 這幾個
   名字不能改：panel-components/slot-cell.js 的 SlotCell 元件、
   panels/b/view.js 產生的 onclick 字串（pipelineBarHtml、
   mismatchDetailConfig、moduleDetailConfig）全部寫死呼叫這些名字，
   跟 F4 遷移時 MilestoneCard 寫死 window._f4Show 是同一種限制。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountB(gridWrapEl) {
  let modules = [];
  let pipeline = [];
  let currentFilter = 'all';
  let pipelineResult = null;

  function mountShell() {
    gridWrapEl.innerHTML = '<panel-shell id="b-shell" state="loading"></panel-shell>';
    return $('b-shell');
  }

  function showReady(html) {
    const shell = $('b-shell') || mountShell();
    shell.setAttribute('state', 'ready');
    const content = document.createElement('div');
    content.slot = 'content';
    content.style.height = '100%';
    content.innerHTML = html;
    shell.innerHTML = '';
    shell.appendChild(content);
  }

  function showError(message) {
    const shell = $('b-shell') || mountShell();
    shell.setAttribute('state', 'error');
    shell.setAttribute('error-text', `無法連線後端：${message}（確認 npm run dev 已啟動，port 3001）`);
  }

  function doRenderMods(filter, result) {
    currentFilter = filter;
    const list = filter === 'all' ? modules : modules.filter(m => m.status === filter);

    renderToolbar(view.toolbarHtml(list.length, pipeline, result));
    showReady(view.moduleGridHtml(list, modules, pipeline, result));

    if (list.length) {
      const mismatch = view.mismatchDetailConfig(result, pipeline);
      if (mismatch) renderDetail(mismatch);
    }
  }

  function renderModuleDetail(m) {
    renderDetail(view.moduleDetailConfig(m, pipeline));
    const body = $('m-detail-body');
    if (body) body.innerHTML = view.schemaPreviewHtml(m);
  }

  window._bValidate = async () => {
    if (pipeline.length < 2) { toast('請先加入至少兩個模組'); return; }
    try {
      const ids = pipeline.map(m => m.id);
      const r = await restClient.post('/api/validate/pipeline', { moduleIds: ids });
      pipelineResult = r;
      doRenderMods(currentFilter, r);
      if (r.valid) toast('✓ Pipeline 型別全部相容！');
      else toast('✗ TypeMismatch：' + r.firstError?.message);
    } catch (e) {
      toast('校驗失敗：' + e.message);
    }
  };

  window._bSel = (id) => {
    const m = modules.find(x => x.id === id);
    if (!m) return;
    const inPipe = pipeline.indexOf(m);
    if (inPipe >= 0) { renderModuleDetail(m); return; }
    pipeline.push(m);
    pipelineResult = null;
    doRenderMods(currentFilter, null);
    renderModuleDetail(m);
  };

  window._bRemove = (id) => {
    pipeline = pipeline.filter(m => m.id !== id);
    pipelineResult = null;
    doRenderMods(currentFilter, null);
  };

  window._bFilter = async () => {
    const q = $('b-q')?.value?.trim() || '';
    if (!q) { doRenderMods(currentFilter, pipelineResult); return; }
    try {
      const d = await restClient.get('/api/modules/search?q=' + encodeURIComponent(q));
      const results = d.modules || [];
      const grid = $('b-grid');
      if (!grid) return;
      grid.querySelectorAll('.m-item').forEach((el, i) => {
        const m = (currentFilter === 'all' ? modules : modules.filter(x => x.status === currentFilter))[i];
        if (!m) return;
        el.style.display = results.find(r => r.id === m.id) ? '' : 'none';
      });
    } catch {
      // 降級為本地過濾（跟原版一致：後端搜尋失敗時退回前端自己比對名稱/標籤）
      const q2 = ($('b-q')?.value || '').toLowerCase();
      $('b-grid')?.querySelectorAll('.m-item').forEach((el, i) => {
        const list = currentFilter === 'all' ? modules : modules.filter(m => m.status === currentFilter);
        const m = list[i];
        if (!m) return;
        el.style.display = (m.name.toLowerCase().includes(q2)
          || (m.tags || []).some(t => t.toLowerCase().includes(q2))) ? '' : 'none';
      });
    }
  };

  window._bClear = () => { pipeline = []; pipelineResult = null; doRenderMods(currentFilter, null); };

  renderSidebar(view.SIDEBAR_CATEGORIES, 'all', (id) => { currentFilter = id; doRenderMods(id, pipelineResult); });

  mountShell();
  renderToolbar(view.loadingToolbarHtml());
  try {
    const d = await restClient.get('/api/modules');
    modules = d.modules || [];
    doRenderMods('all', null);
  } catch (e) {
    showError(e.message);
  }
}