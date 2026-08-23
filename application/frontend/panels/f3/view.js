/* ============================================================
   panels/f3/view.js — F3（測試套件監控）的 View 層
   ============================================================
   跟其他已遷移面板同一套分工：純函式，資料→HTML，不呼叫 API、不管理
   狀態。F3 本身是獨立的 iframe 頁面（panel-tests.html），不透過
   hud-core.js 的 #m-grid-wrap／registry/panel-registry.js 那套機制
   （openModal() 對 id==='f3' 是直接注入 iframe，不會走 PANEL_REGISTRY），
   所以這裡的 Container/View 分工只在這個 iframe 文件「內部」成立，跟
   其他面板的分工是同一種思路、不同的掛載方式。
   ============================================================ */

export const TYPE_COLOR = { unit: '#60a5fa', integration: '#a78bfa', e2e: '#f472b6' };
export const TYPE_LABEL = { unit: '單元測試', integration: '整合測試', e2e: '端對端' };

export function starsHtml(suite) {
  const pct = suite.total > 0 ? suite.passed / suite.total : 0;
  const n = suite.status === 'pending' ? 0 : Math.round(pct * 5);
  const col = suite.status === 'pending' ? '#94a3b8' : n >= 4 ? '#f97316' : n >= 2 ? '#facc15' : '#60a5fa';
  return Array.from({ length: 5 }, (_, i) =>
    `<svg width="13" height="13" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="${i < n ? col : 'rgba(255,255,255,0.1)'}" stroke="${i < n ? col : 'rgba(255,255,255,0.12)'}" stroke-width="1.5"/></svg>`
  ).join('');
}

export function suiteBadgeSvg(suite, size = 72) {
  const col = TYPE_COLOR[suite.type] || '#e8e4de';
  const s = suite.status;
  const faileye = s === 'fail' ? '#f87171' : s === 'pending' ? '#fbbf24' : col;

  if (suite.type === 'unit') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="20" width="50" height="45" rx="8" fill="rgba(96,165,250,0.12)" stroke="${col}" stroke-width="2"/>
      <rect x="22" y="28" width="14" height="14" rx="3" fill="${col}" opacity=".8"/>
      <rect x="44" y="28" width="14" height="14" rx="3" fill="${col}" opacity=".8"/>
      <rect x="22" y="46" width="36" height="10" rx="3" fill="${col}" opacity=".3"/>
      <line x1="15" y1="20" x2="8" y2="12" stroke="${col}" stroke-width="2" stroke-linecap="round"/>
      <line x1="65" y1="20" x2="72" y2="12" stroke="${col}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="29" cy="35" r="4" fill="${faileye}"/>
      <circle cx="51" cy="35" r="4" fill="${faileye}"/>
      <text x="40" y="72" text-anchor="middle" font-size="9" fill="${col}" font-family="JetBrains Mono,monospace" font-weight="700">UNIT</text>
    </svg>`;
  }
  if (suite.type === 'integration') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="30" r="12" fill="rgba(167,139,250,0.12)" stroke="${col}" stroke-width="2"/>
      <circle cx="60" cy="30" r="12" fill="rgba(167,139,250,0.12)" stroke="${col}" stroke-width="2"/>
      <circle cx="40" cy="55" r="12" fill="rgba(167,139,250,0.12)" stroke="${col}" stroke-width="2"/>
      <line x1="32" y1="30" x2="48" y2="30" stroke="${col}" stroke-width="2.5"/>
      <line x1="26" y1="40" x2="34" y2="46" stroke="${col}" stroke-width="2"/>
      <line x1="54" y1="40" x2="46" y2="46" stroke="${col}" stroke-width="2"/>
      <circle cx="20" cy="30" r="4" fill="${faileye}"/>
      <circle cx="60" cy="30" r="4" fill="${faileye}"/>
      <circle cx="40" cy="55" r="4" fill="${faileye}"/>
      <text x="40" y="76" text-anchor="middle" font-size="8" fill="${col}" font-family="JetBrains Mono,monospace" font-weight="700">INTEG</text>
    </svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="18" width="60" height="38" rx="6" fill="rgba(244,114,182,0.1)" stroke="${col}" stroke-width="2"/>
    <rect x="14" y="22" width="52" height="28" rx="3" fill="rgba(244,114,182,0.06)"/>
    <circle cx="20" cy="26" r="2.5" fill="${col}" opacity=".6"/>
    <circle cx="28" cy="26" r="2.5" fill="${col}" opacity=".6"/>
    <circle cx="36" cy="26" r="2.5" fill="${col}" opacity=".6"/>
    <line x1="14" y1="32" x2="66" y2="32" stroke="${col}" stroke-width="1" opacity=".3"/>
    <circle cx="30" cy="44" r="6" fill="${faileye}" opacity=".8"/>
    <circle cx="50" cy="44" r="6" fill="${faileye}" opacity=".8"/>
    <line x1="30" y1="62" x2="50" y2="62" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="35" y="56" width="10" height="6" fill="${col}" opacity=".4"/>
    <text x="40" y="76" text-anchor="middle" font-size="8" fill="${col}" font-family="JetBrains Mono,monospace" font-weight="700">E2E</text>
  </svg>`;
}

