/* ============================================================
   shell/modal-shell.js — WorkspaceShell 的核心控制器
   ============================================================
   對應四層架構裡「這個面板要不要套共用的 Header/Sidebar/InfoPanel」
   的決策點。實際的四層各自怎麼畫，交給同資料夾底下的
   sidebar.js / toolbar.js / info-panel.js；Header 目前只有純文字標題
   + 關閉鈕，還沒有獨立檔案（見 panelSkins 的 header 欄位規劃，等
   Header 真的需要換皮膚的邏輯時再拆出來，不要為了「四層都要有檔案」
   而拆一個只有兩行的檔案）。

   Content 這層完全不在這裡管——F1/F2/F4/F5/B/H 都在
   registry/panel-registry.js 登記了 mount(gridWrapEl)，這裡只負責
   呼叫；F3 是例外（Shadow DOM 包整個內容，見 web-components/
   f3-workspace.js 開頭註解）；M 是唯一還走 iframe 注入的面板。

   $ 這個全域 helper（document.getElementById 的簡寫）放在這裡，因為
   這是最早載入、被最多地方依賴的檔案——sidebar.js/toolbar.js/
   info-panel.js 跟每個面板的 container.js（panels/f1/container.js 等）
   全部都在用，是 classic script 共享同一個全域作用域的既有慣例，不是
   這次新引入的模式。
   ============================================================ */

const $ = id => document.getElementById(id);

const PANEL_TITLES = {
  f1:'個人日誌', f2:'協作大廳', f3:'測試套件監控',
  f4:'目標專案時程', f5:'知識圖鑑', b:'模組背包 — I/O 週期表',
  h:'AI 知識整理', m:'認知地圖 — Activation Orbit'
};
// registry/panel-registry.js 是 ES module，讀不到 classic script 這裡用
// const 宣告的全域變數（const/let 不會變成 window 的屬性，只有 var／
// function 宣告會），所以額外掛一份到 window 上，單一事實來源仍然是
// 上面這個物件，這裡只是讓它「也」能被 module 讀到。
window.PANEL_TITLES = PANEL_TITLES;

