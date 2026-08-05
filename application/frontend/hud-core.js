/* ============================================================
   LLM WIKI — HUD Core
   API helper / Modal controller / 三欄 render helpers
   ============================================================ */

const API = 'http://localhost:3001';
// api() 使用 window.API_OVERRIDE（來自設定）或預設值
function getAPIBase() { return window.API_OVERRIDE || API; }

// ── HUD Token ─────────────────────────────────────────────────────────────────
// 用於所有 mutation 請求（POST write / DELETE）的身份驗證 header。
// Token 由後端啟動時產生（或從 .env HUD_TOKEN 讀取），首次使用時貼入即可。

const TOKEN_KEY = 'llm-wiki-hud-token';

function getHudToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setHudToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

/** 顯示 token 輸入提示（用於 401 回應時）*/
function promptToken(retryFn) {
  const current = getHudToken();
  const input = prompt(
    '後端要求驗證 Token（x-hud-token）。\n' +
    '請查看後端啟動 terminal 取得 HUD_TOKEN，或在 .env 中設定後重啟。\n\n' +
    '目前 Token：' + (current ? current.slice(0,8) + '…' : '（未設定）'),
    current
  );
  if (input !== null) {
    setHudToken(input);
    if (typeof retryFn === 'function') retryFn();
  }
}

// 需要 token 的 method
const MUTATION_METHODS = new Set(['POST', 'DELETE', 'PATCH', 'PUT']);

// ── API helper ────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = { ...(opts.headers || {}) };

  // 寫入 / 刪除操作自動帶 token
  if (MUTATION_METHODS.has(method)) {
    const token = getHudToken();
    if (token) headers['x-hud-token'] = token;
  }

  try {
    const res  = await fetch(getAPIBase() + path, { ...opts, headers });
    const json = await res.json();
    if (res.status === 401) {
      // Token 錯誤 → 提示使用者輸入，不丟出原始錯誤以免誤導
      promptToken(() => api(path, opts));
      throw new Error('請輸入正確的 HUD Token 後重試');
    }
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
  } catch (e) {
    throw e;
  }
}

function spinner() {
  return '<div class="p-spinner"><div class="spin"></div>載入中…</div>';
}
function errMsg(e) {
  return `<div class="p-err">⚠ 無法連線後端：${e.message}<br>請確認 <code>npm run dev</code> 已啟動（port 3001）</div>`;
}

// ── Modal 三欄控制器 ──────────────────────────────────────────────────────────

const PANEL_TITLES = {
  f1:'個人日誌', f2:'協作大廳', f3:'測試套件監控',
  f4:'目標專案時程', f5:'知識圖鑑', b:'模組背包 — I/O 週期表',
  h:'AI 知識整理', m:'認知地圖 — Activation Orbit'
};

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
  if (id === 'f3') {
    body.classList.add('fullwidth');
    $('m-grid-wrap').innerHTML = `<iframe src="panel-tests.html" style="width:100%;height:100%;border:none;display:block;" title="F3 測試面板"></iframe>`;
    $('m-sidebar').innerHTML   = '';
    $('m-toolbar').innerHTML   = '';
  } else if (id === 'm') {
    body.classList.add('fullwidth');
    $('m-grid-wrap').innerHTML = `<iframe src="panel-m-orbit.html" style="width:100%;height:100%;border:none;display:block;" title="M 認知地圖"></iframe>`;
    $('m-sidebar').innerHTML   = '';
    $('m-toolbar').innerHTML   = '';
  } else {
    body.classList.remove('fullwidth');
  }

  $('backdrop').classList.add('open');
  $('modal').classList.add('open');
  PANELS[id]();
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

function errGrid(e) {
  renderGrid(`<div class="m-empty"><div class="m-empty-icon">⚠</div><div style="font-size:11px;text-align:center">無法連線後端<br><span style="opacity:.5">${e.message}</span><br><br><span style="opacity:.35;font-size:10px">npm run dev → port 3001</span></div></div>`);
}

// ── PANELS ────────────────────────────────────────────────────────────────────