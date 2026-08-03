/* ============================================================
   <stance-icon stance="support" label="2023Q1 觀測"></stance-icon>
   ============================================================
   對應 NUG.md §3（Observation 立場）。stance 只接受 support/contradict，
   其他任何值（包含缺省）一律正規化成 neutral——跟後端 confidence_engine.py
   的 normalizeStance 邏輯一致，前端不該有一套自己的容錯規則。

   Attributes:
     stance  support | contradict | neutral（其他值視為 neutral）
     label   選填，顯示在圖示旁邊的文字
   ============================================================ */
import { normalizeStance, STANCE_COLOR, STANCE_LABEL } from './nug-tokens.js';

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: inline-flex; font-family: 'JetBrains Mono', monospace; }
    .wrap { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm, 11px); }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .txt { color: var(--text, #f0ead8); opacity: .85; }
  </style>
  <span class="wrap" part="wrap">
    <span class="dot" part="dot"></span>
    <span class="txt" part="label"></span>
  </span>
`;

export class StanceIcon extends HTMLElement {
  static get observedAttributes() { return ['stance', 'label']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    const stance = normalizeStance(this.getAttribute('stance'));
    const color = STANCE_COLOR[stance];
    this.shadowRoot.querySelector('.dot').style.background = color;
    const label = this.getAttribute('label');
    this.shadowRoot.querySelector('.txt').textContent = label || STANCE_LABEL[stance];
    this.title = STANCE_LABEL[stance];
  }
}

customElements.define('stance-icon', StanceIcon);
