/* ============================================================
   NoteCard — 個人日誌 (F1) 方格卡片（Component 層）
   ============================================================ */

function NoteCard(n, { currentFile, badge = 'date' } = {}) {
  const badgeText = badge === 'time'
    ? new Date(n.modified).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : new Date(n.modified).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  return `<div class="m-item ${n.filename === currentFile ? 'active' : ''}" onclick="f1Open('${n.filename}')">
    <div class="m-item-icon">📄</div>
    <div class="m-item-name">${n.filename.replace('.md', '')}</div>
    <div class="m-item-badge">${badgeText}</div>
  </div>`;
}
