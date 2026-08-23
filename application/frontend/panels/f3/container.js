/* ============================================================
   panels/f3/container.js — F3（測試套件監控）的 Container 層
   ============================================================
   跟其他已遷移面板同一套分工：裸 fetch() → restClient，其餘商業邏輯
   （分頁切換、詳情載入、執行測試）逐行照搬。

   ⚠️ 這裡有一個實質差異，不只是「換個寫法」：原版用寫死的
   `const API = 'http://localhost:3001'` + 裸 fetch()，完全沒有 token
   處理——F3 的 /api/tests/run（會實際觸發跑測試，是有副作用的 mutation）
   之前是唯一一個沒有經過 x-hud-token 驗證流程的端點，跟 F1 存筆記、
   B 校驗 pipeline 這些其他 mutation 端點不一致。改用 restClient 之後，
   POST 會自動帶上 token（跟其他面板統一），如果後端有設定
   HUD_TOKEN，這裡會第一次真的被要求輸入 token 才能執行測試——這是
   刻意修正的安全一致性問題，不是這次遷移的副作用。

   window.setTab / openDetail / closeDetail / setDTab / runAll / runOne /
   runSuite / copySuite 這幾個名字不能改：panel-tests.html 的靜態 HTML
   （header 按鈕、tab、detail 面板）跟 view.js 產生的卡片 onclick 字串
   都寫死呼叫這些名字。
   ============================================================ */
import { restClient } from '../../api/rest-client.js';
import * as view from './view.js';

export async function mountF3(root = document) {
  // root 可能是 document（panel-tests.html 獨立開啟時）或 ShadowRoot
  // （掛進 <f3-workspace> Web Component 時，見 components/f3-workspace.js）。
  // ShadowRoot 沒有 getElementById()，只有 querySelector()，兩種 root
  // 統一用 querySelector('#'+id) 存取，不用另外判斷是哪一種。
  const $ = id => root.querySelector('#' + id);

  let allSuites = [];
  let currentTab = 'all';
  let currentSuite = null;

  function updateHeader() {
    const { pass, fail, pend } = view.headerCounts(allSuites);
    $('h-pass').textContent = pass;
    $('h-fail').textContent = fail;
    $('h-pend').textContent = pend;
    $('h-sub').textContent = view.headerSubText(allSuites);
  }

  function updateTabCounts() {
    const c = view.tabCounts(allSuites);
    $('tc-all').textContent = c.all;
    $('tc-unit').textContent = c.unit;
    $('tc-int').textContent = c.int;
    $('tc-e2e').textContent = c.e2e;
  }

  function renderGridPanel() {
    const list = currentTab === 'all' ? allSuites : allSuites.filter(s => s.type === currentTab);
    $('grid-panel').innerHTML = view.gridHtml(list);
  }

  async function load() {
    try {
      const d = await restClient.get('/api/tests');
      allSuites = d.suites || [];
      updateHeader();
      updateTabCounts();
      renderGridPanel();
    } catch {
      $('grid-panel').innerHTML = view.connectionErrorHtml();
      $('h-sub').textContent = '後端未連線';
    }
  }

  window.setTab = (tab) => {
    currentTab = tab;
    root.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    $('tab-' + (tab === 'integration' ? 'int' : tab === 'all' ? 'all' : tab)).classList.add('active');
    renderGridPanel();
  };

  function setDTabActive(tab) {
    root.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
    $('dtab-' + tab).classList.add('active');
  }

  function renderDTab(tab) {
    if (!currentSuite) return;
    const body = $('detail-body');
    if (tab === 'info')   body.innerHTML = view.infoTabHtml(currentSuite);
    if (tab === 'cases')  body.innerHTML = view.casesTabHtml(currentSuite);
    if (tab === 'errors') body.innerHTML = view.errorsTabHtml(currentSuite);
  }

  window.setDTab = (tab) => { setDTabActive(tab); renderDTab(tab); };

  window.openDetail = async (id) => {
    $('detail-panel').classList.add('open');
    $('detail-body').innerHTML = '<div class="loading"><div class="spin"></div>載入詳情…</div>';
    $('d-id').textContent = '';
    $('d-name').textContent = '';
    $('d-monster-svg').innerHTML = '';
    setDTabActive('info');

    try {
      const suite = await restClient.get(`/api/tests/${id}`);
      currentSuite = suite;
      $('d-id').textContent = suite.file;
      $('d-name').textContent = `「${suite.name}」`;
      $('d-monster-svg').innerHTML = view.suiteBadgeSvg(suite, 90);
      renderDTab('info');
    } catch (e) {
      $('detail-body').innerHTML = `<div class="empty-msg">載入失敗：${e.message}</div>`;
    }
  };

  window.closeDetail = () => {
    $('detail-panel').classList.remove('open');
    currentSuite = null;
  };

  window.runAll = async () => {
    try {
      await restClient.post('/api/tests/run', {});
      alert('✓ 全部測試已排入佇列\n請至終端機查看執行結果');
    } catch { alert('無法連線後端 API'); }
  };

  window.runOne = async (id) => {
    try {
      await restClient.post('/api/tests/run', { id });
      alert(`✓ 「${id}」已排入執行佇列`);
    } catch { alert('無法連線後端 API'); }
  };

  window.runSuite = () => { if (currentSuite) window.runOne(currentSuite.id); };

  window.copySuite = () => {
    if (!currentSuite) return;
    navigator.clipboard.writeText(currentSuite.file).then(() => alert('已複製路徑：' + currentSuite.file));
  };

  await load();
}