/**
 * wiki epistemic — 認知核心查詢（epistemic/ + runtime/，透過 Node 後端代理到 Python 服務）
 * 儲存位置：epistemic/（Python，經 /api/epistemic/* 代理）
 *
 * 子命令：
 *   query <text>     查詢知識（Query Contract → Belief Contract）
 *   feedback         對某筆 Observation 送出反饋（Feedback Contract）
 *   extract          把筆記文字丟給 LLM，抽取候選 Entity/Atom/Observation 寫進 0_Inbox/（未核准）
 *   correlate        分析兩篇筆記的關聯程度（實體重疊/圖距離/立場），夠高才產生 0_Inbox/ 提案
 *   health           檢查 Python epistemic 服務是否連線正常
 *
 * 選項（query）：
 *   --atom <uid>      直接指定 Atom uid，略過關鍵字比對
 *   --context <json>  五維情境 JSON，例如 '{"monetary_policy":{"value":"tightening","confidence":0.8}}'
 *
 * 選項（feedback）：
 *   --target <obs_uid>  必填，被反饋的 Observation uid
 *   --signal <signal>   必填，low_confidence | high_confidence | irrelevant | outdated | wrong
 *   --note <text>       選填，自由文字說明
 *
 * 選項（extract，--note 和 --text 二選一）：
 *   --note <filename>  從 .system/user/notes/ 讀取一篇既有筆記（F1 個人日誌）
 *   --text <text>      直接傳文字，不用先存成筆記
 *   --title <title>    選填，草稿的標題（預設用文字前 30 字）
 *   --date <date>      選填，YYYY-MM-DD（預設今天）
 *
 * 用法（correlate）：
 *   wiki epistemic correlate <noteA檔名> <noteB檔名>
 *   兩個都從 .system/user/notes/ 讀取；分數超過門檻會在 0_Inbox/ 產生提案。
 *
 * 選項（extract / correlate 共用，決定用哪個 LLM——不指定的話 Python 端預設走 Anthropic）：
 *   --provider <name>       anthropic | openai | llama | custom
 *   --llama-host <url>      provider=llama 時，預設 http://127.0.0.1
 *   --llama-port <port>     provider=llama 時，預設 8080
 *   --custom-base-url <url> provider=custom 時必填
 *   --custom-model <name>   provider=custom 時選填
 *   --custom-api-key <key>  provider=custom 時選填
 *
 * 用法（inbox，審查 0_Inbox/ 草稿；前端 M 面板也有一樣的功能，見「📋 審查 0_Inbox 草稿」）：
 *   wiki epistemic inbox list                    列出所有待審查/已核准的草稿
 *   wiki epistemic inbox approve <filename>       核准（還要另外跑 compile 才會真的生效）
 *   wiki epistemic inbox reject <filename> [--reason "..."]   拒絕，搬進 6_Rejected/
 *   wiki epistemic inbox compile                  觸發 Compiler，編譯所有已核准的草稿
 */

import fs from 'fs/promises';
import path from 'path';
import { parseArgs, apiCall, NOTES_DIR } from '../utils/api.js';
import { printBanner, printInfo, printError, printWarn, printOk, color } from '../utils/print.js';

/** 從 --provider 等旗標組出 ai_config，跟前端設定頁存在 localStorage 的形狀一致。
 * 沒有 --provider 時回傳 undefined，讓 Python 端用它自己的預設值（anthropic）。 */
function buildAiConfig(flags: Record<string, string | boolean>): object | undefined {
  const provider = flags['provider'] as string | undefined;
  if (!provider) return undefined;
  return {
    ai_provider:     provider,
    llama_host:      flags['llama-host'] as string | undefined,
    llama_port:      flags['llama-port'] as string | undefined,
    custom_base_url: flags['custom-base-url'] as string | undefined,
    custom_model:    flags['custom-model'] as string | undefined,
    custom_api_key:  flags['custom-api-key'] as string | undefined,
  };
}