export function headerSubText(suites) {
  return `${suites.length} 個測試套件 · ${suites.reduce((a, s) => a + s.total, 0)} 個測試案例`;
}

export function headerCounts(suites) {
  return {
    pass: suites.filter(s => s.status === 'pass').length,
    fail: suites.filter(s => s.status === 'fail').length,
    pend: suites.filter(s => s.status === 'pending').length,
  };
}

export function tabCounts(suites) {
  return {
    all:  suites.length,
    unit: suites.filter(s => s.type === 'unit').length,
    int:  suites.filter(s => s.type === 'integration').length,
    e2e:  suites.filter(s => s.type === 'e2e').length,
  };
}

function cardHtml(suite) {
  return `
    <div class="card" onclick="openDetail('${suite.id}')">
      <div class="card-img">
        ${suiteBadgeSvg(suite, 70)}
        ${suite.status === 'pending' ? `<div class="card-stamp"><div class="stamp-text">PENDING</div></div>` : ''}
        <div class="card-id">${suite.id}</div>
        <div class="card-stars">${starsHtml(suite)}</div>
      </div>
      ${suite.danger ? `<div class="card-danger">高危</div>` : ''}
      <button class="card-run" onclick="event.stopPropagation();runOne('${suite.id}')" title="執行測試">▶</button>
      <div class="card-info">
        <div class="card-name">「${suite.name}」</div>
        <div class="card-meta">
          <span style="color:${TYPE_COLOR[suite.type]}">${TYPE_LABEL[suite.type]}</span>
          <span style="color:${suite.status === 'pass' ? '#4ade80' : suite.status === 'fail' ? '#f87171' : '#fbbf24'}">${suite.status === 'pass' ? '✓ PASS' : suite.status === 'fail' ? '✗ FAIL' : '⏸ PEND'}</span>
        </div>
        <div class="card-meta" style="margin-top:3px">
          <span>${suite.passed}/${suite.total} 通過</span>
          <span>${suite.duration ? suite.duration + 'ms' : '—'}</span>
        </div>
      </div>
    </div>`;
}

function sectionHtml(title, items) {
  if (!items.length) return '';
  return `
    <div class="grid-label">${title}</div>
    <div class="grid" style="margin-bottom:20px">${items.map(cardHtml).join('')}</div>`;
}

export function gridHtml(list) {
  if (!list.length) return '<div class="empty-msg">此類別暫無測試套件</div>';
  const danger = list.filter(s => s.danger);
  const normal = list.filter(s => !s.danger);
  return sectionHtml('● 標準測試', normal) + (danger.length ? sectionHtml('⚠ 高風險測試', danger) : '');
}

