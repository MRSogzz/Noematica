/* ============================================================
   <panel-shell state="loading|error|empty|ready" error-text="..." empty-text="...">
     <div slot="content">...實際內容，state="ready" 時才會顯示...</div>
   </panel-shell>
   ============================================================
   對應重構文件裡的 PanelShell：每個 Panel 原本各自寫一份 spinner/錯誤訊息/
   空狀態（散在 hud-core.js 的 spinner()/errMsg()、GridLayout.render() 的
   loading 分支……），現在收斂成一個元件，四種狀態长什麼样只有這一份定義。

   跟 layouts/grid-layout.js、layouts/list-layout.js 的分工不同：那兩個是
   「一份清單怎麼排」，這個是「整個 Panel 這次請求是成功/失敗/空/還在跑」，
   層級更外面一層——Container 呼叫完 API 後，先决定要不要顯示 PanelShell
   的 loading/error 畫面，決定要顯示內容了，才輪到 View 內部用 GridLayout/
   ListLayout 排列資料。

   Attributes:
     state        loading | error | empty | ready（預設 ready）
     error-text   state="error" 時顯示的文字
     empty-icon   state="empty" 時顯示的圖示，預設 📭
     empty-text   state="empty" 時顯示的文字，預設「無資料」
   Slot:
     content      state="ready" 時顯示的實際內容（Container 塞 View 產生的 DOM 進來）
   ============================================================ */
const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: block; height: 100%; }
    .state { display: flex; flex-direction: column; align-items: center; justify-content: center;
             height: 100%; gap: 10px; font-size: 12px; color: var(--muted, rgba(255,255,255,.4)); }
    .spin { width: 22px; height: 22px; border: 2px solid rgba(255,255,255,.15);
            border-top-color: var(--accent, #e8c873); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: var(--danger, #f87171); }
    .empty-icon { font-size: 28px; opacity: .5; }
    ::slotted([slot="content"]) { display: none; }
    :host([state="ready"]) ::slotted([slot="content"]) { display: block; height: 100%; }
    .state { display: none; }
    :host([state="loading"]) .state.loading,
    :host([state="error"]) .state.error,
    :host([state="empty"]) .state.empty { display: flex; }
  </style>
  <div class="state loading" part="loading"><div class="spin"></div>載入中…</div>
  <div class="state error" part="error"><div class="empty-icon">⚠</div><div class="error-text"></div></div>
  <div class="state empty" part="empty"><div class="empty-icon"></div><div class="empty-text"></div></div>
  <slot name="content"></slot>
`;

export class PanelShell extends HTMLElement {
  static get observedAttributes() { return ['state', 'error-text', 'empty-icon', 'empty-text']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    this.shadowRoot.querySelector('.error .error-text').textContent = this.getAttribute('error-text') || '發生錯誤';
    this.shadowRoot.querySelector('.empty .empty-icon').textContent = this.getAttribute('empty-icon') || '📭';
    this.shadowRoot.querySelector('.empty .empty-text').textContent = this.getAttribute('empty-text') || '無資料';
  }
}

customElements.define('panel-shell', PanelShell);
