/* ============================================================
   <f3-workspace></f3-workspace>
   ============================================================
   F3（測試套件監控）從獨立 iframe（panel-tests.html）改成掛進共用的
   WorkspaceShell（見 hud-core.js openModal()、hud-main.html 的
   #m-grid-wrap）。外層的 Modal 標題列（modal-title）跟關閉鈕是共用的，
   F3 自己的內容（統計列、分類頁籤、卡片格線、詳情面板）包在這個
   Web Component 的 Shadow DOM 裡。

   ⚠️ 為什麼一定要 Shadow DOM，不能直接把 DOM 塞進 #m-grid-wrap：
   F3 原本的 CSS 用的是 .card / .active / .content 這種非常通用的命名，
   跟 hud.css／panel-skins.css 裡已經存在的選擇器（例如 .task-item.active、
   .m-cat.active）撞名——直接併入同一份文件的樣式空間會互相污染。Shadow
   DOM 提供真正的樣式隔離，內部完全不用重新命名任何 class，這是它比
   「幫 100 多個 class 手動加前綴」更省力也更不容易漏改的做法。

   內部的 header 拿掉了原本的「測試套件監控」標題文字（header-title），
   因為外層共用的 modal-title 已經顯示這行字，兩個標題疊在一起是視覺
   上的重複；統計列（通過/失敗/待跑）、全部執行按鈕保留在內部，因為
   那是 F3 專屬的操作，不是通用的 Modal 外框該有的東西。

   panels/f3/container.js 的 mountF3(root) 現在吃一個 root 參數
   （預設 document），這裡傳進 this.shadowRoot，container.js 內部的
   查詢輔助函式改用 root.querySelector('#'+id)（Shadow DOM 沒有
   getElementById，只有 querySelector／querySelectorAll）。
   panel-tests.html 如果還想直接用瀏覽器打開單獨測試，也還能動
   （mountF3() 不傳參數時退回 document），沒有被這次改動破壞。
   ============================================================ */

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    /* --bg/--bg2/--bg3/--card-bg 跟共用主題變數不同名，用
       var(--共用變數名, 原本字面值) 接手；--border/--text/--muted/--accent
       剛好跟共用變數同名，保留原本字面值當預設值，theme-boot.js 設在
       :root 上的自訂屬性會透過 Shadow DOM 邊界自動穿透過來蓋掉這裡的
       預設值（CSS 自訂屬性是少數能穿透 Shadow DOM 的東西之一）。 */
    --bg:      var(--panel-bg, #18181c);
    --bg2:     var(--key-bg, #222228);
    --bg3:     #2a2a32;
    --card-bg: var(--panel-bg, #1e1e24);
    --border:  rgba(255,255,255,0.1);
    --text:    #e8e4de;
    --muted:   rgba(232,228,222,0.4);
    --pass:    #4ade80;
    --fail:    #f87171;
    --skip:    #94a3b8;
    --pend:    #fbbf24;
    --unit-c:  #60a5fa;
    --int-c:   #a78bfa;
    --e2e-c:   #f472b6;
    --accent:  #ec4899;

    display: block; height: 100%; position: relative; overflow: hidden;
    background: var(--bg); color: var(--text);
    font-family: 'JetBrains Mono', monospace;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host::before {
    content: '';
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(90deg, transparent 0, transparent 18px, rgba(0,0,0,0.18) 18px, rgba(0,0,0,0.18) 22px),
      repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 40px);
    pointer-events: none; z-index: 0;
  }

  .panel { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; }

  .header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: rgba(0,0,0,0.5); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .header-logo { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .header-sub { font-size: 10px; color: var(--muted); letter-spacing: .08em; }
  .header-spacer { flex: 1; }

  .sum-pill { display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; border: 1px solid; }
  .sum-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .sum-pass { color: var(--pass); border-color: rgba(74,222,128,.3); background: rgba(74,222,128,.08); }
  .sum-fail { color: var(--fail); border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.08); }
  .sum-pend { color: var(--pend); border-color: rgba(251,191,36,.3); background: rgba(251,191,36,.08); }
  .run-all-btn { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; padding: 6px 16px; border-radius: 20px; background: linear-gradient(135deg, var(--accent), #8b5cf6); border: none; color: white; cursor: pointer; transition: opacity .12s; }
  .run-all-btn:hover { opacity: .85; }

  .tab-bar { display: flex; gap: 8px; padding: 10px 18px 0; border-bottom: 1px solid var(--border); flex-shrink: 0; background: rgba(0,0,0,0.3); }
  .tab { font-size: 11px; font-weight: 700; padding: 6px 16px; border-radius: 8px 8px 0 0; border: 1px solid transparent; border-bottom: none; cursor: pointer; letter-spacing: .05em; transition: all .15s; color: var(--muted); }
  .tab.active { color: var(--text); border-color: var(--border); background: var(--bg2); }
  .tab.t-unit { --tc: var(--unit-c); }
  .tab.t-int  { --tc: var(--int-c);  }
  .tab.t-e2e  { --tc: var(--e2e-c);  }
  .tab.t-all  { --tc: var(--text);   }
  .tab.active { color: var(--tc, var(--text)); }
  .tab-count { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 9px; margin-left: 6px; background: rgba(255,255,255,0.1); }

  .content { flex: 1; display: flex; overflow: hidden; }

  .grid-panel { flex: 1; overflow-y: auto; padding: 16px; background: rgba(0,0,0,0.15); }
  .grid-label { font-size: 10px; color: var(--muted); letter-spacing: .15em; text-transform: uppercase; margin-bottom: 12px; padding-left: 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px,1fr)); gap: 12px; }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform .15s, border-color .15s; position: relative; }
  .card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.22); }
  .card-img { position: relative; height: 130px; background: var(--bg3); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .card-img-svg { width: 72px; height: 72px; opacity: .85; }
  .card-img::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent 0, transparent 11px, rgba(255,255,255,0.03) 11px, rgba(255,255,255,0.03) 12px),
      repeating-linear-gradient(90deg, transparent 0, transparent 11px, rgba(255,255,255,0.03) 11px, rgba(255,255,255,0.03) 12px);
  }
  .card-stamp { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .stamp-text { font-size: 22px; font-weight: 900; letter-spacing: .1em; color: rgba(255,255,255,0.12); transform: rotate(-25deg); border: 3px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 4px; user-select: none; }
  .card-id { position: absolute; top: 6px; right: 8px; font-size: 9px; color: rgba(255,255,255,0.3); }
  .card-stars { position: absolute; bottom: 8px; left: 8px; display: flex; gap: 2px; }
  .card-info { padding: 8px 10px; background: rgba(0,0,0,0.4); border-top: 1px solid var(--border); }
  .card-name { font-size: 11px; font-weight: 700; margin-bottom: 3px; font-family: 'Noto Serif SC', serif; }
  .card-meta { display: flex; justify-content: space-between; font-size: 9px; color: var(--muted); }
  .card-run { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 9px; cursor: pointer; color: white; transition: background .12s; }
  .card-run:hover { background: rgba(236,72,153,0.4); }
  .card-danger { position: absolute; top: 6px; right: 6px; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: rgba(248,113,113,0.2); color: var(--fail); border: 1px solid rgba(248,113,113,0.3); }

  .detail-panel { width: 520px; flex-shrink: 0; background: rgba(10,10,14,0.97); border-left: 1px solid var(--border); display: flex; flex-direction: column; transform: translateX(100%); transition: transform .22s cubic-bezier(.4,0,.2,1); }
  .detail-panel.open { transform: translateX(0); }
  .detail-head { display: flex; gap: 0; align-items: stretch; border-bottom: 1px solid var(--border); flex-shrink: 0; position: relative; }
  .detail-card-area { width: 200px; flex-shrink: 0; background: var(--bg3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px 12px; border-right: 1px solid var(--border); position: relative; overflow: hidden; }
  .detail-card-area::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent 0, transparent 13px, rgba(255,255,255,0.03) 13px, rgba(255,255,113,0.03) 14px),
      repeating-linear-gradient(90deg, transparent 0, transparent 13px, rgba(255,255,255,0.03) 13px, rgba(255,255,255,0.03) 14px);
  }
  .detail-monster-svg { width: 90px; height: 90px; position: relative; z-index: 1; }
  .detail-suite-id { font-size: 9px; color: rgba(255,255,255,0.3); position: relative; z-index: 1; }
  .detail-suite-name { font-size: 13px; font-weight: 700; font-family: 'Noto Serif SC', serif; text-align: center; position: relative; z-index: 1; }
  .detail-actions { display: flex; gap: 8px; margin-top: 6px; position: relative; z-index: 1; }
  .detail-act-btn { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; padding: 7px 14px; border-radius: 20px; cursor: pointer; border: none; transition: opacity .12s; }
  .detail-act-btn:hover { opacity: .85; }
  .btn-run  { background: linear-gradient(135deg,var(--accent),#8b5cf6); color: #fff; }
  .btn-copy { background: rgba(255,255,255,0.1); color: var(--text); border: 1px solid var(--border); }
  .detail-right { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .detail-title { font-size: 13px; font-weight: 700; letter-spacing: .08em; padding: 14px 16px 0; color: rgba(255,255,255,0.6); font-family: 'Noto Serif SC', serif; text-align: center; }
  .detail-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 16px; margin-top: 8px; flex-shrink: 0; }
  .dtab { font-size: 11px; padding: 8px 14px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; transition: all .12s; white-space: nowrap; }
  .dtab.active { color: var(--text); border-bottom-color: var(--accent); }
  .detail-body { flex: 1; overflow-y: auto; padding: 14px 16px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .info-field-label { font-size: 10px; color: var(--muted); margin-bottom: 4px; letter-spacing: .06em; }
  .info-field-val { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 7px 10px; font-size: 11px; color: var(--text); }
  .info-field-full { grid-column: 1/3; }

  .case-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; }
  .case-icon { flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; margin-top: 1px; }
  .case-icon.pass { background: rgba(74,222,128,.2); color: var(--pass); }
  .case-icon.fail { background: rgba(248,113,113,.2); color: var(--fail); }
  .case-icon.skip,.case-icon.pending { background: rgba(148,163,184,.15); color: var(--skip); }
  .case-name { flex: 1; min-width: 0; line-height: 1.4; }
  .case-dur { flex-shrink: 0; font-size: 9px; color: var(--muted); margin-top: 2px; }
  .case-err { font-size: 10px; color: var(--fail); margin-top: 4px; background: rgba(248,113,113,.06); border: 1px solid rgba(248,113,113,.15); border-radius: 4px; padding: 5px 8px; white-space: pre-wrap; word-break: break-all; }

  .err-item { background: rgba(248,113,113,.06); border: 1px solid rgba(248,113,113,.15); border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
  .err-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .err-badge { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; background: rgba(248,113,113,.2); color: var(--fail); }
  .err-name { font-size: 11px; color: var(--text); }
  .err-msg { font-size: 10px; color: rgba(248,113,113,.8); white-space: pre-wrap; word-break: break-all; }

  .spin { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.1); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 11px; padding: 20px 0; justify-content: center; }
  .empty-msg { text-align: center; padding: 30px; font-size: 11px; color: var(--muted); }

  .detail-close { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: var(--text); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 5; transition: background .12s; }
  .detail-close:hover { background: rgba(255,255,255,0.15); }
</style>

<div class="panel">
  <!-- Header：拿掉了原本的「測試套件監控」標題文字，外層共用的
       modal-title 已經顯示這行字，避免重複 -->
  <div class="header">
    <div class="header-logo">🧬</div>
    <div>
      <div class="header-sub" id="h-sub">載入中…</div>
    </div>
    <div class="header-spacer"></div>
    <div class="sum-pill sum-pass"><div class="sum-dot"></div><span id="h-pass">–</span> 通過</div>
    <div class="sum-pill sum-fail"><div class="sum-dot"></div><span id="h-fail">–</span> 失敗</div>
    <div class="sum-pill sum-pend"><div class="sum-dot"></div><span id="h-pend">–</span> 待跑</div>
    <button class="run-all-btn" onclick="runAll()">▶ 全部執行</button>
  </div>

  <div class="tab-bar">
    <div class="tab t-all active" id="tab-all" onclick="setTab('all')">全部 <span class="tab-count" id="tc-all">0</span></div>
    <div class="tab t-unit" id="tab-unit" onclick="setTab('unit')">● 單元測試 <span class="tab-count" id="tc-unit">0</span></div>
    <div class="tab t-int"  id="tab-int"  onclick="setTab('integration')">◈ 整合測試 <span class="tab-count" id="tc-int">0</span></div>
    <div class="tab t-e2e"  id="tab-e2e"  onclick="setTab('e2e')">✦ 端對端 <span class="tab-count" id="tc-e2e">0</span></div>
  </div>

  <div class="content">
    <div class="grid-panel" id="grid-panel">
      <div class="loading"><div class="spin"></div>載入測試套件…</div>
    </div>

    <div class="detail-panel" id="detail-panel">
      <div class="detail-head">
        <button class="detail-close" onclick="closeDetail()">✕</button>
        <div class="detail-card-area" id="detail-card-area">
          <div class="detail-suite-id" id="d-id"></div>
          <div id="d-monster-svg" class="detail-monster-svg"></div>
          <div class="detail-suite-name" id="d-name"></div>
          <div class="detail-actions">
            <button class="detail-act-btn btn-run" onclick="runSuite()">▶ 執行</button>
            <button class="detail-act-btn btn-copy" onclick="copySuite()">⎘ 複製路徑</button>
          </div>
        </div>
        <div class="detail-right">
          <div class="detail-title">套件詳情</div>
          <div class="detail-tabs">
            <div class="dtab active" id="dtab-info" onclick="setDTab('info')">基本資訊</div>
            <div class="dtab" id="dtab-cases" onclick="setDTab('cases')">測試明細</div>
            <div class="dtab" id="dtab-errors" onclick="setDTab('errors')">錯誤記錄</div>
          </div>
          <div class="detail-body" id="detail-body"></div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

export class F3Workspace extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  async connectedCallback() {
    // onclick="runAll()" 這類字串式事件（Shadow DOM 內的 innerHTML 產物，
    // 跟其他面板的 onclick="window._bSel(...)" 是同一種既有慣例）在
    // Shadow DOM 裡執行時，沒有前綴的裸識別字一樣會往外層 window 找，
    // 所以 mountF3() 把 setTab/openDetail/... 掛在 window 上完全沒問題，
    // 不需要另外處理事件委派。
    const { mountF3 } = await import('../panels/f3/container.js');
    mountF3(this.shadowRoot);
  }
}

customElements.define('f3-workspace', F3Workspace);