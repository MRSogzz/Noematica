/* ============================================================
   panels/f2/view.js — F2（協作大廳）的 View 層
   ============================================================
   跟 panels/f1/view.js 同一套分工：純函式，資料→HTML，不呼叫 API。
   ListLayout / CommitRow / StatusFileRow 是全域函式（classic script
   載入），在這裡當一般識別字直接呼叫。
   ============================================================ */

export const SIDEBAR_CATEGORIES = [
  { id: 'commits', icon: '🔗', label: 'Commit 紀錄', divider: true },
  { id: 'status',  icon: '📊', label: '工作狀態' },
];

export function loadingToolbarHtml() {
  return `<span style="font-size:11px;color:rgba(255,255,255,0.35)">載入 Git 記錄…</span>`;
}

export function statusToolbarHtml(status) {
  return `
    <span style="font-size:11px;color:rgba(255,255,255,0.4)">分支：</span>
    <span style="font-size:13px;color:var(--accent);font-weight:700">${status.branch || 'unknown'}</span>
    ${status.ahead  ? `<span style="font-size:10px;color:#4ade80;margin-left:8px">↑ ${status.ahead} 超前</span>` : ''}
    ${status.behind ? `<span style="font-size:10px;color:#f87171;margin-left:8px">↓ ${status.behind} 落後</span>` : ''}
    ${(status.modified || []).length ? `<span style="font-size:10px;color:var(--accent);margin-left:8px">${status.modified.length} 已修改</span>` : ''}
    <button class="m-action-btn secondary" style="margin-left:auto;flex:none;padding:6px 14px;font-size:11px" onclick="f2Refresh()">重新整理</button>
  `;
}

export function commitListHtml(commits) {
  return ListLayout.render({
    items: commits,
    emptyIcon: '📭',
    emptyText: '尚無 Commit 記錄',
    renderItem: (c, i) => CommitRow(c, { onClick: `f2Show(${i})` }),
  });
}

export function commitDetailConfig(c) {
  return {
    icon: '🔗', name: c.hash, tag: 'Git Commit',
    attrs: [
      { icon: '👤', text: c.author },
      { icon: '📅', text: new Date(c.date).toLocaleString('zh-TW') },
      { icon: '📝', text: c.message },
      { icon: '📧', text: c.email },
    ],
    desc: '', actions: [],
  };
}

function statusSection(label, files, rowOpts) {
  if (!files.length) return '';
  return `<div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;padding:8px 0 4px">${label} (${files.length})</div>
    ${files.map(f => StatusFileRow(f, rowOpts)).join('')}`;
}

export function statusGroupsHtml(status) {
  const modified = status.modified || [];
  const staged = status.staged || [];
  const untracked = status.untracked || [];
  if (!modified.length && !staged.length && !untracked.length) {
    return '<div class="m-empty" style="padding:40px 0"><div class="m-empty-icon">✨</div><div>工作目錄乾淨</div></div>';
  }
  return `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
    ${statusSection('已修改', modified, { icon: '✏️', color: 'var(--text)' })}
    ${statusSection('已暫存', staged, { icon: '✅', color: '#4ade80' })}
    ${statusSection('未追蹤', untracked, { icon: '❓', color: 'rgba(255,255,255,0.45)' })}
  </div>`;
}

export function statusDetailConfig(status) {
  const modified = status.modified || [], staged = status.staged || [], untracked = status.untracked || [];
  return {
    icon: '📊', name: '工作目錄狀態', tag: status.branch || 'unknown',
    attrs: [
      { icon: '🌿', text: '分支：' + (status.branch || 'unknown') },
      { icon: '↑', text: '超前 ' + status.ahead + ' 個 commit' },
      { icon: '↓', text: '落後 ' + status.behind + ' 個 commit' },
      { icon: '✏️', text: `修改 ${modified.length} · 暫存 ${staged.length} · 未追蹤 ${untracked.length}` },
    ],
    desc: '', actions: [],
  };
}
