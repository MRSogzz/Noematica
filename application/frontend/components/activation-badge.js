/* ============================================================
   <activation-badge confidence="0.82" label="fed_funds_rate → bank_nim">
   ============================================================
   對應 NUG.md §4（Confidence／Activation）。吃一個 0~1 的浮點數，內部自己
   做分級判斷（Strong/Medium/Weak/Hidden），呼叫端不用、也不該自己複製一份
   門檻判斷邏輯——這是 NUG §4 明講的規則，這個元件就是那條規則的程式碼落地。

   Attributes:
     confidence  (必填) 0~1 浮點數字串，例如 "0.82"
     label       (選填) 額外顯示的說明文字，不影響分級判斷
     show-value  (選填) 有這個屬性時，同時顯示數值（例如 "強 0.82"）

   Hidden 分級（< 0.15）刻意不畫出任何東西（NUG §4：低於雜訊門檻的東西
   不該跟 Strong/Medium/Weak 並列，那只會製造雜訊），呼叫端如果想在
   這種情況顯示別的內容（例如「未列入」），自己判斷 confidence 數值後
   決定要不要放這個元件，不是這個元件的職責。
   ============================================================ */
import { confidenceTier, TIER_COLOR, TIER_LABEL } from './nug-tokens.js';

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: inline-flex; font-family: 'JetBrains Mono', monospace; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px; border-radius: 999px;
      font-size: var(--fs-sm, 11px); font-weight: 700;
      border: 1px solid transparent;
      transition: filter var(--motion-fast, 120ms);
    }
    .badge:hover { filter: brightness(1.1); }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .label { color: var(--text, #f0ead8); font-weight: 400; opacity: .85; }
  </style>
  <span class="badge" part="badge">
    <span class="dot" part="dot"></span>
    <span class="tier-text" part="tier"></span>
    <span class="label" part="label"></span>
  </span>
`;

export class ActivationBadge extends HTMLElement {
  static get observedAttributes() { return ['confidence', 'label', 'show-value']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  get confidence() { return parseFloat(this.getAttribute('confidence')); }

  _render() {
    const value = this.confidence;
    const tier = confidenceTier(value);
    const color = TIER_COLOR[tier];
    const badge = this.shadowRoot.querySelector('.badge');
    const dot = this.shadowRoot.querySelector('.dot');
    const tierText = this.shadowRoot.querySelector('.tier-text');
    const label = this.shadowRoot.querySelector('.label');

    if (tier === 'hidden') {
      // NUG §4：Hidden 不呈現，不是「畫一個灰色徽章」，是整個不畫。
      this.style.display = 'none';
      return;
    }
    this.style.display = '';

    badge.style.background = `${color}22`;
    badge.style.borderColor = `${color}55`;
    badge.style.color = color;
    dot.style.background = color;

    const showValue = this.hasAttribute('show-value') && !Number.isNaN(value);
    tierText.textContent = showValue ? `${TIER_LABEL[tier]} ${value.toFixed(2)}` : TIER_LABEL[tier];

    const labelText = this.getAttribute('label');
    label.textContent = labelText || '';
    label.style.display = labelText ? '' : 'none';
  }
}

customElements.define('activation-badge', ActivationBadge);
