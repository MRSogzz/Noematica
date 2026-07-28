/**
 * LLM WIKI — CI/CD Validation Watcher (writeback)
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：在每次 CI/CD Pipeline 部署後，
 *       1. 捕獲生產環境的真實 I/O 數據與 Latency
 *       2. 將結果寫回對應模組的 README.md（更新 status 與 latency）
 *       3. 生成 Git commit：[ci] update module#XXX status=DONE lat=Xms
 *
 * 使用方式（CLI，指定單一模組）：
 *   npm run ci-writeback -- --module=1 --status=DONE --latency=~4ms --name=schemaVal
 *
 * 使用方式（CLI，自動偵測這次 push 改了哪些模組，見 ci.yml）：
 *   npm run ci-writeback -- --detect-changed --base=<beforeSha> --head=<sha> --status=DONE
 *   ——用 git diff 找出這次變更範圍內的 modules/*\/README.md，一個模組寫回一次。
 *
 * 使用方式（程式呼叫）：
 *   import { writebackResult } from './ci-watcher.js';
 *   await writebackResult({ moduleId: 1, status: 'DONE', ... });
 */

import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleStatus = 'DONE' | 'WIP' | 'BLOCKED';

export interface CIResult {
  moduleId:     number;
  moduleName:   string;
  status:       ModuleStatus;
  latency:      string;
  testsPassed:  number;
  testsFailed:  number;
  capturedAt:   string;
  notes?:       string;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function findModuleReadme(moduleId: number): string | null {
  const modulesDir = path.resolve('modules');
  if (!fss.existsSync(modulesDir)) return null;

  const dirs = fss.readdirSync(modulesDir, { withFileTypes: true });
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const candidate = path.join(modulesDir, dirent.name, 'README.md');
    if (!fss.existsSync(candidate)) continue;

    try {
      const raw        = fss.readFileSync(candidate, 'utf-8');
      const { data }   = matter(raw);
      if (Number(data['id']) === moduleId) return candidate;
    } catch { /* skip unreadable */ }
  }
  return null;
}

// ── Front matter updater ──────────────────────────────────────────────────────

