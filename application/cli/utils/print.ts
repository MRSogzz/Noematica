/**
 * CLI 輸出工具
 * 統一所有顏色、格式、表格、進度條
 */

// ANSI color codes
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
} as const;

export const color = {
  red:     (s: string) => `${C.red}${s}${C.reset}`,
  green:   (s: string) => `${C.green}${s}${C.reset}`,
  yellow:  (s: string) => `${C.yellow}${s}${C.reset}`,
  blue:    (s: string) => `${C.blue}${s}${C.reset}`,
  magenta: (s: string) => `${C.magenta}${s}${C.reset}`,
  cyan:    (s: string) => `${C.cyan}${s}${C.reset}`,
  bold:    (s: string) => `${C.bold}${s}${C.reset}`,
  dim:     (s: string) => `${C.dim}${s}${C.reset}`,
  accent:  (s: string) => `${C.bold}${C.cyan}${s}${C.reset}`,
  pass:    (s: string) => `${C.green}${s}${C.reset}`,
  fail:    (s: string) => `${C.red}${s}${C.reset}`,
  warn:    (s: string) => `${C.yellow}${s}${C.reset}`,
  muted:   (s: string) => `${C.dim}${s}${C.reset}`,
};

/** 主標題 Banner */
export function printBanner(title: string) {
  const line = '─'.repeat(Math.min(60, title.length + 8));
  console.log();
  console.log(color.cyan(` ┌${line}┐`));
  console.log(color.cyan(` │  ${color.bold(title)}  │`).replace(/\x1b\[0m\x1b\[36m/g, '\x1b[36m'));
  console.log(color.cyan(` └${line}┘`));
  console.log();
}

/** section header */
export function printSection(title: string) {
  console.log(`\n${color.bold(color.blue('◆ ' + title))}`);
  console.log(color.dim('  ' + '─'.repeat(40)));
}

/** 成功訊息 */
export function printOk(msg: string) {
  console.log(`  ${color.green('✓')} ${msg}`);
}

/** 錯誤訊息 */
export function printError(msg: string) {
  console.error(`  ${color.red('✗')} ${color.red(msg)}`);
}

/** 警告訊息 */
export function printWarn(msg: string) {
  console.log(`  ${color.yellow('⚠')} ${color.yellow(msg)}`);
}

/** info 訊息 */
export function printInfo(msg: string) {
  console.log(`  ${color.cyan('ℹ')} ${msg}`);
}

/** 進度條（里程碑用） */
export function progressBar(pct: number, width = 30): string {
  const filled = Math.round(pct / 100 * width);
  const empty  = width - filled;
  const bar    = color.green('█'.repeat(filled)) + color.dim('░'.repeat(empty));
  return `[${bar}] ${color.bold(String(pct))}%`;
}

/** 狀態點 */
export function statusDot(status: string): string {
  const map: Record<string, string> = {
    DONE:    color.green('●'),
    pass:    color.green('●'),
    WIP:     color.yellow('●'),
    pending: color.yellow('●'),
    BLOCKED: color.red('●'),
    fail:    color.red('●'),
    skip:    color.dim('○'),
  };
  return map[status] ?? color.dim('○');
}

/** 星級 */
export function stars(passed: number, total: number): string {
  const pct  = total > 0 ? passed / total : 0;
  const n    = Math.round(pct * 5);
  const full = color.yellow('★'.repeat(n));
  const emp  = color.dim('☆'.repeat(5 - n));
  return full + emp;
}

/** 簡易表格
 * cols: [{ key, label, width?, align? }]
 */
export function printTable<T extends Record<string, any>>(
  rows:  T[],
  cols:  { key: keyof T; label: string; width?: number; fmt?: (v: any) => string }[],
) {
  if (!rows.length) { printInfo('（無資料）'); return; }

  // header
  const header = cols.map(c => color.bold(String(c.label).padEnd(c.width ?? 16))).join('  ');
  console.log('  ' + header);
  console.log('  ' + color.dim('─'.repeat(cols.reduce((a, c) => a + (c.width ?? 16) + 2, 0))));

  // rows
  rows.forEach(row => {
    const line = cols.map(c => {
      const raw = row[c.key] ?? '';
      const val = c.fmt ? c.fmt(raw) : String(raw);
      // strip ansi for padding calculation
      const plain = val.replace(/\x1b\[[0-9;]*m/g, '');
      const pad   = Math.max(0, (c.width ?? 16) - plain.length);
      return val + ' '.repeat(pad);
    }).join('  ');
    console.log('  ' + line);
  });
  console.log();
}

/** 全域 help */
export function printHelp() {
  printBanner('LLM WIKI CLI — 人機協作知識管理系統');
  console.log(color.bold('  用法：') + '  wiki <command> [subcommand] [options]\n');
  console.log(color.bold('  Commands:\n'));

  const cmds = [
    ['note',      'ls|new|read|save|rm',      'F1 個人日誌  →  .system/user/notes/'],
    ['git',       'log|status|diff',           'F2 聯機大廳    →  .git (simple-git)'],
    ['test',      'ls|show|run',               'F3 測試套件    →  /api/tests (vitest)'],
    ['milestone', 'ls|show',                   'F4 專案時程活動    →  milestones/*.md'],
    ['doc',       'search|read|tree',          'F5 知識圖鑑    →  docs/**/*.md'],
    ['module',    'ls|show|validate|connect',  'B  模組背包    →  modules/*/README.md'],
    ['map',       'tree|domain',               'M  知識雷達    →  docs/ 目錄樹'],
    ['vector',    'build|search',              '向量索引       →  .system/vector-cache.json'],
    ['ci',        'writeback',                 'CI writeback   →  modules/ + .system/ci/'],
    ['epistemic', 'query|feedback|health',     '認知核心       →  epistemic/（Python 服務代理）'],
    ['serve',     '',                          '啟動 API server (port 3001)'],
    ['help',      '',                          '顯示此說明'],
  ];

  cmds.forEach(([cmd, sub, desc]) => {
    const cmdStr  = color.accent(cmd.padEnd(12));
    const subStr  = color.dim((sub || '').padEnd(28));
    console.log(`    ${cmdStr}  ${subStr}  ${desc}`);
  });

  console.log('\n' + color.bold('  範例：'));
  const examples = [
    'wiki note ls',
    'wiki note new "今日筆記" --content "# Hello"',
    'wiki note read note-2025-06-22.md',
    'wiki git log --limit 10',
    'wiki git status',
    'wiki module ls --status DONE',
    'wiki module validate tokenize embedVec',
    'wiki module connect tokenize embedVec cosSim',
    'wiki test ls',
    'wiki test run unit-parser',
    'wiki test show unit-typechecker',
    'wiki doc search "型別校驗"',
    'wiki doc read docs/llm-wiki/architecture/system-overview.md',
    'wiki milestone ls',
    'wiki vector search "語意向量"',
    'wiki ci writeback --module 1 --status DONE --latency ~4ms',
  ];
  examples.forEach(e => console.log(`    ${color.dim('$')} ${e}`));
  console.log();
}
