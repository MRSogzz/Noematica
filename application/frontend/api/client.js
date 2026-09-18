/* ============================================================
   ApiClient — 資料服務層的抽象基類
   ============================================================
   對應重構文件的「後端解耦：API 客戶端抽象為適配器」。現有 hud-core.js
   的 api() 函式是寫死的 fetch 呼叫，token 處理、401 重試邏輯全部混在一起，
   要換成 GraphQL/WebSocket 得整個函式重寫。這裡拆成：

     ApiClient   本檔案，只管「怎麼發一個 request、怎麼跑攔截器、怎麼處理
                 401」，完全不知道 token 存在 localStorage 還是 cookie。
     RestClient  api/rest-client.js，接上 REST 語意（GET/POST/DELETE...）
                 跟這個專案實際的 token 存放方式，是 ApiClient 的一個實例。

   要換成 GraphQL，寫一個 api/graphql-client.js 建構同樣介面
   （get/post/delete...或自己的 query/mutation 方法）的另一個 ApiClient
   實例，Container 那邊 import 換一行就好，Panel 的商業邏輯不用動。

   跟現有 api() 的行為刻意保持一致（同一個 401 流程），這樣既有 7 個面板
   (F2/F3/F4/F5/B/H/M) 繼續用舊的 api()，新遷移的 F1 用這個，兩邊打同一個
   後端、同一個 token，使用者感覺不出差異。
   ============================================================ */

export class ApiClient {
  /**
   * @param {string} baseURL
   * @param {object} options
   * @param {Array<(opts, meta) => void|Promise<void>>} options.interceptors
   *        送出 request 前依序執行，可以修改 opts.headers（例如塞 token）。
   *        meta = { path, method }，給攔截器判斷用（例如只在 mutation 方法時加 token）。
   * @param {(retry: () => Promise<any>) => Promise<any>} [options.onUnauthorized]
   *        收到 401 時呼叫，retry 是「用原本的參數再打一次」的函式。
   *        不給這個 callback 的話，401 直接當一般錯誤丟出。
   */
  constructor(baseURL, { interceptors = [], onUnauthorized } = {}) {
    this.baseURL = baseURL;
    this.interceptors = interceptors;
    this.onUnauthorized = onUnauthorized;
  }

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const opts = {
      method,
      headers: { ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    if (body !== undefined && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }

    for (const interceptor of this.interceptors) {
      await interceptor(opts, { path, method: method.toUpperCase() });
    }

    const res = await fetch(this.baseURL + path, opts);
    const json = await res.json().catch(() => ({}));

    if (res.status === 401 && this.onUnauthorized) {
      return this.onUnauthorized(() => this.request(path, { method, body, headers }));
    }
    if (!res.ok) {
      throw new Error(json.error || res.statusText);
    }
    return json;
  }

  get(path, options)          { return this.request(path, { ...options, method: 'GET' }); }
  post(path, body, options)   { return this.request(path, { ...options, method: 'POST', body }); }
  patch(path, body, options)  { return this.request(path, { ...options, method: 'PATCH', body }); }
  delete(path, options)       { return this.request(path, { ...options, method: 'DELETE' }); }
}
