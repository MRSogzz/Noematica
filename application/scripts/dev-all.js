#!/usr/bin/env node
/**
 * scripts/dev-all.js
 * 
 * 跨平台啟動腳本：
 * - 在背景啟動 Python Epistemic 服務（integration/epistemic_adapter/http_server.py）
 * - 等待健康檢查通過後，啟動 Node 後端（npm run dev）
 * 
 * 用法：
 *   node scripts/dev-all.js
 *   或透過 npm run dev:all（需先修改 package.json）
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 取得 __dirname（ES Module 相容）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// 設定區
// ============================================================

// Python 服務的相對路徑（相對於專案根目錄）
const PYTHON_SCRIPT_REL = 'integration/epistemic_adapter/http_server.py';

// 環境變數（可透過 .env 或命令列覆蓋）
const EPISTEMIC_PORT = process.env.EPISTEMIC_PORT || 8765;
const NODE_PORT = process.env.PORT || 3001;

// 根據作業系統決定 python 命令
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

// ============================================================
// 路徑解析
// ============================================================

// scripts/ 的上一層是 application/
const applicationRoot = path.resolve(__dirname, '..');
// application/ 的上一層是專案根目錄（my-knowledge-repo）
const projectRoot = path.resolve(applicationRoot, '..');

// Python 腳本的完整絕對路徑
const PYTHON_SCRIPT = path.join(projectRoot, PYTHON_SCRIPT_REL);

// ============================================================
// 程序管理
// ============================================================

let pythonProcess = null;
let nodeProcess = null;

function cleanup() {
  console.log('\n[dev-all] 關閉服務...');
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
  if (nodeProcess) {
    nodeProcess.kill('SIGTERM');
    nodeProcess = null;
  }
  process.exit(0);
}

// 捕捉中斷信號
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// ============================================================
// 啟動 Python 服務
// ============================================================

async function startPython() {
  console.log(`[dev-all] 啟動 Epistemic 服務（Python, port ${EPISTEMIC_PORT}）...`);
  console.log(`[dev-all] 專案根目錄: ${projectRoot}`);
  console.log(`[dev-all] Python 腳本: ${PYTHON_SCRIPT}`);

  pythonProcess = spawn(PYTHON_CMD, [PYTHON_SCRIPT], {
    cwd: projectRoot,              // ← 關鍵：設定為專案根目錄
    stdio: 'inherit',              // ← 將 Python 輸出顯示在終端機
    shell: true,
    env: {
      ...process.env,
      EPISTEMIC_PORT: String(EPISTEMIC_PORT),
    },
  });

  pythonProcess.on('error', (err) => {
    console.error('[dev-all] Python 啟動失敗:', err.message);
    cleanup();
  });

  // 等待健康檢查（最多嘗試 30 次，每次等待 1 秒，總計 30 秒）
  const healthUrl = `http://127.0.0.1:${EPISTEMIC_PORT}/health`;
  console.log(`[dev-all] 等待健康檢查: ${healthUrl}`);

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log('[dev-all] Epistemic 服務就緒。');
        return;
      }
    } catch (_) {
      // 忽略錯誤，繼續等待
    }
    // 每 5 次印出一次等待訊息，避免洗版
    if (i % 5 === 0) {
      console.log(`[dev-all] 等待中... (${i + 1}/30)`);
    }
    await sleep(1000);
  }

  console.warn('[dev-all] 警告：Epistemic 服務健康檢查未通過（可能啟動較慢），但繼續啟動 Node...');
}

// ============================================================
// 啟動 Node 後端
// ============================================================

function startNode() {
  console.log(`[dev-all] 啟動 Node 後端（port ${NODE_PORT}）...`);
  console.log(`[dev-all] 工作目錄: ${applicationRoot}`);

  nodeProcess = spawn('npm', ['run', 'dev'], {
    cwd: applicationRoot,          // Node 在 application/ 下執行
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: String(NODE_PORT),
    },
  });

  nodeProcess.on('error', (err) => {
    console.error('[dev-all] Node 啟動失敗:', err.message);
    cleanup();
  });
}

// ============================================================
// 主流程
// ============================================================

(async function main() {
  try {
    await startPython();
    startNode();
  } catch (err) {
    console.error('[dev-all] 啟動過程發生錯誤:', err);
    cleanup();
  }
})();