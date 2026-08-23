/* ============================================================
   <panel-header title="個人日誌" image="assets/xxx.png" stretch="cover"></panel-header>
   ============================================================
   對應重構文件裡的 PanelHeader。目前現有面板的標題是 hud-core.js
   openModal() 直接寫 $('modal-title').textContent = ...，沒有圖片標題這回事
   ——這個元件是「文件裡要的能力」，先做出來給以後想要圖片標題的 Panel
   （例如換了手繪風格主題、想在標題列放插畫）用，不強制現有面板都要接。

   Attributes:
     title     標題文字（必填）
     image     背景圖片 URL，選填，沒給就是純文字標題
     stretch   cover | contain | 100% 100%（強制拉伸），預設 cover
   ============================================================ */
const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: block; }
    .header {
      padding: 14px 18px; min-height: 56px; display: flex; align-items: flex-end;
      background-position: center; background-repeat: no-repeat;
      border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
      container-type: inline-size;
    }
    h2 { margin: 0; font-size: 15px; font-weight: 700; color: var(--text, #f0ead8);
         text-shadow: 0 1px 3px rgba(0,0,0,.6); }
    @container (max-width: 400px) { .header { min-height: 44px; padding: 10px 14px; } h2 { font-size: 13px; } }
  </style>
  <div class="header" part="header"><h2 part="title"></h2></div>
`;

export class PanelHeader extends HTMLElement {
  static get observedAttributes() { return ['title', 'image', 'stretch']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }

  _render() {
    const header = this.shadowRoot.querySelector('.header');
    this.shadowRoot.querySelector('h2').textContent = this.getAttribute('title') || '';
    const image = this.getAttribute('image');
    if (image) {
      header.style.backgroundImage = `url(${image})`;
      header.style.backgroundSize = this.getAttribute('stretch') || 'cover';
    } else {
      header.style.backgroundImage = 'none';
    }
  }
}

customElements.define('panel-header', PanelHeader);
