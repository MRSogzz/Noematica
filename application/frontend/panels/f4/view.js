/* ============================================================
   panels/f4/view.js — F4（目標專案時程）的 View 層
   ============================================================
   跟 panels/f1/、panels/f2/ 同一套分工。GridLayout / MilestoneCard 是
   全域函式（classic script 載入），在這裡當一般識別字直接呼叫。
   ============================================================ */

export const SIDEBAR_CATEGORIES = [
  { id: 'all',  icon: '🏆', label: '里程碑' },
  { id: 'wip',  icon: '⚙️', label: '進行中' },
  { id: 'done', icon: '✅', label: '已完成' },
];

export function loadingToolbarHtml() {
  return `<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入里程碑…</span>`;
}

export function countToolbarHtml(count) {
  return `<span style="font-size:11px;color:rgba(255,255,255,0.35)">${count} 個里程碑</span>`;
}

export function milestoneGridHtml(msData, filter) {
  const list = filter === 'all' ? msData
    : msData.filter(m => filter === 'done' ? m.completion === 100 : m.completion < 100);
  return GridLayout.render({
    items: list,
    renderItem: (m) => MilestoneCard(m, { index: msData.indexOf(m) }),
    emptyIcon: '🏆',
    emptyText: '此分類無里程碑',
  });
}

export function milestoneDetailConfig(m) {
  return {
    icon: m.completion === 100 ? '🏆' : m.completion >= 60 ? '⚡' : '📌',
    name: m.title, tag: m.status,
    attrs: [
      { icon: '📊', text: `完成度：${m.completion}%（${m.doneTasks}/${m.totalTasks} 任務）` },
      { icon: '📅', text: m.due ? '截止：' + m.due : '無截止日期' },
      { icon: '🏷', text: (m.tags || []).join('、') || '無標籤' },
    ],
    desc: '', actions: [],
  };
}