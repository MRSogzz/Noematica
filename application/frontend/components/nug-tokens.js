/* ============================================================
   nug-tokens.js — NUG（Noematica UI Grammar）映射表的程式碼版本
   ============================================================
   NUG.md 定義「哪個知識概念該傳達什麼視覺語意」，這個檔案是那份文件的
   程式碼落地——每個元件都從這裡 import 判斷邏輯，不要在元件內部各自
   複製一份 if/else 門檻判斷。NUG.md §4 講得很清楚：分級門檻以後要調，
   只能改一個地方，不能三個元件各自寫一份。這裡就是那「一個地方」。

   色碼數值對應 NDL.md §2.4（語意色）跟 §2.3（識別色），如果 NDL 那邊的
   色碼調整了，這裡要跟著改；反過來這裡不該出現 NDL 文件裡沒有的顏色。
   ============================================================ */

// ── NUG §4：Confidence 分級門檻（數值來源：runtime/policy/policy.yaml 的
//    activation_queue，跟後端 confidence_engine.py 判斷用的是同一組數字，
//    前端這裡只是把它也變成一份可查的程式碼常數，不是重新定義）──────────
export const CONFIDENCE_TIERS = Object.freeze({
  STRONG_MIN: 0.70,
  MEDIUM_MIN: 0.40,
  WEAK_MIN: 0.15,
});

export function confidenceTier(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'unknown';
  if (value >= CONFIDENCE_TIERS.STRONG_MIN) return 'strong';
  if (value >= CONFIDENCE_TIERS.MEDIUM_MIN) return 'medium';
  if (value >= CONFIDENCE_TIERS.WEAK_MIN) return 'weak';
  return 'hidden';
}

// NDL §2.4 語意色（正向/警示/弱/中性/危险），這裡只挑 Confidence 分級會用到的四個
export const TIER_COLOR = Object.freeze({
  strong: '#4ade80',
  medium: '#fbbf24',
  weak: '#60a5fa',
  hidden: 'transparent',   // Hidden 不呈現，見 NUG §4
  unknown: '#94a3b8',
});

export const TIER_LABEL = Object.freeze({
  strong: '強', medium: '中', weak: '弱', hidden: '隱藏', unknown: '未知',
});

// ── NUG §3：Observation 立場 ─────────────────────────────────────────
export const STANCE_COLOR = Object.freeze({
  support: '#4ade80',      // 正向語意色，跟 strong 共用同一個綠（NUG §5 強調這是刻意的）
  contradict: '#f87171',   // 負向語意色
  neutral: '#94a3b8',      // 中性灰，刻意不用 weak 的藍色，見 NUG §3 規則
});

export const STANCE_LABEL = Object.freeze({
  support: '支持', contradict: '反對', neutral: '中立',
});

export function normalizeStance(stance) {
  return (stance === 'support' || stance === 'contradict') ? stance : 'neutral';
}

// ── NUG §2：Atom 類型 → 推論可靠度 → 視覺確定感 ───────────────────────
// derived_cap 數值來源：runtime/policy/policy.yaml 的 confidence_decay.derived_cap，
// 這裡沿用同一組數字，但用途不同：後端拿去做信心計算的乘法因子，
// 前端這裡只拿它排視覺確定感的相對順序（實/虛/粗/細），不直接當顏色用
// （顏色維度留給 Confidence，見 NUG §2 的核心規則）。
export const ATOM_TYPE_RELIABILITY = Object.freeze({
  definition: 0.95, constraint: 0.85, causal: 0.60,
  correlation: 0.50, heuristic: 0.45, analogy: 0.35,
});

export const ATOM_TYPE_LABEL = Object.freeze({
  definition: '定義', constraint: '限制', causal: '因果',
  correlation: '相關', heuristic: '經驗法則', analogy: '類比',
});

// 視覺確定感分成 4 級（實線粗 → 虛線細），對應 NUG §2 表格的 5 種類型排序，
// definition/constraint 兩種最高可靠度的類型共用「最確定」這一級。
export function atomLineStyle(atomType) {
  const r = ATOM_TYPE_RELIABILITY[atomType] ?? 0.5;
  if (r >= 0.85) return { width: 3, dash: 'none', opacity: 1 };
  if (r >= 0.60) return { width: 2.5, dash: 'none', opacity: 0.92 };
  if (r >= 0.50) return { width: 2, dash: '6,4', opacity: 0.85 };
  if (r >= 0.45) return { width: 1.5, dash: '4,4', opacity: 0.7 };
  return { width: 1, dash: '2,4', opacity: 0.55 };
}

// ── NUG §1：Entity 類型 → 視覺形象（圖示 motif，不編碼顏色，見 NUG §1 規則）──
export const ENTITY_TYPE_ICON = Object.freeze({
  concept: '💡', metric: '📊', problem: '⚠️', process: '⚙️',
  technique: '🔧', company: '🏢', macro_variable: '📈', unknown: '❔',
});

export function normalizeEntityType(type) {
  const key = String(type || '').toLowerCase();
  return ENTITY_TYPE_ICON[key] ? key : 'unknown';
}

// ── NDL §2.3：識別色（僅供需要對照功能招牌色的元件使用，一般 NUG 元件用不到）──
export const IDENTITY_COLOR = Object.freeze({
  f1: '#E8C873', f2: '#4fc3f7', f3: '#f472b6', f4: '#F5A623',
  f5: '#A97FE8', h: '#4ECDC4', m: '#a78bfa', esc: '#94a3b8',
});
