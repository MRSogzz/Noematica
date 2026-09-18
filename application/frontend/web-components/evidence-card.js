/* ============================================================
   <evidence-card
     from-name="fed_funds_rate" to-name="bank_net_interest_margin"
     relation-type="causal" confidence="0.62">
     <stance-icon slot="observations" stance="support" label="2023Q1"></stance-icon>
     <stance-icon slot="observations" stance="contradict" label="2023Q2"></stance-icon>
   </evidence-card>
   ============================================================
   對應 NUG.md §2（Atom）+ §5（多層概念如何一起呈現，不互相覆蓋）。
   關係類型（relation-type）決定線條的粗細/虛實（視覺確定感），
   信心（confidence）決定顏色（內部委派給 <activation-badge>）——
   這兩個視覺維度刻意分開處理，不合併成同一個屬性，見 NUG §2 的核心規則：
   「這是什麼類型的推論」跟「這個推論現在有多可信」是兩件不同的事。

   Attributes:
     from-name, to-name   關係兩端的名稱
     relation-type        causal | correlation | definition | constraint |
                           heuristic | analogy
     confidence           0~1 浮點數，直接轉交給內部的 <activation-badge>
   Slot:
     observations（具名 slot）放 <stance-icon> 列表，呈現底下支持/反對這段
     關係的觀測證據——這是選填的，不是每次呈現關係都要展開證據明細
     （NUG §5：立場色只在使用者要求「看細節」時才展開，不是預設全部攤開）。
   ============================================================ */
import { ATOM_TYPE_LABEL, atomLineStyle } from './nug-tokens.js';
import './activation-badge.js';  // evidence-card 的 shadow DOM 裡用到 <activation-badge>，
                                   // 依賴的 custom element 要先註冊過

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: block; font-family: 'JetBrains Mono', monospace; }
    .card {
      background: var(--panel-bg, rgba(8,14,28,.9));
      border: 1px solid var(--border, rgba(232,200,115,.22));
      border-radius: 10px; padding: var(--sp-4, 16px);
    }
    .row { display: flex; align-items: center; gap: 10px; }
    .node { font-size: var(--fs-base, 13px); color: var(--text, #f0ead8); white-space: nowrap; }
    .line-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 40px; }
    .type-label { font-size: var(--fs-xs, 9px); color: var(--muted, rgba(255,255,255,.5)); }
    svg { width: 100%; height: 10px; overflow: visible; }
    .badge-slot { flex-shrink: 0; }
    .obs-list { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border, rgba(255,255,255,.08)); display: flex; flex-wrap: wrap; gap: 10px; }
    .obs-list:empty { display: none; border: none; margin: 0; padding: 0; }
  </style>
  <div class="card" part="card">
    <div class="row">
      <span class="node from" part="from"></span>
      <div class="line-wrap">
        <span class="type-label" part="type-label"></span>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none">
          <line class="rel-line" x1="0" y1="5" x2="100" y2="5" stroke="currentColor" />
        </svg>
      </div>
      <span class="node to" part="to"></span>
      <span class="badge-slot"><activation-badge part="badge"></activation-badge></span>
    </div>
    <div class="obs-list" part="observations"><slot name="observations"></slot></div>
  </div>
`;

export class EvidenceCard extends HTMLElement {
  static get observedAttributes() { return ['from-name', 'to-name', 'relation-type', 'confidence']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    this.shadowRoot.querySelector('.from').textContent = this.getAttribute('from-name') || '?';
    this.shadowRoot.querySelector('.to').textContent = this.getAttribute('to-name') || '?';

    const relType = this.getAttribute('relation-type') || '';
    this.shadowRoot.querySelector('.type-label').textContent = ATOM_TYPE_LABEL[relType] || relType || '關聯';

    const style = atomLineStyle(relType);
    const line = this.shadowRoot.querySelector('.rel-line');
    line.setAttribute('stroke-width', style.width);
    line.setAttribute('stroke-dasharray', style.dash === 'none' ? '' : style.dash);
    this.shadowRoot.querySelector('.line-wrap').style.color = `rgba(240,234,216,${style.opacity})`;

    const badge = this.shadowRoot.querySelector('activation-badge');
    const conf = this.getAttribute('confidence');
    if (conf !== null) badge.setAttribute('confidence', conf);
  }
}

customElements.define('evidence-card', EvidenceCard);
