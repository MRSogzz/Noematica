/**
 * LLM WIKI — Metadata Parser Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * 職責：監聽 modules/ 與 docs/ 目錄的 Markdown 檔案變更，
 *       即時解析 YAML Front Matter 與 I/O JSON Code Block，
 *       並將解析結果更新至記憶體索引（持久化至 .system/index.json）。
 *
 * 技術選型：
 *   - chokidar    (file watcher)
 *   - gray-matter (YAML Front Matter parser)
 *   - remark + remark-parse (Markdown AST)
 */

import chokidar from 'chokidar';
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleStatus = 'DONE' | 'WIP' | 'BLOCKED';
export type IOType = 'STR' | 'INT' | 'FLOAT' | 'BOOL' | 'ARR' | 'OBJ' | 'ANY' | 'NUM';

export interface IOSchema {
  type: IOType;
  description?: string;
  example?: unknown;
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
  items?: { type: string };
}

export interface ModuleMeta {
  id: number;
  name: string;
  status: ModuleStatus;
  latency: string;
  author: string;
  created: string;
  updated: string;
  tags: string[];
  filePath: string;
  input: IOSchema;
  output: IOSchema;
  description: string;
}

// ── In-memory index ───────────────────────────────────────────────────────────

const moduleIndex = new Map<number, ModuleMeta>();
const INDEX_PATH  = path.resolve('.system/index.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts a JSON code block tagged with //INPUT or //OUTPUT from Markdown body.
 *
 * Matches:
 *   ```json //INPUT
 *   { ... }
 *   ```
 */
function extractIOBlock(body: string, tag: '//INPUT' | '//OUTPUT'): IOSchema | null {
  const escaped = tag.replace(/\//g, '\\/');
  const regex   = new RegExp('```json\\s+' + escaped + '\\s*\\n([\\s\\S]*?)\\n```', 'i');
  const match   = body.match(regex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]!.trim()) as IOSchema;
  } catch (err) {
    console.warn(`[Parser] Failed to parse ${tag} block:`, err);
    return null;
  }
}

/**
 * Extracts a plain-text description from the first paragraph of the Markdown body.
 */
function extractDescription(body: string): string {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(body) as any;
  const firstPara = tree.children?.find((n: any) => n.type === 'paragraph');
  if (!firstPara) return '';
  return (firstPara.children as any[])
    ?.filter((n: any) => n.type === 'text')
    .map((n: any) => n.value as string)
    .join('') ?? '';
}

// ── Core parse function ───────────────────────────────────────────────────────

export async function parseModuleFile(filePath: string): Promise<ModuleMeta | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const { data: fm, content: body } = matter(raw);

  if (!fm['id'] || !fm['name']) {
    console.warn(`[Parser] Missing required YAML fields (id, name) in: ${filePath}`);
    return null;
  }

  const input  = extractIOBlock(body, '//INPUT');
  const output = extractIOBlock(body, '//OUTPUT');

  if (!input || !output) {
    console.warn(`[Parser] Missing //INPUT or //OUTPUT block in: ${filePath}`);
    return null;
  }

  return {
    id:          Number(fm['id']),
    name:        String(fm['name']),
    status:      (fm['status'] as ModuleStatus) ?? 'WIP',
    latency:     String(fm['latency'] ?? '~?ms'),
    author:      String(fm['author']  ?? 'unknown'),
    created:     String(fm['created'] ?? ''),
    updated:     String(fm['updated'] ?? ''),
    tags:        Array.isArray(fm['tags']) ? fm['tags'] as string[] : [],
    filePath,
    input,
    output,
    description: extractDescription(body),
  };
}

// ── Index persistence ─────────────────────────────────────────────────────────

async function persistIndex(): Promise<void> {
  const snapshot = Object.fromEntries(moduleIndex);
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
}

async function loadPersistedIndex(): Promise<void> {
  try {
    const raw  = await fs.readFile(INDEX_PATH, 'utf-8');
    const data = JSON.parse(raw) as Record<string, ModuleMeta>;
    for (const meta of Object.values(data)) {
      moduleIndex.set(meta.id, meta);
    }
    console.log(`[Parser] Loaded ${moduleIndex.size} modules from index cache.`);
  } catch {
    console.log('[Parser] No index cache — starting fresh.');
  }
}

// ── File event handlers ───────────────────────────────────────────────────────

