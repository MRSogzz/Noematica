/* ============================================================
   LLM WIKI — HUD Core
   API helper / Modal controller / 三欄 render helpers
   ============================================================ */

// ── HUD Token ─────────────────────────────────────────────────────────────────
// getHudToken()/setHudToken() 保留在這裡（不是死碼）：hud-settings.js 的
// 設定面板還在直接呼叫這兩個函式讀寫 token 輸入框。實際發 API 請求的
// token 處理邏輯已經統一到 api/rest-client.js（包含它自己的
// getHudToken/setHudToken/promptToken 實作，故意沒有互相 import，見該檔案
// 開頭註解），這裡只是「設定畫面要顯示/寫入 token」這個單純的 UI 需求，
// 兩份小函式重複比硬要跨 classic script／ES module 邊界共用更簡單可靠。
//
// 原本這裡還有 api()/getAPIBase()/promptToken()/MUTATION_METHODS——那是
// 舊版「所有面板共用同一個全域 api() 函式打 API」的做法，8 個面板全部
// 遷移成 Container/View 架構、改用 api/rest-client.js 的 restClient 之後，
// 已經沒有任何地方呼叫這個 api()（唯一剩下的呼叫者 hud-utils.js 的
// loadQuests() 也已經改用不需要 token 的原生 fetch()），所以整段刪掉了。

const TOKEN_KEY = 'llm-wiki-hud-token';

function getHudToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setHudToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

// ── Modal 三欄控制器 ──────────────────────────────────────────────────────────

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

