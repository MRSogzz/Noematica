/* ============================================================
   LLM WIKI — PANELS：M 的 no-op
   ============================================================
   F1/F2/F3/F4/F5/B/H 都已經遷移成 Container/View 架構（見
   registry/panel-registry.js）。這個檔案現在只剩 M 的 no-op——M 面板
   本身是 iframe 注入（panel-m-orbit.html），是唯一還沒拆進共用 Shell
   的面板（Three.js/canvas 為主，版面跟其他面板差異太大，見
   shell/modal-shell.js 的 openModal() 裡 FULLWIDTH_PANELS 判斷）。
   ============================================================ */

const PANELS = {
  m: async function () {},
};