async function handleFileChange(filePath: string): Promise<void> {
  if (!filePath.endsWith('.md')) return;
  console.log(`[Parser] Processing: ${filePath}`);
  const meta = await parseModuleFile(filePath);
  if (meta) {
    moduleIndex.set(meta.id, meta);
    console.log(`[Parser] ✓ Indexed #${meta.id} (${meta.name}) — ${meta.status}`);
    await persistIndex();
  }
}

async function handleFileDelete(filePath: string): Promise<void> {
  for (const [id, meta] of moduleIndex.entries()) {
    if (meta.filePath === filePath) {
      moduleIndex.delete(id);
      console.log(`[Parser] Removed module #${id} from index.`);
      await persistIndex();
      break;
    }
  }
}

// ── Watcher bootstrap ─────────────────────────────────────────────────────────

const WATCH_PATHS = ['modules/**/README.md', 'docs/**/*.md'];

export async function startParser(): Promise<void> {
  await loadPersistedIndex();

  const watcher = chokidar.watch(WATCH_PATHS, {
    persistent:       true,
    ignoreInitial:    false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher
    .on('add',    (p) => void handleFileChange(p))
    .on('change', (p) => void handleFileChange(p))
    .on('unlink', (p) => void handleFileDelete(p))
    .on('ready',  () => console.log('[Parser] Watching for Markdown changes…'));

  process.on('SIGINT', async () => {
    await watcher.close();
    console.log('[Parser] Watcher stopped.');
    process.exit(0);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getModuleIndex(): Map<number, ModuleMeta> { return moduleIndex; }

export function getModuleById(id: number): ModuleMeta | undefined {
  return moduleIndex.get(id);
}

export function searchModules(query: string): ModuleMeta[] {
  const q = query.toLowerCase();
  return [...moduleIndex.values()].filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q))
  );
}

// ── One-shot validation mode（CI 用，--validate-only）──────────────────────────
//
// 跟 startParser() 的差異：不用 chokidar，改成單純遞迴掃目錄一次就結束，
// 不會撐住 event loop；而且格式不合規時會真的 exit(1)，不是只有 console.warn
// （原本即使沒有 hang 住，也從來沒有真的擋過任何東西）。
//
// 刻意不沿用 chokidar 做一次性掃描：chokidar 3.x 在 persistent:false 搭配
// glob pattern 時，'ready' 事件跟初始掃描完成的順序沒有保證——只要建立 watcher
// 前多一個 await（例如這裡的 loadPersistedIndex()），'ready' 就可能搶在檔案被
// 掃到之前觸發，導致漏判整批檔案（實測會重現）。watcher 本來就是為「持續監聽」
// 設計的，拿來做「跑一次就結束」的驗證是拿錯工具，不是加參數調一調就能穩定。
async function walkFiles(dir: string): Promise<string[]> {
  let entries: fss.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function findValidationTargets(): Promise<string[]> {
  // 對應原本 WATCH_PATHS 的兩條規則：modules/**/README.md、docs/**/*.md
  const moduleFiles = (await walkFiles('modules')).filter((f) => path.basename(f) === 'README.md');
  const docFiles = (await walkFiles('docs')).filter((f) => f.endsWith('.md'));
  return [...moduleFiles, ...docFiles];
}

async function runValidateOnce(): Promise<void> {
  await loadPersistedIndex();

  const targets = await findValidationTargets();
  if (targets.length === 0) {
    console.warn('[Parser] --validate-only 沒有掃到任何 Markdown 檔案，請確認 MODULES_DIR / DOCS_DIR 有沒有指對路徑。');
  }

  let hasError = false;
  for (const filePath of targets) {
    const meta = await parseModuleFile(filePath);
    if (meta) {
      console.log(`[Parser] ✓ ${filePath} — schema OK (#${meta.id} ${meta.name})`);
    } else {
      hasError = true;
      console.error(`[Parser] ✗ ${filePath} — 缺少必要 YAML 欄位（id/name）或 //INPUT //OUTPUT block`);
    }
  }

  if (hasError) {
    console.error('[Parser] --validate-only 發現不合規的模組，CI 應該擋下這次合併。');
    process.exit(1);
  }
  console.log('[Parser] --validate-only 全部模組通過 schema 檢查。');
  process.exit(0);
}

// ── CLI entry (ESM-compatible) ────────────────────────────────────────────────

const isMain = process.argv[1] && fss.realpathSync(process.argv[1]).includes('metadata-parser');
if (isMain) {
  if (process.argv.includes('--validate-only')) {
    runValidateOnce().catch((err) => { console.error(err); process.exit(1); });
  } else {
    startParser().catch(console.error);
  }
}