async function updateModuleReadme(filePath: string, result: CIResult): Promise<void> {
  const raw              = await fs.readFile(filePath, 'utf-8');
  const { data: fm, content: body } = matter(raw);

  fm['status']  = result.status;
  fm['latency'] = result.latency;
  fm['updated'] = result.capturedAt.slice(0, 10);

  const ciLogEntry = [
    '',
    '---',
    '',
    '## CI/CD Run Log',
    '',
    '| 欄位       | 值 |',
    '|------------|---|',
    `| 執行時間   | ${result.capturedAt} |`,
    `| 狀態       | **${result.status}** |`,
    `| 延遲       | ${result.latency} |`,
    `| 測試通過   | ${result.testsPassed} |`,
    `| 測試失敗   | ${result.testsFailed} |`,
    result.notes ? `| 備注       | ${result.notes} |` : '',
  ].filter(l => l !== undefined).join('\n');

  // Remove old CI log section, append fresh one
  const bodyWithoutLog = body.replace(/\n---\n\n## CI\/CD Run Log[\s\S]*$/, '');
  const newContent     = matter.stringify(bodyWithoutLog + ciLogEntry, fm);

  await fs.writeFile(filePath, newContent, 'utf-8');
}

// ── Git commit helper ─────────────────────────────────────────────────────────

function gitCommitWriteback(result: CIResult, filePath: string): void {
  const idStr = String(result.moduleId).padStart(3, '0');
  const msg   = `[ci] update module#${idStr} status=${result.status} lat=${result.latency}`;
  try {
    execSync(`git add "${filePath}"`, { stdio: 'pipe' });
    execSync(`git commit -m "${msg}"`, { stdio: 'pipe' });
    console.log(`[CI Watcher] Git commit: ${msg}`);
  } catch {
    console.warn('[CI Watcher] Git commit skipped (not a repo or nothing to commit).');
  }
}

// ── System CI log ─────────────────────────────────────────────────────────────

const SYSTEM_LOG_PATH = path.resolve('.system/ci/ci-runs.json');

async function appendSystemLog(result: CIResult): Promise<void> {
  let history: CIResult[] = [];
  try {
    const raw = await fs.readFile(SYSTEM_LOG_PATH, 'utf-8');
    history   = JSON.parse(raw) as CIResult[];
  } catch { /* first run */ }

  history.unshift(result);
  if (history.length > 200) history = history.slice(0, 200);

  await fs.mkdir(path.dirname(SYSTEM_LOG_PATH), { recursive: true });
  await fs.writeFile(SYSTEM_LOG_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function writebackResult(result: CIResult): Promise<void> {
  console.log(`[CI Watcher] Processing module #${result.moduleId} (${result.moduleName})…`);

  const readmePath = findModuleReadme(result.moduleId);
  if (!readmePath) {
    console.error(`[CI Watcher] README.md not found for module #${result.moduleId}`);
    await appendSystemLog(result);
    return;
  }

  await updateModuleReadme(readmePath, result);
  console.log(`[CI Watcher] ✓ Updated: ${readmePath}`);

  await appendSystemLog(result);
  console.log(`[CI Watcher] ✓ System log updated`);

  gitCommitWriteback(result, readmePath);
}

// ── Changed-module detection ────────────────────────────────────────────────
//
// ci.yml 原本傳 --module-id="${{ github.event.head_commit.message }}"——commit
// message 不是模組 ID，這裡改成真的用 git diff 找出這次 push 改了哪些
// modules/*/README.md，再從 frontmatter 讀出正確的數字 id，一個模組寫回一次。

interface ChangedModule {
  moduleId:   number;
  moduleName: string;
  readmePath: string;
}

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git 內建的「空樹」物件，第一個 commit 時拿來當 diff 基準

function resolveDiffBase(requestedBase: string | undefined): string {
  const isUsable = (sha: string | undefined): sha is string =>
    !!sha && sha.trim() !== '' && !/^0+$/.test(sha.trim());

  if (isUsable(requestedBase)) return requestedBase;

  // github.event.before 在「新分支第一次 push」時會是全 0 的 sha，這種情況沒有
  // 上一個 commit 可比，改用 git 的空樹物件當基準（等同於「這個 commit 的所有
  // 檔案都算變更」），而不是直接讓 git diff 失敗噴錯。
  try {
    execSync('git rev-parse HEAD~1', { stdio: 'pipe' });
    return 'HEAD~1';
  } catch {
    return EMPTY_TREE_SHA;
  }
}

function findChangedModules(base: string | undefined, head: string): ChangedModule[] {
  const diffBase = resolveDiffBase(base);

  let changedFiles: string[];
  try {
    // --relative：git diff --name-only 預設回傳「相對 repo 根目錄」的路徑，
    // 但這支腳本在 CI 裡是從 application/ 這個子目錄執行的（ci.yml 設了
    // working-directory: application），兩者對不上會導致下面 existsSync 全部
    // 落空、誤判成「沒有模組變更」——實測抓到過這個問題，不是理論上的邊界案例。
    const raw = execSync(`git diff --name-only --relative ${diffBase} ${head} -- modules/`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString('utf-8');
    changedFiles = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    console.error(`[CI Watcher] git diff 失敗（base=${diffBase} head=${head}）：${(err as Error).message}`);
    return [];
  }

  const changedDirs = Array.from(new Set(changedFiles.map((f) => path.dirname(f))));
  const modules: ChangedModule[] = [];

  for (const dir of changedDirs) {
    const readmePath = path.join(dir, 'README.md');
    if (!fss.existsSync(readmePath)) continue; // 這個模組資料夾這次改的不是 README.md 本身（例如只改了程式碼），沒有 frontmatter 可讀，略過

    try {
      const raw = fss.readFileSync(readmePath, 'utf-8');
      const { data } = matter(raw);
      const id = Number(data['id']);
      if (!Number.isFinite(id)) {
        console.warn(`[CI Watcher] ${readmePath} 的 frontmatter 沒有合法的 id，略過。`);
        continue;
      }
      modules.push({ moduleId: id, moduleName: String(data['name'] ?? `module-${id}`), readmePath });
    } catch (err) {
      console.warn(`[CI Watcher] 讀取 ${readmePath} frontmatter 失敗，略過：${(err as Error).message}`);
    }
  }

  return modules;
}

async function detectAndWriteback(args: Record<string, string>): Promise<void> {
  const status = (args['status'] as ModuleStatus) ?? 'DONE';
  const head = args['head'] ?? args['commit-sha'] ?? 'HEAD';
  const modules = findChangedModules(args['base'], head);

  if (modules.length === 0) {
    console.log('[CI Watcher] 這次 push 沒有偵測到 modules/ 底下的 README.md 變更，略過 writeback。');
    return;
  }

  console.log(`[CI Watcher] 偵測到 ${modules.length} 個模組有變更：${modules.map((m) => `#${m.moduleId}(${m.moduleName})`).join(', ')}`);

  for (const m of modules) {
    await writebackResult({
      moduleId:    m.moduleId,
      moduleName:  m.moduleName,
      status,
      latency:     args['latency'] ?? '~?ms',
      testsPassed: Number(args['pass'] ?? 0),
      testsFailed: Number(args['fail'] ?? 0),
      capturedAt:  new Date().toISOString(),
      notes:       args['notes'] ?? (args['commit-sha'] ? `commit ${args['commit-sha']}` : undefined),
    });
  }
}

// ── CLI entry (ESM-compatible) ────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => {
        const eqIdx = a.indexOf('=');
        return eqIdx > 0
          ? [a.slice(2, eqIdx), a.slice(eqIdx + 1)]
          : [a.slice(2), 'true'];
      })
  ) as Record<string, string>;

  if (args['detect-changed']) {
    await detectAndWriteback(args);
    return;
  }

  if (!args['module'] || !args['status']) {
    console.error(
      'Usage:\n' +
      '  npm run ci-writeback -- --module=<id> --status=<DONE|WIP|BLOCKED> ' +
      '[--latency=~Xms] [--name=<moduleName>] [--pass=N] [--fail=N]\n' +
      '  npm run ci-writeback -- --detect-changed --base=<sha> --head=<sha> --status=<DONE|WIP|BLOCKED>'
    );
    process.exit(1);
  }

  await writebackResult({
    moduleId:    Number(args['module']),
    moduleName:  args['name']    ?? `module-${args['module']}`,
    status:      args['status']  as ModuleStatus,
    latency:     args['latency'] ?? '~?ms',
    testsPassed: Number(args['pass'] ?? 0),
    testsFailed: Number(args['fail'] ?? 0),
    capturedAt:  new Date().toISOString(),
    notes:       args['notes'],
  });
}

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('ci-watcher');
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}