function openModal(id) {
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
  $('hkb-' + id)?.classList.add('active');
  $('modal-title').textContent = PANEL_TITLES[id] || id;

  // 面板美術皮膚：見 panel-skins.css，先把上一個面板可能留下的皮膚
  // class 清乾淨，再依 id 決定要不要掛新的。nw-frame 是這幾個皮膚共用的
  // 元件 class（見 NWL.md），跟 modal-skin-<id> 一起切換，兩者都只在
  // b/h/f1/f2/f3/f4/f5 時掛上，確保 M 等其他面板的底色/版面/尺寸完全
  // 不受這套皮膚影響——這些面板用的是 hud.css 同一份 .modal 基礎樣式
  // （92vw/90vh、深色科技風），這份檔案自始至終都沒有覆寫過尺寸。
  //
  // M 面板另外走 .modal-skin-m（在 hud.css 裡定義），這是一個獨立的
  // 米白 paper 皮膚，跟上面的 nw-skins-enabled 系統無關——它無條件
  // 在 id === 'm' 時掛上，只覆寫 modal 外殼（.modal / .modal-header /
  // .modal-title / .modal-close）的顏色，不碰 modal-body 裡的 iframe。
  const modalEl = $('modal');
  modalEl.classList.remove(
    'modal-skin-b', 'modal-skin-h', 'modal-skin-f1', 'modal-skin-f2',
    'modal-skin-f3', 'modal-skin-f4', 'modal-skin-f5', 'modal-skin-m',
    'nw-frame', 'nw-list'
  );
  const isSkinned = ['b', 'h', 'f1', 'f2', 'f3', 'f4', 'f5'].includes(id);
  if (isSkinned) {
    modalEl.classList.add('modal-skin-' + id, 'nw-frame');
    if (id === 'f1' || id === 'f2' || id === 'f5') modalEl.classList.add('nw-list');
  } else if (id === 'm') {
    // M 面板：米白 paper 皮膚（見 hud.css 的 .modal.modal-skin-m 系列
    // 規則）。只掛皮膚 class，不掛 nw-frame（那是 panel-skins 的系統，
    // 跟這條自訂規則無關）。
    modalEl.classList.add('modal-skin-m');
  }

  // 重置 InfoPanel（見 shell/info-panel.js 的 renderDetail()）
  $('m-detail-icon').textContent = '📦';
  $('m-detail-name').textContent = '選擇一個項目';
  $('m-detail-tag').textContent  = '—';
  $('m-detail-body').innerHTML   = '<div class="m-empty" style="height:auto;padding:24px 0"><div style="font-size:12px;color:rgba(255,255,255,0.2)">點擊中間項目<br>查看詳細資訊</div></div>';
  $('m-detail-actions').style.display = 'none';

  const body = $('modal-body');

  // FULLWIDTH_PANELS：內容區自己管版面（不用共用三欄 sidebar/toolbar/
  // detail）的面板。M 目前仍是真正的 iframe 注入（Three.js/canvas 為主、
  // 版面跟其他面板差異太大，不勉強塞進共用 Shell）；F3 已經改成跟其他
  // 6 個面板一樣走 registry 的 mount()，只是它的內容（<f3-workspace>
  // Web Component，見 web-components/f3-workspace.js）自己用 Shadow DOM
  // 管版面跟樣式隔離，共用的只有最外層的 modal-title/關閉鈕。
  const FULLWIDTH_PANELS = ['f3', 'm'];
  body.classList.toggle('fullwidth', FULLWIDTH_PANELS.includes(id));

  if (id === 'm') {
    // M 是唯一還走 iframe 注入的面板。iframe 是獨立文件，讀不到主文件
    // window.currentThemeId，用 query string 帶過去，theme-boot.js 讀
    // location.search 決定要 fetch 哪個 theme.json——不再永遠寫死抓
    // default，跟主 HUD 目前實際套用的主題保持一致。
    const themeId = window.currentThemeId || 'default';
    $('m-grid-wrap').innerHTML = `<iframe src="panel-m-orbit.html?theme=${encodeURIComponent(themeId)}" style="width:100%;height:100%;border:none;display:block;" title="M 認知地圖"></iframe>`;
    $('m-sidebar').innerHTML   = '';
    $('m-toolbar').innerHTML   = '';
  } else if (id === 'f3') {
    // F3 不注入 iframe，內容交給下面的 registry mount()，這裡只需要清空
    // 共用三欄（<f3-workspace> 自己管版面，不需要 m-sidebar/m-toolbar）。
    $('m-sidebar').innerHTML = '';
    $('m-toolbar').innerHTML = '';
  }

  $('backdrop').classList.add('open');
  $('modal').classList.add('open');

  // Panel Registry（registry/panel-registry.js）優先——F1/F2/F3/F4/F5/B/H
  // 都已經遷移過去，M 是唯一還沒登記的（因為它走上面的 iframe 分支，
  // 不需要 mount()）。
  // ⚠️ 這裡是 '../registry/...' 不是 './registry/...'——這段程式碼現在
  // 放在 shell/modal-shell.js 裡，動態 import() 的相對路徑是相對於「這個
  // 檔案自己的位置」（shell/），不是相對於 frontend/ 根目錄。原本這段
  // 邏輯在 hud-core.js（根目錄）時 './registry/...' 是對的，搬進 shell/
  // 資料夾後如果沒有跟著改成 '../'，會變成去找不存在的
  // shell/registry/panel-registry.js，導致所有面板全部連不到內容。
  import('../registry/panel-registry.js').then(({ hasContainer, PANEL_REGISTRY }) => {
    if (id === 'm') return; // 已經用 iframe 注入了，不用再走 mount()/PANELS
    if (hasContainer(id)) {
      PANEL_REGISTRY[id].mount($('m-grid-wrap'));
    } else {
      PANELS[id]();
    }
  });
}

function closeModal() {
  $('backdrop').classList.remove('open');
  $('modal').classList.remove('open');
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
}