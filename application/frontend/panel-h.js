/* ============================================================
   LLM WIKI — PANELS：F3 / M 兩個 no-op
   ============================================================
   F1/F2/F4/F5/B/H 都已經遷移成 Container/View 架構（見
   registry/panel-registry.js），這個檔案（原本分成 hud-panels.js +
   panel-h.js 兩份）只剩 F3、M 這兩個從頭到尾都不需要拆的面板——
   兩者的實際內容都是獨立的 iframe 文件（panel-tests.html /
   panel-m-orbit.html），由 hud-core.js 的 openModal() 在 fullwidth
   模式下直接注入，這裡只需要兩個 no-op 讓 openModal() 結尾的
   PANELS[id]() 呼叫不會出錯。

   PANELS 這個物件本身只需要在這裡宣告一次——原本分兩個檔案（一個宣告
   + 一個用 PANELS.m = ... 擴充）純粹是遷移過程留下的歷史結構，兩個
   no-op 合併成一個檔案更直接。
   ============================================================ */

const PANELS = {
  f3: async function () {},
  m:  async function () {},
};