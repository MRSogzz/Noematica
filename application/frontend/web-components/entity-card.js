/* ============================================================
   <entity-card
     name="fed_funds_rate" type="macro_variable"
     domains="總經,貨幣政策" description="聯邦基金利率...">
   </entity-card>
   ============================================================
   對應 NUG.md §1（Entity）。type 決定圖示形象，domains 用文字 chip 呈現，
   兩者不共用同一個視覺維度（NUG §1 規則：一個 Entity 可能屬於多個領域，
   用單一顏色編碼類型會跟多值的 domains 衝突，所以類型只給圖示，不給顏色）。

   Attributes:
     name         Entity 顯示名稱（必填）
     type         concept | metric | problem | process | technique |
                  company | macro_variable | 其他值一律當 unknown
     domains      逗號分隔的領域標籤，選填
     description  簡短描述，選填
   Slot:
     預設 slot 可以放額外內容（例如底下要接的 <evidence-card> 列表），
     不強制卡片本身要包含關聯資訊。
   ============================================================ */
import { normalizeEntityType, ENTITY_TYPE_ICON } from './nug-tokens.js';

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: block; font-family: 'JetBrains Mono', monospace;
      --_bg: var(--panel-bg, rgba(8,14,28,.9));
      --_border: var(--border, rgba(232,200,115,.22));
    }
    .card {
      background: var(--_bg); border: 1px solid var(--_border); border-radius: 10px;
      padding: var(--sp-4, 16px); transition: border-color var(--motion-fast, 120ms);
    }
    .card:hover { border-color: var(--border2, rgba(232,200,115,.6)); }
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .name { font-size: var(--fs-lg, 16px); font-weight: 700; color: var(--text, #f0ead8); }
    .domains { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .chip {
      font-size: var(--fs-xs, 9px); padding: 2px 8px; border-radius: 999px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
      color: var(--muted, rgba(255,255,255,.55));
    }
    .desc { font-size: var(--fs-sm, 11px); color: var(--muted, rgba(255,255,255,.55)); line-height: 1.6; }
    ::slotted(*) { margin-top: 10px; }
  </style>
  <div class="card" part="card">
    <div class="head">
      <span class="icon" part="icon"></span>
      <span class="name" part="name"></span>
    </div>
    <div class="domains" part="domains"></div>
    <div class="desc" part="description"></div>
    <slot></slot>
  </div>
`;

export class EntityCard extends HTMLElement {
  static get observedAttributes() { return ['name', 'type', 'domains', 'description']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    const type = normalizeEntityType(this.getAttribute('type'));
    this.shadowRoot.querySelector('.icon').textContent = ENTITY_TYPE_ICON[type];
    this.shadowRoot.querySelector('.icon').title = type;
    this.shadowRoot.querySelector('.name').textContent = this.getAttribute('name') || '（未命名）';

    const domains = (this.getAttribute('domains') || '').split(',').map(s => s.trim()).filter(Boolean);
    const domainsEl = this.shadowRoot.querySelector('.domains');
    domainsEl.innerHTML = domains.map(d => `<span class="chip">${d}</span>`).join('');
    domainsEl.style.display = domains.length ? '' : 'none';

    const desc = this.getAttribute('description');
    const descEl = this.shadowRoot.querySelector('.desc');
    descEl.textContent = desc || '';
    descEl.style.display = desc ? '' : 'none';
  }
}

customElements.define('entity-card', EntityCard);
