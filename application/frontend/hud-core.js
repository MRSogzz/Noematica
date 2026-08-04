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

// 皮膚圖片素材（角落徽章／關閉鈕）預先載入用的路徑表，跟
// panel-skins.css 裡 --nw-badge-url/--nw-close-url 用的是同一組檔案。
const SKIN_CORNER_ASSETS = {
  b:  ['assets/panel-art/b_badge.png', 'assets/panel-art/b_close.png'],
  h:  ['assets/panel-art/h_badge.png', 'assets/panel-art/h_close.png'],
  f1: ['assets/panel-art/n_badge.png', 'assets/panel-art/n_close.png'],
  f2: ['assets/panel-art/l_badge.png', 'assets/panel-art/l_close.png'],
};

// 預先載入一批圖片，全部處理完（不管成功失敗）才 resolve——失敗也要
// resolve，不能讓一張圖載入失敗就讓皮膚永遠卡在「還沒 ready」的狀態。
function preloadImages(urls) {
  return Promise.all(urls.map(url => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  })));
}

function openModal(id) {
  document.querySelectorAll('.hk').forEach(b => b.classList.remove('active'));
  $('hkb-' + id)?.classList.add('active');
  $('modal-title').textContent = PANEL_TITLES[id] || id;

  // 面板美術皮膚：目前只有 b/h/f1/f2 有對應的參考圖（見 panel-skins.css），
  // 其他面板還沒拿到美術之前維持預設的扁平深色殼，先把上一個面板可能
  // 留下的皮膚 class 清乾淨，再依 id 決定要不要掛新的。nw-frame 是四個
  // 皮膚共用的元件 class（見 NWL.md），跟 modal-skin-<id> 一起切換，
  // 兩者都只在 b/h/f1/f2 時掛上，確保 F3/F4 等其他面板的底色/版面/
  // 尺寸完全不受這套皮膚影響——三者用的是 hud.css 同一份 .modal 基礎
  // 樣式（92vw/90vh、深色科技風），這份檔案自始至終都沒有覆寫過尺寸。
  //
  // 圖片不能影響設計：掛上 modal-skin-<id>/nw-frame 的當下，面板長得
  // 跟 F3/F4 完全一樣（deep-tech 深色殼），只有等角落圖示（徽章／
  // 關閉鈕）確認預載完成後，才會多掛一個 .skin-ready，這時候
  // panel-skins.css 裡幾乎所有跟顏色/圖片有關的規則才會生效。這樣
  // 不管圖片載入快慢、成功失敗，介面在任何時間點都是一個「完整的
  // 樣子」，不會有版面跑掉或顏色跟圖片各自到位時間不一致的中間態。
  const modalEl = $('modal');
  modalEl.classList.remove('modal-skin-b', 'modal-skin-h', 'modal-skin-f1', 'modal-skin-f2', 'nw-frame', 'nw-list', 'skin-ready');
  const isSkinned = ['b', 'h', 'f1', 'f2'].includes(id);
  if (isSkinned) {
    modalEl.classList.add('modal-skin-' + id, 'nw-frame');
    // F1/F2 是條列式清單（筆記/commit 紀錄），不是挑格子的情境，額外
    // 掛 .nw-list 啟用單欄橫列清單樣式（同樣要等 .skin-ready 才生效，
    // 載入完成前跟 F3/F4 一樣是預設方格）；B 是背包道具，維持方格清單，
    // 不掛這個 class。
    if (id === 'f1' || id === 'f2') modalEl.classList.add('nw-list');
    preloadImages(SKIN_CORNER_ASSETS[id]).then(() => {
      // 使用者可能在圖片載入完成前已經切到別的面板，這裡再檢查一次
      // 目前開著的還是不是同一個面板，避免圖片載入完成時錯誤地把
      // .skin-ready 加到已經換成別的面板的 .modal 上。
      if ($('modal').classList.contains('modal-skin-' + id)) {
        modalEl.classList.add('skin-ready');
      }
    });
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