/* ============================================================
   restClient — REST 實作，跟 hud-core.js 的 api() 用同一套 token 慣例
   ============================================================
   刻意重用同一個 localStorage key（llm-wiki-hud-token）跟同一個 401 提示
   流程——這樣新遷移的 Panel（走 restClient）跟舊的 7 個面板（走
   hud-core.js 的 api()）共用同一個已登入狀態，使用者不會因為某個面板
   用了新架構就要重新輸入一次 token。
   ============================================================ */
import { ApiClient } from './client.js';

const TOKEN_KEY = 'llm-wiki-hud-token';
const MUTATION_METHODS = new Set(['POST', 'DELETE', 'PATCH', 'PUT']);

export function getHudToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setHudToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

function promptToken() {
  const current = getHudToken();
  const input = prompt(
    '後端要求驗證 Token（x-hud-token）。\n' +
    '請查看後端啟動 terminal 取得 HUD_TOKEN，或在 .env 中設定後重啟。\n\n' +
    '目前 Token：' + (current ? current.slice(0, 8) + '…' : '（未設定）'),
    current
  );
  if (input === null) return null; // 使用者取消
  setHudToken(input);
  return input;
}

const tokenInterceptor = (opts, { method }) => {
  if (MUTATION_METHODS.has(method)) {
    const token = getHudToken();
    if (token) opts.headers['x-hud-token'] = token;
  }
};

async function handleUnauthorized(retry) {
  const input = promptToken();
  if (input === null) {
    // 使用者取消輸入，明確丟錯誤，不要吊著呼叫端的 await 沒有回應
    throw new Error('請輸入正確的 HUD Token 後重試');
  }
  return retry();
}

export const restClient = new ApiClient(
  window.API_OVERRIDE || 'http://localhost:3001',
  {
    interceptors: [tokenInterceptor],
    onUnauthorized: handleUnauthorized,
  }
);