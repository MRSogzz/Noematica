/* ============================================================
   LLM WIKI — HUD Utils
   Quest / 角色 / 圖片上傳 / Theme / Toast / 鍵盤快捷鍵 / Init
   ============================================================ */

async function loadQuests() {
  try {
    const data = await api('/api/milestones');
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
  }
}

async function loadThemeFromServer(id, opts) {
  const silent = opts && opts.silent;
  try {
    const t = await (await fetch(`assets/themes/${id}/theme.json`)).json();
    applyTheme(t);
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