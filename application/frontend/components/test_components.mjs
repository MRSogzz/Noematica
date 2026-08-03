import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
  runScripts: 'outside-only',
  url: 'http://localhost/components/test.html',
});
global.window = dom.window;
global.document = dom.window.document;
global.customElements = dom.window.customElements;
global.HTMLElement = dom.window.HTMLElement;

const { ActivationBadge } = await import('./activation-badge.js');
const { StanceIcon } = await import('./stance-icon.js');
const { EntityCard } = await import('./entity-card.js');
const { EvidenceCard } = await import('./evidence-card.js');

console.log('✓ 全部元件模組載入成功，customElements 已註冊:',
  ['activation-badge','stance-icon','entity-card','evidence-card']
    .map(n => `${n}=${!!customElements.get(n)}`).join(', '));

// ---- 測試 1: activation-badge 各分級 ----
const badge = document.createElement('activation-badge');
document.body.appendChild(badge);
badge.setAttribute('confidence', '0.82');
console.log('✓ confidence=0.82 → tier text:', badge.shadowRoot.querySelector('.tier-text').textContent, '| display:', badge.style.display || '(visible)');

badge.setAttribute('confidence', '0.10');
console.log('✓ confidence=0.10 (Hidden) → display:', badge.style.display, '(應該是 none)');

badge.setAttribute('confidence', '0.55');
badge.setAttribute('show-value', '');
console.log('✓ confidence=0.55 + show-value → tier text:', badge.shadowRoot.querySelector('.tier-text').textContent);

// ---- 測試 2: stance-icon ----
const stance = document.createElement('stance-icon');
document.body.appendChild(stance);
stance.setAttribute('stance', 'support');
console.log('✓ stance=support → label:', stance.shadowRoot.querySelector('.txt').textContent, '| color:', stance.shadowRoot.querySelector('.dot').style.background);
stance.setAttribute('stance', 'garbage_value');
console.log('✓ stance=garbage_value（非法值）→ 正規化成:', stance.shadowRoot.querySelector('.txt').textContent, '（應該是「中立」）');

// ---- 測試 3: entity-card ----
const entity = document.createElement('entity-card');
document.body.appendChild(entity);
entity.setAttribute('name', 'fed_funds_rate');
entity.setAttribute('type', 'macro_variable');
entity.setAttribute('domains', '總經,貨幣政策');
entity.setAttribute('description', '聯邦基金利率');
console.log('✓ entity-card 渲染 → icon:', entity.shadowRoot.querySelector('.icon').textContent, '| name:', entity.shadowRoot.querySelector('.name').textContent, '| chips:', entity.shadowRoot.querySelectorAll('.chip').length);

entity.setAttribute('type', 'SomeWeirdType');
console.log('✓ 未知 type → icon fallback:', entity.shadowRoot.querySelector('.icon').textContent, '（應該是 ❔）');

// ---- 測試 4: evidence-card（含內部 activation-badge 依賴）----
const evidence = document.createElement('evidence-card');
document.body.appendChild(evidence);
evidence.setAttribute('from-name', 'fed_funds_rate');
evidence.setAttribute('to-name', 'bank_net_interest_margin');
evidence.setAttribute('relation-type', 'causal');
evidence.setAttribute('confidence', '0.62');
const innerBadge = evidence.shadowRoot.querySelector('activation-badge');
console.log('✓ evidence-card → from/to:', evidence.shadowRoot.querySelector('.from').textContent, '→', evidence.shadowRoot.querySelector('.to').textContent);
console.log('✓ evidence-card → 內部 activation-badge 拿到 confidence:', innerBadge.getAttribute('confidence'));
console.log('✓ evidence-card → 內部 badge tier text:', innerBadge.shadowRoot.querySelector('.tier-text').textContent);
console.log('✓ evidence-card → relation-type=causal 線寬:', evidence.shadowRoot.querySelector('.rel-line').getAttribute('stroke-width'));

evidence.setAttribute('relation-type', 'analogy');
console.log('✓ relation-type=analogy 線寬（應該比 causal 細）:', evidence.shadowRoot.querySelector('.rel-line').getAttribute('stroke-width'));

console.log('\n全部測試跑完，沒有拋出例外。');