export function connectionErrorHtml() {
  return `<div class="empty-msg">⚠ 無法連線 API<br><span style="font-size:10px;opacity:.5">請確認 npm run dev 已啟動（port 3001）</span></div>`;
}

export function infoTabHtml(s) {
  const pct = s.total > 0 ? Math.round(s.passed / s.total * 100) : 0;
  return `
    <div class="info-grid">
      <div>
        <div class="info-field-label">測試等級</div>
        <div class="info-field-val" style="color:${TYPE_COLOR[s.type]}">${TYPE_LABEL[s.type]}</div>
      </div>
      <div>
        <div class="info-field-label">整體狀態</div>
        <div class="info-field-val" style="color:${s.status === 'pass' ? '#4ade80' : s.status === 'fail' ? '#f87171' : '#fbbf24'}">
          ${s.status === 'pass' ? '✓ PASS' : s.status === 'fail' ? '✗ FAIL' : '⏸ PENDING'}
        </div>
      </div>
      <div>
        <div class="info-field-label">測試奇點</div>
        <div class="info-field-val">${s.failed > 0 ? s.failed + '個測試失敗' : s.status === 'pending' ? '尚未執行' : '全數通過'}</div>
      </div>
      <div>
        <div class="info-field-label">測試屬性</div>
        <div class="info-field-val">${s.danger ? '⚠ 高風險測試' : '標準測試'}</div>
      </div>
      <div class="info-field-full">
        <div class="info-field-label">推薦措施</div>
        <div class="info-field-val">${s.failed > 0 ? '修復失敗測試案例，執行 npm run test -- ' + s.file : s.status === 'pending' ? '執行 npm run test -- ' + s.file + ' 以取得結果' : '維持現有程式碼品質，定期回歸測試'}</div>
      </div>
      <div class="info-field-full">
        <div class="info-field-label">基本資訊</div>
        <div class="info-field-val">
          通過率 <strong style="color:#4ade80">${pct}%</strong>（${s.passed}/${s.total}）·
          耗時 ${s.duration ? s.duration + 'ms' : '—'} ·
          ${s.lastRun ? '上次執行 ' + new Date(s.lastRun).toLocaleString('zh-TW') : '尚未執行'}
        </div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:6px;letter-spacing:.08em">測試案例摘要</div>
    <div style="display:flex;gap:16px;font-size:11px">
      <span style="color:#4ade80">✓ ${s.passed} 通過</span>
      <span style="color:#f87171">✗ ${s.failed} 失敗</span>
      <span style="color:#94a3b8">⊘ ${s.skipped} 跳過</span>
    </div>
    <div style="margin-top:10px;height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.08)">
      <div style="height:100%;width:${pct}%;background:linear-gradient(to right,#4ade80,#22d3ee);border-radius:3px;transition:width .5s"></div>
    </div>`;
}

export function casesTabHtml(s) {
  const cases = s.cases || [];
  if (!cases.length) return '<div class="empty-msg">暫無測試案例資料</div>';
  return cases.map(c => `
    <div class="case-row">
      <div class="case-icon ${c.status}">
        ${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : c.status === 'skip' ? '⊘' : '…'}
      </div>
      <div class="case-name">
        <div>${c.name}</div>
        ${c.error ? `<div class="case-err">${c.error}</div>` : ''}
      </div>
      <div class="case-dur">${c.duration ? c.duration + 'ms' : '—'}</div>
    </div>`).join('');
}

export function errorsTabHtml(s) {
  const errors = (s.cases || []).filter(c => c.error);
  if (!errors.length) return '<div class="empty-msg" style="color:#4ade80">✓ 無錯誤記錄</div>';
  return errors.map(c => `
    <div class="err-item">
      <div class="err-head">
        <span class="err-badge">FAIL</span>
        <span class="err-name">${c.name}</span>
        <span style="font-size:9px;color:var(--muted);margin-left:auto">${c.duration}ms</span>
      </div>
      <div class="err-msg">${c.error}</div>
    </div>`).join('');
}