/* ============================================================
   LLM WIKI — HUD Utils
   Quest / 角色 / 圖片上傳 / Theme / Toast / 鍵盤快捷鍵 / Token / Init
   ============================================================ */

// ── HUD Token ─────────────────────────────────────────────────────────────────
// 從 hud-core.js 搬過來（那個檔案已經拆成 shell/modal-shell.js 等四個
// 檔案，這兩個函式是「設定畫面要顯示/寫入 token」的 UI 需求，跟四層
// 架構無關，放這裡比放在 shell/ 底下更符合定位）。hud-settings.js 的
// 設定面板直接呼叫這兩個函式讀寫 token 輸入框；實際發 API 請求的
// token 處理邏輯是另一份獨立實作，在 api/rest-client.js（故意沒有
// 互相 import，見該檔案開頭註解）。

const TOKEN_KEY = 'llm-wiki-hud-token';

function getHudToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setHudToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

async function loadQuests() {
  try {
    // 原本是 api('/api/milestones')，hud-core.js 那個舊版 api() 已經被
    // api/rest-client.js 取代並刪除（見該檔案的說明）。這裡是唯一一個
    // GET-only、不需要 token 的呼叫，改用原生 fetch() 最直接，不用為了
    // 一個讀取請求載入整套 restClient（module 動態 import 有非同步時機
    // 考量，這裡是頁面一開始就同步呼叫的，用原生 fetch 最單純可靠）。
    const base = window.API_OVERRIDE || 'http://localhost:3001';
    const res = await fetch(base + '/api/milestones');
    const data = await res.json();
    const ms   = (data.milestones || []).slice(0, 3);
    ms.forEach((m, i) => {
      const qi = document.getElementById('q' + i);
      if (!qi) return;
      qi.style.display = '';
      document.getElementById('qn' + i).textContent = m.title;
      document.getElementById('qs' + i).textContent = m.completion + '% · ' + m.doneTasks + '/' + m.totalTasks + ' 任務';
    });
  } catch {
    document.getElementById('qn0').textContent = '後端未連線';
    document.getElementById('qs0').textContent = 'npm run dev';
  }
}

function selQ(i) {
  for (let n = 0; n < 3; n++) {
    document.getElementById('q' + n).classList.toggle('active', n === i);
    document.getElementById('qg' + n).classList.toggle('lit', n === i);
  }
}

function selC(i) {
  document.querySelectorAll('.cc').forEach((c, n) => c.classList.toggle('active', n === i));
}

// ── Image upload helpers ──────────────────────────────────────────────────────

let objectUrls = [];
let keyOpen = false;

function mkUrl(f) { const u = URL.createObjectURL(f); objectUrls.push(u); return u; }
function loadImg(el, url) { el.src = url; el.classList.add('on'); }

function upBg(e) { const f = e.target.files[0]; if(!f) return; const bg = document.getElementById('hud-bg'); bg.style.backgroundImage=`url(${mkUrl(f)})`; bg.style.backgroundSize='cover'; toast('背景圖已載入：'+f.name); e.target.value=''; }
function upMm(e) { const f = e.target.files[0]; if(!f) return; const img=document.getElementById('mm-img'),svg=document.getElementById('mm-svg'); loadImg(img,mkUrl(f)); if(svg)svg.style.display='none'; toast('雷達圖已載入：'+f.name); e.target.value=''; }
function upKey(e,k) { const f=e.target.files[0]; if(!f) return; loadImg(document.getElementById('hki-'+k),mkUrl(f)); toast('鍵位圖示替換：'+k.toUpperCase()); e.target.value=''; }
function upAv(e,i) { const f=e.target.files[0]; if(!f) return; loadImg(document.getElementById('avi-'+i),mkUrl(f)); toast('頭像替換：'+i); e.target.value=''; }
function toggleKeys() { keyOpen=!keyOpen; document.getElementById('key-row').classList.toggle('open',keyOpen); }

function upTheme(e) {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => { try { applyTheme(JSON.parse(ev.target.result)); toast('主題已套用'); } catch { toast('theme.json 格式錯誤'); } };
  r.readAsText(f); e.target.value='';
}

