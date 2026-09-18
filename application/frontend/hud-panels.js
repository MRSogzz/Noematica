/* ============================================================
   LLM WIKI — HUD Panels  (F1 / F2 / F3 / F4 / B / F5)
   ============================================================ */

const PANELS = {

  // ── F3: 測試套件（測試面板，全寬 iframe） ─────────────────────────────────
  async f3() {
    // openModal 已處理 fullwidth 模式和 iframe 注入，此處無需額外操作
  },

  // ── B: 模組背包 ──────────────────────────────────────────────────────────
  async b() {
    // ── 型別色碼（README 規格）────────────────────────────────────────────
    // 型別/狀態色碼跟卡片外觀（SlotCell）綁在一起維護，這裡只讀不重寫，
    // 避免兩處各自定義一份、之後改色只改到一邊。
    const TC = SlotCell.TYPE_COLORS;
    const SC = SlotCell.STATUS_COLORS;

    let modules       = [];   // 全部模組
    let pipeline      = [];   // 目前管線（有序陣列）
    let currentFilter = 'all';
    let pipelineResult = null; // validatePipeline 的最後回應

    // ── 型別相容（前端本地快速判斷，與後端邏輯一致）─────────────────────
    function compat(a, b) {
      if (!a || !b) return null;
      const o = (a.output?.type || '').toUpperCase();
      const i = (b.input?.type  || '').toUpperCase();
      if (o === 'ANY' || i === 'ANY') return true;
      if (o === i) return true;
      if (i === 'NUM' && (o === 'INT' || o === 'FLOAT')) return true;
      if (o === 'NUM' && (i === 'INT' || i === 'FLOAT')) return true;
      return false;
    }

    // ── Pipeline 狀態列 ────────────────────────────────────────────────────
    function pipelineBar(result) {
      if (!pipeline.length) return '<span style="color:rgba(255,255,255,0.2);font-size:10px">點擊模組加入 Pipeline</span>';

      const steps = pipeline.map((m, i) => {
        const step = result?.steps?.[i - 1]; // step[i-1] = 第 i-1 → i 連接
        const color = i === 0 ? '#A97FE8'
          : step?.compatible === false ? '#f87171'
          : step?.compatible === true  ? '#4ade80'
          : 'rgba(255,255,255,0.4)';
        const arrow = i === 0 ? ''
          : `<span style="color:${color};font-size:12px;margin:0 3px">→</span>`;
        return `${arrow}<span style="color:${color};font-size:10px;font-family:'JetBrains Mono',monospace
          ;padding:2px 6px;border-radius:3px;border:1px solid ${color}44">${m.name}</span>`;
      }).join('');

      const status = !result ? ''
        : result.valid
          ? `<span style="color:#4ade80;font-size:11px;font-weight:700;margin-left:10px">✓ Pipeline 相容</span>`
          : `<span style="color:#f87171;font-size:11px;font-weight:700;margin-left:10px">✗ TypeMismatch</span>`;

      return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
        ${steps}${status}
        <button class="m-action-btn secondary b-btn-validate"
          style="margin-left:8px;padding:3px 8px;font-size:9px;flex:none"
          title="校驗" onclick="window._bValidate()">校驗</button>
        <button class="m-action-btn secondary b-btn-clear"
          style="padding:3px 8px;font-size:9px;flex:none"
          title="清除" onclick="window._bClear()">清除</button>
      </div>`;
    }

    // ── TypeMismatch 高亮視覺化 ────────────────────────────────────────────
    function renderMismatchDetail(result) {
      if (!result || result.valid) return;
      const err   = result.firstError;
      const errIdx = result.steps.indexOf(err);
      const mA = pipeline[errIdx], mB = pipeline[errIdx + 1];
      if (!mA || !mB) return;

      renderDetail({
        icon: '⚠️', name: 'TypeMismatchException', tag: 'BLOCKED',
        attrs: [
          { icon: '📤', text: `${mA.name}() OUTPUT: ${err.outputType}` },
          { icon: '📥', text: `${mB.name}() INPUT:  ${err.inputType}` },
          { icon: '🔍', text: `原因：${err.reason || '頂層型別不符'}` },
          { icon: '🔧', text: `建議 Adapter：${err.adapterSuggestion || '—'}` },
        ],
        desc: err.message,
        actions: [
          { label: '移除 ' + mA.name, cls: 'secondary', onclick: `window._bRemove(${mA.id})` },
          { label: '移除 ' + mB.name, cls: 'secondary', onclick: `window._bRemove(${mB.id})` },
        ]
      });
    }

    // ── 主渲染：模組方格 ──────────────────────────────────────────────────
    function doRenderMods(filter, result) {
      currentFilter = filter;
      const list = filter === 'all' ? modules : modules.filter(m => m.status === filter);

      // 建立 error 高亮 map
      const highlightMap = {};
      if (result && !result.valid) {
        const err    = result.firstError;
        const errIdx = result.steps.indexOf(err);
        const mA = pipeline[errIdx], mB = pipeline[errIdx + 1];
        if (mA) highlightMap[mA.id] = 'error';
        if (mB) highlightMap[mB.id] = 'error';
        // 其他 pipeline 內已校驗通過的節點標綠
        result.steps.forEach((s, i) => {
          if (s.compatible) {
            const pa = pipeline[i], pb = pipeline[i+1];
            if (pa && !highlightMap[pa.id]) highlightMap[pa.id] = 'ok';
            if (pb && !highlightMap[pb.id]) highlightMap[pb.id] = 'ok';
          }
        });
      } else if (result?.valid) {
        pipeline.forEach(m => { highlightMap[m.id] = 'ok'; });
      }

      renderToolbar(`
        <input class="m-search" id="b-q" placeholder="搜尋名稱 / 標籤…"
               oninput="window._bFilter()" style="max-width:180px"/>
        <span style="font-size:10px;color:rgba(255,255,255,0.3)">${list.length} 個模組</span>
        <div style="margin-left:auto;flex:1;min-width:0">${pipelineBar(result)}</div>
      `);

      renderGrid(GridLayout.render({
        items: list,
        loading: !modules.length,
        renderItem: (m) => SlotCell(m, { pipeline, highlight: highlightMap[m.id] || null }),
        emptyIcon: '🔍',
        emptyText: '此分類無模組',
        gridId: 'b-grid',
      }));

      if (list.length && result && !result.valid) renderMismatchDetail(result);
    }

    // ── 後端校驗（呼叫 /api/validate/pipeline）────────────────────────────
    window._bValidate = async () => {
      if (pipeline.length < 2) { toast('請先加入至少兩個模組'); return; }
      try {
        const ids = pipeline.map(m => m.id);
        const r   = await api('/api/validate/pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleIds: ids }),
        });
        pipelineResult = r;
        doRenderMods(currentFilter, r);
        if (r.valid) toast('✓ Pipeline 型別全部相容！');
        else         toast('✗ TypeMismatch：' + r.firstError?.message);
      } catch(e) { toast('校驗失敗：' + e.message); }
    };

    // ── 選取模組（加入 Pipeline）─────────────────────────────────────────
    window._bSel = (id) => {
      const m = modules.find(x => x.id === id); if (!m) return;
      const inPipe = pipeline.indexOf(m);

      if (inPipe >= 0) {
        // 已在 Pipeline 中 → 顯示詳情
        renderModuleDetail(m);
        return;
      }
      pipeline.push(m);
      pipelineResult = null; // 重置校驗
      doRenderMods(currentFilter, null);
      renderModuleDetail(m);
    };

    // ── 從 Pipeline 移除 ──────────────────────────────────────────────────
    window._bRemove = (id) => {
      pipeline = pipeline.filter(m => m.id !== id);
      pipelineResult = null;
      doRenderMods(currentFilter, null);
    };

    // ── 右側詳情（含完整 I/O Schema）─────────────────────────────────────
    function renderModuleDetail(m) {
      const inputSchema  = m.input  ? JSON.stringify(m.input,  null, 2) : '—';
      const outputSchema = m.output ? JSON.stringify(m.output, null, 2) : '—';
      const ti = TC[(m.input?.type  || '').toUpperCase()] || '#aaa';
      const to = TC[(m.output?.type || '').toUpperCase()] || '#aaa';

      renderDetail({
        icon: '🧩', name: m.name + '()', tag: m.status,
        attrs: [
          { icon: '📥', text: `INPUT：${m.input?.type  || '?'}` },
          { icon: '📤', text: `OUTPUT：${m.output?.type || '?'}` },
          { icon: '⚡', text: `延遲：${m.latency || '—'}` },
          { icon: '🏷', text: (m.tags || []).join('、') || '無標籤' },
        ],
        desc: m.description || '',
        actions: [
          { label: pipeline.includes(m) ? '✓ 已在 Pipeline' : '＋ 加入 Pipeline',
            cls:   pipeline.includes(m) ? 'secondary' : 'primary',
            onclick: `window._bSel(${m.id})` },
          ...(pipeline.includes(m)
            ? [{ label: '移除', cls: 'secondary', onclick: `window._bRemove(${m.id})` }]
            : []),
        ]
      });

      // 注入 I/O Schema 詳情到 detail body
      const body = $('m-detail-body');
      if (body) {
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            <div>
              <div style="font-size:9px;font-weight:700;color:${ti};letter-spacing:.1em;
                          margin-bottom:4px;font-family:'JetBrains Mono',monospace">INPUT SCHEMA</div>
              <pre style="background:rgba(0,0,0,0.3);border:1px solid ${ti}33;border-radius:5px;
                          padding:8px;font-size:10px;color:var(--text)cc;line-height:1.6;
                          white-space:pre-wrap;word-break:break-all;margin:0">${inputSchema.replace(/</g,'&lt;')}</pre>
            </div>
            <div>
              <div style="font-size:9px;font-weight:700;color:${to};letter-spacing:.1em;
                          margin-bottom:4px;font-family:'JetBrains Mono',monospace">OUTPUT SCHEMA</div>
              <pre style="background:rgba(0,0,0,0.3);border:1px solid ${to}33;border-radius:5px;
                          padding:8px;font-size:10px;color:var(--text)cc;line-height:1.6;
                          white-space:pre-wrap;word-break:break-all;margin:0">${outputSchema.replace(/</g,'&lt;')}</pre>
            </div>
          </div>`;
      }
    }

    // ── 搜尋（呼叫後端 /api/modules/search）──────────────────────────────
    window._bFilter = async () => {
      const q = $('b-q')?.value?.trim() || '';
      if (!q) { doRenderMods(currentFilter, pipelineResult); return; }
      try {
        const d = await api('/api/modules/search?q=' + encodeURIComponent(q));
        const results = d.modules || [];
        const grid = $('b-grid');
        if (!grid) return;
        grid.querySelectorAll('.m-item').forEach((el, i) => {
          const m = (currentFilter === 'all' ? modules : modules.filter(x => x.status === currentFilter))[i];
          if (!m) return;
          el.style.display = results.find(r => r.id === m.id) ? '' : 'none';
        });
      } catch { /* 降級為本地過濾 */
        const q2 = ($('b-q')?.value || '').toLowerCase();
        $('b-grid')?.querySelectorAll('.m-item').forEach((el, i) => {
          const list = currentFilter === 'all' ? modules : modules.filter(m => m.status === currentFilter);
          const m = list[i]; if (!m) return;
          el.style.display = (m.name.toLowerCase().includes(q2)
            || (m.tags||[]).some(t => t.toLowerCase().includes(q2))) ? '' : 'none';
        });
      }
    };

    window._bClear = () => { pipeline = []; pipelineResult = null; doRenderMods(currentFilter, null); };

    // ── Sidebar ───────────────────────────────────────────────────────────
    renderSidebar([
      { id:'all',     icon:'🧪', label:'全部' },
      { id:'DONE',    icon:'✅', label:'DONE' },
      { id:'WIP',     icon:'⚙️',  label:'WIP' },
      { id:'BLOCKED', icon:'🚫', label:'BLOCKED' },
    ], 'all', (id) => { currentFilter = id; doRenderMods(id, pipelineResult); });

    // ── 初始載入 ──────────────────────────────────────────────────────────
    renderGrid('<div class="m-empty"><div class="spin"></div></div>');
    renderToolbar('<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入模組清單…</span>');
    try {
      const d = await api('/api/modules');
      modules = d.modules || [];
      doRenderMods('all', null);
    } catch(e) { errGrid(e); }
  },


  // ── H: AI 知識整理（wiki/ 目錄 + AI 整理助手，定義在 panel-h.js）────────────
  // ── M: 認知地圖（Activation Orbit，定義在 panel-h.js 底部 + panel-m-orbit.html iframe）


};