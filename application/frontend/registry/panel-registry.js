/* ============================================================
   registry/panel-registry.js — Panel 的宣告式清單
   ============================================================
   對應重構文件的「註冊表模式：統一管理所有 Panel 的元數據」。

   F1/F2/F3/F4/F5/B/H 都已經遷移成 Container/View 架構。M 是唯一還走
   iframe 注入的面板（Three.js/canvas 為主，版面跟其他面板差異太大，
   見 shell/modal-shell.js 的 openModal() 裡 FULLWIDTH_PANELS 判斷），沒有 mount()。

   title 刻意不在這裡重複定義，讀 window.PANEL_TITLES（shell/modal-shell.js 裡
   原本就有的那份），避免兩個地方各存一份標題、之後改名忘記同步兩邊。
   ============================================================ */

export const PANEL_REGISTRY = {
  f1: {
    get title() { return window.PANEL_TITLES?.f1 || '個人日誌'; },
    icon: '📝',
    mount: async (gridWrapEl) => {
      const { mountF1 } = await import('../panels/f1/container.js');
      return mountF1(gridWrapEl);
    },
  },
  f2: {
    get title() { return window.PANEL_TITLES?.f2 || '協作大廳'; },
    icon: '🔗',
    mount: async (gridWrapEl) => {
      const { mountF2 } = await import('../panels/f2/container.js');
      return mountF2(gridWrapEl);
    },
  },
  f3: {
    get title() { return window.PANEL_TITLES?.f3 || '測試套件監控'; },
    icon: '🧪',
    // F3 的內容包在 <f3-workspace> Web Component 裡（Shadow DOM 隔離樣式，
    // 見 web-components/f3-workspace.js 開頭註解——原本的 CSS 用 .card/.active
    // 這種通用命名，會跟 hud.css/panel-skins.css 撞名，不能直接併入同一份
    // 文件的樣式空間）。跟其他面板不同，這裡不需要 renderSidebar/
    // renderToolbar/renderDetail，因為 F3 自己的版面（統計列/頁籤/格線/
    // 詳情面板）整個包在 Shadow DOM 裡自理，共用的只有最外層的
    // modal-title/關閉鈕。
    mount: async (gridWrapEl) => {
      await import('../web-components/f3-workspace.js'); // 註冊 <f3-workspace> custom element
      gridWrapEl.innerHTML = '';
      gridWrapEl.appendChild(document.createElement('f3-workspace'));
    },
  },
  f4: {
    get title() { return window.PANEL_TITLES?.f4 || '目標專案時程'; },
    icon: '🏆',
    mount: async (gridWrapEl) => {
      const { mountF4 } = await import('../panels/f4/container.js');
      return mountF4(gridWrapEl);
    },
  },
  f5: {
    get title() { return window.PANEL_TITLES?.f5 || '知識圖鑑'; },
    icon: '📚',
    mount: async (gridWrapEl) => {
      const { mountF5 } = await import('../panels/f5/container.js');
      return mountF5(gridWrapEl);
    },
  },
  b: {
    get title() { return window.PANEL_TITLES?.b || '模組背包 — I/O 週期表'; },
    icon: '🎒',
    mount: async (gridWrapEl) => {
      const { mountB } = await import('../panels/b/container.js');
      return mountB(gridWrapEl);
    },
  },
  h: {
    get title() { return window.PANEL_TITLES?.h || 'AI 知識整理'; },
    icon: '🤖',
    mount: async (gridWrapEl) => {
      const { mountH } = await import('../panels/h/container.js');
      return mountH(gridWrapEl);
    },
  },
  // m：唯一還走 iframe 注入的面板，沒有 mount()——這是刻意的，不是漏寫。
};

export function hasContainer(id) {
  return typeof PANEL_REGISTRY[id]?.mount === 'function';
}