export async function epistemicCmd(args: string[]) {
  const [sub, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {

    case 'query': {
      const text = positional.join(' ');
      const atom = flags['atom'] as string | undefined;
      if (!text && !atom) {
        printError('請提供查詢文字或 --atom <uid>。wiki epistemic query "升息對銀行獲利的影響"');
        return;
      }
      let context: object = {};
      if (flags['context']) {
        try { context = JSON.parse(String(flags['context'])); }
        catch { printError('--context 不是合法 JSON'); return; }
      }

      printBanner('Epistemic Query');
      printInfo(`query="${text}"  atom=${atom ?? '(未指定)'}`);
      try {
        const belief = await apiCall('POST', '/api/epistemic/query', { query: text, atom: atom ?? null, context });

        if (belief.abstained) {
          printWarn(`系統棄權：${belief.abstain_reason}`);
          printInfo('目前證據不足以支撐可靠回答，可以放寬 --context 或換個 --atom 再試。');
          return;
        }

        printOk(`不確定性（uncertainty）：${belief.uncertainty}`);
        if (belief.support?.length) {
          console.log(`\n  ${color.green('[支持]')}`);
          belief.support.forEach((s: any) => console.log(`    - ${s.obs}（信心 ${s.confidence}）`));
        }
        if (belief.contradiction?.length) {
          console.log(`\n  ${color.red('[反駁]')}`);
          belief.contradiction.forEach((c: any) => console.log(`    - ${c.obs}（信心 ${c.confidence}）`));
        }
        if (belief.baseline?.length) {
          console.log(`\n  ${color.dim('[歷史基線]')}`);
          belief.baseline.forEach((b: any) => console.log(`    - ${b.obs}（信心 ${b.confidence}）`));
        }
        console.log();
      } catch (e: any) {
        printError('查詢失敗：' + e.message);
        printInfo('確認 Python epistemic 服務有跑起來：python3 integration/epistemic_adapter/http_server.py');
      }
      break;
    }

    case 'feedback': {
      const target = flags['target'] as string | undefined;
      const signal = flags['signal'] as string | undefined;
      const note   = flags['note'] as string | undefined;
      if (!target || !signal) {
        printError('需要 --target <obs_uid> 與 --signal <signal>');
        printInfo('signal 可選值：low_confidence | high_confidence | irrelevant | outdated | wrong');
        return;
      }
      try {
        const result = await apiCall('POST', '/api/epistemic/feedback', {
          type: 'feedback', target, signal, note: note ?? '',
        });
        printOk(`已記錄反饋 → ${result.path}`);
      } catch (e: any) {
        printError('送出反饋失敗：' + e.message);
      }
      break;
    }

    case 'extract': {
      const noteFile = flags['note'] as string | undefined;
      const inlineText = flags['text'] as string | undefined;
      const title = flags['title'] as string | undefined;
      const date = flags['date'] as string | undefined;

      if (!noteFile && !inlineText) {
        printError('需要 --note <filename>（讀 .system/user/notes/ 底下的筆記）或 --text <text>（直接輸入）');
        printInfo('例：wiki epistemic extract --note 2026-07-16.md');
        printInfo('例：wiki epistemic extract --text "升息可能讓半導體資本支出轉趨保守" --title "投資筆記"');
        return;
      }

      let text = inlineText ?? '';
      let derivedTitle = title;
      if (noteFile) {
        const notePath = path.join(NOTES_DIR, noteFile);
        try {
          text = await fs.readFile(notePath, 'utf-8');
        } catch {
          printError(`讀不到筆記：${notePath}`);
          printInfo('用 wiki note ls 看看有哪些筆記檔名。');
          return;
        }
        derivedTitle = derivedTitle ?? noteFile.replace(/\.md$/, '');
      }

      printBanner('Epistemic Extract — 筆記 → 候選知識草稿');
      printInfo(`來源：${noteFile ? `筆記檔 ${noteFile}` : '直接輸入文字'}`);
      printWarn('這一步只會產生「未核准」的草稿，不會自動變成正式知識庫的一部分。');

      const aiConfig = buildAiConfig(flags);
      if (aiConfig) printInfo(`LLM provider：${(aiConfig as any).ai_provider}`);

      try {
        const result = await apiCall('POST', '/api/epistemic/extract', {
          text, title: derivedTitle, date, ai_config: aiConfig,
        });

        const c = result.created ?? {};
        printOk(`抽取完成：新建 Entity ${c.entity?.length ?? 0} 筆、Atom ${c.atom?.length ?? 0} 筆、` +
                `Observation ${c.observation?.length ?? 0} 筆、Source ${c.source?.length ?? 0} 筆`);
        if (result.warnings?.length) {
          console.log(`\n  ${color.dim('[警告]')}`);
          result.warnings.forEach((w: string) => console.log(`    - ${w}`));
        }
        console.log();
        printInfo(`摘要檔案：${result.summary}`);
        printInfo('下一步：打開 epistemic/0_Inbox/ 底下這批 draft_*.md 逐一審查，覺得沒問題的把');
        printInfo('  approved: false 改成 approved: true，然後跑 python3 runtime/compiler/compiler.py');
      } catch (e: any) {
        printError('抽取失敗：' + e.message);
        printInfo('最常見原因：Python 服務沒設定 ANTHROPIC_API_KEY，或 Python 服務根本沒開。');
      }
      break;
    }

    case 'correlate': {
      const [noteA, noteB] = positional;
      if (!noteA || !noteB) {
        printError('需要兩個筆記檔名：wiki epistemic correlate <noteA> <noteB>');
        printInfo('用 wiki note ls 看看有哪些筆記檔名。');
        return;
      }

      let textA: string, textB: string;
      try {
        textA = await fs.readFile(path.join(NOTES_DIR, noteA), 'utf-8');
        textB = await fs.readFile(path.join(NOTES_DIR, noteB), 'utf-8');
      } catch (e: any) {
        printError('讀不到筆記檔案：' + e.message);
        return;
      }

      printBanner('Epistemic Correlate — 兩篇筆記的關聯分析');
      printInfo(`A：${noteA}  ×  B：${noteB}`);

      const aiConfig = buildAiConfig(flags);
      if (aiConfig) printInfo(`LLM provider：${(aiConfig as any).ai_provider}`);

      try {
        const result = await apiCall('POST', '/api/epistemic/correlate', {
          text_a: textA, title_a: noteA.replace(/\.md$/, ''), source_a: noteA,
          text_b: textB, title_b: noteB.replace(/\.md$/, ''), source_b: noteB,
          ai_config: aiConfig,
        });

        const d = result.dimensions;
        console.log(`  實體重疊度: ${d.entity_overlap.score}` +
                    (d.entity_overlap.intersection.length ? `（交集：${d.entity_overlap.intersection.join(', ')}）` : ''));
        console.log(`  認知圖距離: ${d.graph_distance.score}` +
                    (d.graph_distance.anchor_a ? `（${d.graph_distance.anchor_a} ↔ ${d.graph_distance.anchor_b}，${d.graph_distance.distance} 跳）` : '（無可比較的實體）'));
        console.log(`  立場關係: ${d.stance.label ?? '（無法判斷）'}` +
                    (d.stance.reasoning ? `（${d.stance.reasoning}）` : ''));
        if (result.stance_error) printWarn(result.stance_error);
        console.log();
        printOk(`綜合分數：${result.total_score}（門檻 ${result.proposal_threshold}）`);

        if (result.proposal.proposed) {
          printOk(`已產生提案（${result.proposal.kind}）→ ${result.proposal.path}`);
          printInfo('打開檔案審查，覺得沒問題就把 approved 改成 true，再跑 Compiler。');
        } else {
          printInfo(`未產生提案：${result.proposal.reason}`);
        }
      } catch (e: any) {
        printError('分析失敗：' + e.message);
      }
      break;
    }

    case 'inbox': {
      const [action, filename] = positional;
      if (!action) {
        printError('需要子指令：list | approve <filename> | reject <filename> | compile');
        return;
      }

      if (action === 'list') {
        try {
          const result = await apiCall('GET', '/api/epistemic/inbox');
          const drafts = result.drafts ?? [];
          if (!drafts.length) { printInfo('0_Inbox/ 目前沒有待審查的草稿。'); return; }
          printBanner(`0_Inbox 草稿（${drafts.length} 筆）`);
          for (const d of drafts) {
            const status = d.approved ? color.green('✔ 已核准') : color.dim('待審查');
            console.log(`  [${d.draft_type}] ${d.summary}  ${status}  (${d.filename})`);
          }
        } catch (e: any) { printError('列表失敗：' + e.message); }
        return;
      }

      if (action === 'approve') {
        if (!filename) { printError('需要檔名：wiki epistemic inbox approve <filename>'); return; }
        try {
          await apiCall('POST', `/api/epistemic/inbox/${encodeURIComponent(filename)}/approve`);
          printOk(`已核准：${filename}（還要跑 wiki epistemic inbox compile 才會真的編譯）`);
        } catch (e: any) { printError('核准失敗：' + e.message); }
        return;
      }

      if (action === 'reject') {
        if (!filename) { printError('需要檔名：wiki epistemic inbox reject <filename>'); return; }
        const reason = flags['reason'] as string | undefined;
        try {
          const result = await apiCall('POST', `/api/epistemic/inbox/${encodeURIComponent(filename)}/reject`, { reason: reason ?? '' });
          printOk(`已拒絕：${filename} → ${result.rejected_to}`);
        } catch (e: any) { printError('拒絕失敗：' + e.message); }
        return;
      }

      if (action === 'compile') {
        try {
          const result = await apiCall('POST', '/api/epistemic/compile');
          printOk(`編譯完成：成功 ${result.compiled?.length ?? 0} 筆，失敗 ${result.rejected?.length ?? 0} 筆`);
          for (const [uid, missing] of (result.rejected ?? [])) {
            printError(`  ✘ ${uid}：缺 ${Array.isArray(missing) ? missing.join(', ') : missing}`);
          }
        } catch (e: any) { printError('編譯失敗：' + e.message); }
        return;
      }

      printError(`未知的 inbox 子指令：${action}`);
      break;
    }

    case 'health': {
      try {
        const h = await apiCall('GET', '/api/epistemic/health');
        printOk(`Epistemic 服務連線正常（${JSON.stringify(h)}）`);
      } catch (e: any) {
        printError('Epistemic 服務無法連線：' + e.message);
        printInfo('啟動它：python3 integration/epistemic_adapter/http_server.py');
      }
      break;
    }

    default:
      printError(`未知子命令：${sub ?? '(無)'}`);
      printInfo('可用子命令：query | feedback | extract | correlate | inbox | health');
  }
}