function applyTheme(t) {
  const root = document.documentElement, c = t.colors||{};
  const map = {'--accent':c.accent,'--accent2':c.accent2,'--text':c.text,'--muted':c.muted,'--border':c.border,'--border2':c.border2,'--panel-bg':c.panelBg,'--key-bg':c.keyBg,'--quest-bg':c.questBg,'--overlay-color':c.overlayColor,'--bg-blur':c.bgBlur,'--hp-l':c.hpColor,'--hp-r':c.hpColor2};
  Object.entries(map).forEach(([k,v])=>{ if(v) root.style.setProperty(k,v); });
  const l = t.layout||{};
  if(l.keyBtnSize) root.style.setProperty('--key-size', l.keyBtnSize+'px');
  const a = t.assets||{};
  if(a.bg){document.getElementById('hud-bg').style.backgroundImage=`url(${a.bg})`;document.getElementById('hud-bg').style.backgroundSize='cover';}
  if(a.minimap){const img=document.getElementById('mm-img'),svg=document.getElementById('mm-svg');img.src=a.minimap;img.onload=()=>{img.classList.add('on');if(svg)svg.style.display='none';};}
  if(a.keys)Object.entries(a.keys).forEach(([k,s])=>{const img=document.getElementById('hki-'+k);if(img&&s){img.src=s;img.onload=()=>img.classList.add('on');}});
  if(a.avatars)Object.entries(a.avatars).forEach(([i,s])=>{const img=document.getElementById('avi-'+i);if(img&&s){img.src=s;img.onload=()=>img.classList.add('on');}});

  // iconStyle（選填）：'full' = 右上角 hotkey 圖示改成完整顯示、不裁成圓形
  // （見 hud.css 的 html.icon-style-full 那組規則）。跟 panelSkins.enabled
  // 同一套「有定義才套用」原則——沒有這個欄位（目前 gamification/cyber
  // 兩個內建主題都沒有）維持原本的圓形裁切外觀，不影響那些主題手繪/
  // 設計時就是照圓形構圖去畫的舊圖示。
  root.classList.toggle('icon-style-full', a.iconStyle === 'full');

  // panelSkins（選填）：B/H/F1/F2 這幾個面板的美術皮膚（見 panel-skins.css
  // / docs/design-system/NWL.md）。這是跟上面 accent/bg/keys/avatars 同一
  // 個 theme.json 底下的另一個選填區塊——沒有這個欄位（目前 default/
  // gamification/cyber 三個內建主題都沒有）就完全不啟用，B/H/F1/F2 維持
  // 跟 F3/F4 一樣的預設深色科技風；只有 theme.json 明確給了
  // panelSkins.enabled === true，這幾個面板才會換成皮膚配色跟角落圖示。
  // 不是「圖片有沒有載入完成」在決定要不要換，是「目前套用的風格有沒有
  // 定義這個功能」在決定，跟其他主題資源（key 圖示／頭像）的套用邏輯
  // 一致，不是另外發明一套獨立機制。
  const ps = t.panelSkins;
  root.classList.toggle('nw-skins-enabled', !!(ps && ps.enabled));
  if (ps && ps.enabled) {
    if (ps.trimTop)  root.style.setProperty('--nw-trim-top', ps.trimTop);
    if (ps.trimSide) root.style.setProperty('--nw-trim-side', ps.trimSide);
    if (ps.text)     root.style.setProperty('--nw-text', ps.text);
    Object.entries(ps.panels || {}).forEach(([id, p]) => {
      if (p.body)  root.style.setProperty(`--nw-body-${id}`, p.body);
      if (p.badge) root.style.setProperty(`--nw-badge-url-${id}`, `url(${p.badge})`);
      if (p.close) root.style.setProperty(`--nw-close-url-${id}`, `url(${p.close})`);
    });

    // shell（選填）：Panel Base / Header / Sidebar / Content Base / Info
    // Panel 這五個共用部件的九宮格／三宮格素材，見 panel-skins.css 的
    // .nw-panel-art 那組規則。跟上面的 panels[id] 徽章系統是「兩套獨立
    // 機制、同時存在」——panels[id] 是舊版「每個面板 id 各自一個顏色/
    // 徽章」，shell 是新版「Header/Sidebar/Info Panel 整個 WorkspaceShell
    // 共用一套圖片美術」，兩者都掛在同一個 html.nw-skins-enabled 底下，
    // 沒有互相取代的關係。
    //
    // 每個部件的圖檔數量不一樣（base/contentBase 是 9 張九宮格，
    // header 是 3 張橫向三宮格，sidebar/infoPanel 是 3 張縱向三宮格
    // + 幾張固定尺寸的裝飾元素），用 setSliceVars() 統一處理「把物件
    // 裡每一個 key 轉成 --nw-<prefix>-<key> 這個 CSS 變數，圖片路徑
    // 自動包成 url(...)」，不用每個部件各寫一次重複的 forEach。
    //
    // 數值欄位一律是百分比（key 結尾是 Pct，例如 topPct/leftPct/
    // heightPct），不是固定 px——這樣 responsive 縮放時（.modal 是
    // 92vw × 90vh，會隨螢幕變動）九宮格/三宮格的比例會跟著等比例變，
    // 不會因為螢幕大小不同而跑版或露餡。這些百分比不是憑感覺設的，
    // 是直接量測實際上傳的素材像素尺寸算出來的，見 theme.json 裡
    // shell.base/shell.header 的 _desc 說明。
    const setSliceVars = (prefix, obj) => {
      if (!obj) return;
      Object.entries(obj).forEach(([key, val]) => {
        if (key.startsWith('_') || val == null) return; // 跳過 _desc/_TODO 跟還沒量測出來的 null 欄位
        const cssKey = `--nw-${prefix}-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
        const cssVal = typeof val !== 'number' ? `url(${val})`
          : key.endsWith('Pct') ? `${val}%`
          : `${val}px`;
        root.style.setProperty(cssKey, cssVal);
      });
    };
    const shell = ps.shell || {};
    root.classList.toggle('nw-panel-art', !!ps.shell);
    setSliceVars('base',    shell.base);
    setSliceVars('header',  shell.header);
    setSliceVars('sidebar', shell.sidebar);
    setSliceVars('content', shell.contentBase);
    setSliceVars('info',    shell.infoPanel);
  }

  // fonts（選填）：跟 panelSkins 同一套「有定義才套用」邏輯。沒有這個欄位
  // （目前 default/gamification/cyber 都沒有）就完全不影響原本寫死在
  // hud.css 裡的 'Noto Serif SC' / 'JetBrains Mono'——那兩個字型名稱已經
  // 改成 var(--font-heading, 'Noto Serif SC') 這種「CSS 變數 + 原本的值當
  // fallback」的寫法，所以舊主題什麼都不用改就跟以前長得一模一樣。
  // googleFontsUrl 選填：要用 Caveat / Noto Serif TC 這類需要另外載入的
  // 字型時，theme.json 給一個 Google Fonts 連結，這裡會動態插入 <link>。
  const f = t.fonts;
  if (f) {
    if (f.heading) root.style.setProperty('--font-heading', f.heading);
    if (f.body)    root.style.setProperty('--font-body', f.body);
    if (f.mono)    root.style.setProperty('--font-mono', f.mono);
    if (f.googleFontsUrl && !document.querySelector(`link[data-theme-font]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = f.googleFontsUrl;
      link.dataset.themeFont = 'true';
      document.head.appendChild(link);
    } else if (f.googleFontsUrl) {
      document.querySelector('link[data-theme-font]').href = f.googleFontsUrl;
    }
  }
}

async function loadThemeFromServer(id, opts) {
  const silent = opts && opts.silent;
  try {
    const t = await (await fetch(`assets/themes/${id}/theme.json`)).json();
    applyTheme(t);
    // 記錄目前套用的主題 id——shell/modal-shell.js 的 openModal() 建立 M 的 iframe
    // 時會讀這個值，透過 URL query string 帶給 theme-boot.js（iframe 是
    // 獨立文件，沒辦法直接讀主文件的變數），讓 iframe 套用的主題跟主
    // HUD 保持一致，不是永遠寫死抓 default。
    window.currentThemeId = id;
    if (!silent) toast('主題已載入：'+(t.name||id));
  } catch(e) {
    // 開機自動載入時（silent=true）不用跳錯誤 toast 打擾使用者——
    // 沒有 theme.json 就留著目前的 SVG demo 圖案，是合理的降級行為，
    // 不是需要使用者處理的錯誤；手動從設定面板選主題失敗時才需要提示。
    if (!silent) toast('主題載入失敗');
    else console.warn('[Theme] 開機自動載入主題失敗，沿用預設 SVG 圖示：', e);
  }
}

function clearAll() {
  document.getElementById('hud-bg').style.backgroundImage='';
  const mi=document.getElementById('mm-img'),ms=document.getElementById('mm-svg');
  mi.src='';mi.classList.remove('on');if(ms)ms.style.display='';
  ['f1','f2','f3','f4','f5','b','h','m','esc'].forEach(k=>{const i=document.getElementById('hki-'+k);if(i){i.src='';i.classList.remove('on');}});
  [0,1,2].forEach(n=>{const i=document.getElementById('avi-'+n);if(i){i.src='';i.classList.remove('on');}});
  objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];
  document.documentElement.classList.remove('nw-skins-enabled');
  toast('已清除所有自訂資源');
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('show'), 2500);
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'Escape') { closeModal(); closeSettings(); }
    return;
  }
  const map = {F1:'f1',F2:'f2',F3:'f3',F4:'f4',F5:'f5',b:'b',B:'b',m:'m',M:'m',h:'h',H:'h'};
  const k = map[e.key];
  if (k) { e.preventDefault(); openModal(k); return; }
  if (e.key === 'Escape') {
    // 若有主面板開著，關主面板；否則開設定
    const modalOpen    = document.getElementById('modal').classList.contains('open');
    const settingsOpen = document.getElementById('settings-modal').style.opacity === '1';
    if (modalOpen)    { closeModal();    return; }
    if (settingsOpen) { closeSettings(); return; }
    openSettings();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════
// SETTINGS PANEL (ESC)
// 儲存位置：localStorage (前端即時) + /api/config (後端持久化)
// 支援：OpenAI / Anthropic / llama.cpp / 自訂 API
// ════════════════════════════════════════════════════════════════════