const $ = id => document.getElementById(id);

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
  // 這幾個 class 只負責標記「這是哪個面板、走 Grid 還是 List」，不代表
  // 皮膚外觀就會生效——外觀是否套用完全由 <html> 上有沒有
  // .nw-skins-enabled 這個 class 決定（見 panel-skins.css 的
  // `html.nw-skins-enabled .modal.nw-frame` 系列規則），而
  // .nw-skins-enabled 只有在目前套用的 theme.json 明確定義了
  // panelSkins.enabled === true 時才會被 hud-utils.js 的 applyTheme()
  // 加上去（見該檔案）。沒有套用這種主題（例如目前預設的 default 主題）
  // 就完全不會有 .nw-skins-enabled，B/H/F1/F2/F3/F4/F5 開啟時會跟 M 一樣是
  // 純粹的深色科技風，不是「圖片有沒有載入完成」在決定要不要換色，是
  // 「有沒有套用定義了這個功能的風格」在決定——這是跟第四版
  // （image-preload + skin-ready）的差異，那一版因為角落圖示是固定
  // bundled 在 repo 裡、幾乎瞬間就載入完成，實際上等於「不管有沒有套用
  // 風格都強制換色」，不符合「風格沒套用就該是原本樣子」的需求，這版
  // 改成真正掛勾到主題系統。
  const modalEl = $('modal');
  modalEl.classList.remove('modal-skin-b', 'modal-skin-h', 'modal-skin-f1', 'modal-skin-f2', 'modal-skin-f3', 'modal-skin-f4', 'modal-skin-f5', 'nw-frame', 'nw-list');
  const isSkinned = ['b', 'h', 'f1', 'f2', 'f3', 'f4', 'f5'].includes(id);
  if (isSkinned) {
    modalEl.classList.add('modal-skin-' + id, 'nw-frame');
    // F1/F2/F5 是條列式清單（筆記/commit 紀錄/文件搜尋結果），不是挑
    // 格子的情境，額外掛 .nw-list 啟用單欄橫列清單樣式（同樣只有
    // .nw-skins-enabled 時才生效）；B/F4 是方格清單（道具／里程碑卡），
    // F3 是整個 iframe 塞滿內容區（見下面 fullwidth 判斷），三者都不掛
    // 這個 class。
    if (id === 'f1' || id === 'f2' || id === 'f5') modalEl.classList.add('nw-list');
  }

  // 重置詳情欄
  $('m-detail-icon').textContent = '📦';
  $('m-detail-name').textContent = '選擇一個項目';
  $('m-detail-tag').textContent  = '—';
  $('m-detail-body').innerHTML   = '<div class="m-empty" style="height:auto;padding:24px 0"><div style="font-size:12px;color:rgba(255,255,255,0.2)">點擊中間項目<br>查看詳細資訊</div></div>';
  $('m-detail-actions').style.display = 'none';

  const body = $('modal-body');

  // FULLWIDTH_PANELS：內容區自己管版面（不用共用三欄 sidebar/toolbar/detail）
  // 的面板。M 目前仍是真正的 iframe 注入（Three.js/canvas 為主、版面
  // 跟其他面板差異太大，不勉強塞進共用 Shell）；F3 已經改成跟其他 6 個
  // 面板一樣走 registry 的 mount()，只是它的內容（<f3-workspace> Web
  // Component，見 components/f3-workspace.js）自己用 Shadow DOM 管版面跟
  // 樣式隔離，共用的只有最外層的 modal-title/關閉鈕。
  const FULLWIDTH_PANELS = ['f3', 'm'];
  body.classList.toggle('fullwidth', FULLWIDTH_PANELS.includes(id));

  if (id === 'm') {
    // M 是唯一還走 iframe 注入的面板。
    $('m-grid-wrap').innerHTML = `<iframe src="panel-m-orbit.html" style="width:100%;height:100%;border:none;display:block;" title="M 認知地圖"></iframe>`;
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

  // 新的 Panel Registry（registry/panel-registry.js）優先——F1/F2/F3/F4/F5/
  // B/H 都已經遷移過去，M 是唯一還沒登記的（因為它走上面的 iframe 分支，
  // 不需要 mount()）。
  import('./registry/panel-registry.js').then(({ hasContainer, PANEL_REGISTRY }) => {
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

// ── 三欄 helper ───────────────────────────────────────────────────────────────

function renderSidebar(categories, activeId, onSelect) {
  // 儲存到 window 避免閉包序列化失效
  window._catCb   = onSelect;
  window._catDefs = categories;

  function buildSb(curActive) {
    $('m-sidebar').innerHTML = categories.map(c => `
      <div class="m-cat ${c.id === curActive ? 'active' : ''}"
           data-catid="${c.id}"
           onclick="window._catCb('${c.id}'); _setSbActive('${c.id}')">
        <div class="m-cat-icon">${c.icon}</div>
        <div class="m-cat-lbl">${c.label}</div>
      </div>
      ${c.divider ? '<div class="m-cat-divider"></div>' : ''}
    `).join('');
  }

  window._setSbActive = (id) => {
    document.querySelectorAll('.m-cat').forEach(el =>
      el.classList.toggle('active', el.dataset.catid === id)
    );
  };

  buildSb(activeId);
}

function renderToolbar(html) { $('m-toolbar').innerHTML = html; }
function renderGrid(html)    { $('m-grid-wrap').innerHTML = html; }

function renderDetail({ icon, name, tag, attrs, desc, actions }) {
  $('m-detail-icon').textContent = icon || '📦';
  $('m-detail-name').textContent = name || '—';
  $('m-detail-tag').textContent  = tag  || '—';
  $('m-detail-body').innerHTML = `
    ${attrs ? attrs.map(a => `
      <div class="m-attr">
        <span class="m-attr-icon">${a.icon}</span>
        <span class="m-attr-text">${a.text}</span>
      </div>`).join('') : ''}
    ${desc ? `<div class="m-detail-desc">${desc}</div>` : ''}
  `;
  if (actions && actions.length) {
    $('m-detail-actions').style.display = 'flex';
    $('m-detail-actions').innerHTML = actions.map(a =>
      `<button class="m-action-btn ${a.cls||'secondary'}" onclick="${a.onclick}">${a.label}</button>`
    ).join('');
  } else {
    $('m-detail-actions').style.display = 'none';
  }
}

// errGrid() 原本是舊版 catch(e){ errGrid(e); } 模式在用，8 個面板全部
// 遷移成 Container/View 架構、改用 <panel-shell state="error"> 之後，
// 已經沒有任何呼叫者，刪掉了。

// ── PANELS ────────────────────────────────────────────────────────────────────