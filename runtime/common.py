"""
common.py — 共用工具：Markdown+YAML frontmatter 解析、知識庫掃描。
放在 runtime/ 根目錄，供 runtime/{compiler,indexer,activation,policy,reasoning}/*.py
以及 integration/epistemic_adapter/*.py 匯入。
各子模組匯入方式：
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
    from common import ...
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from datetime import date, datetime
from dateutil import parser as dateparser  # python-dateutil
import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


def find_repo_root(start: Path | None = None) -> Path:
    """從 start 往上找到含有 epistemic/ 與 runtime/ 兩個資料夾的 monorepo 根目錄。"""
    p = (start or Path(__file__).resolve().parent).resolve()
    for candidate in [p] + list(p.parents):
        if (candidate / "epistemic").is_dir() and (candidate / "runtime").is_dir():
            return candidate
    raise FileNotFoundError("找不到 repo 根目錄（未同時發現 epistemic/ 與 runtime/）")


def find_kb_root(start: Path | None = None) -> Path:
    """回傳 epistemic/ 的路徑（原本叫 kb_root，保留這個名字以相容舊呼叫端）。"""
    repo_root = find_repo_root(start)
    kb_root = repo_root / "epistemic"
    if not (kb_root / "8_Governance.md").exists():
        raise FileNotFoundError(f"epistemic/ 底下找不到 8_Governance.md: {kb_root}")
    return kb_root


def load_policy(kb_root: Path) -> dict:
    """kb_root 是 epistemic/ 路徑；policy.yaml 實際放在 ../runtime/policy/policy.yaml。"""
    repo_root = kb_root.parent
    policy_path = repo_root / "runtime" / "policy" / "policy.yaml"
    with open(policy_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_md(path: Path) -> tuple[dict, str]:
    """解析單一 .md 檔，回傳 (frontmatter_dict, body_text)。若無 frontmatter，回傳 ({}, 全文)。"""
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    fm_raw, body = m.group(1), m.group(2)
    try:
        fm = yaml.safe_load(fm_raw) or {}
    except yaml.YAMLError as e:
        print(f"[WARN] frontmatter 解析失敗: {path} -> {e}", file=sys.stderr)
        fm = {}
    return fm, body


def scan_layer(kb_root: Path, dirname: str) -> list[tuple[Path, dict, str]]:
    """掃描某一層目錄下所有 .md 檔案，回傳 [(path, frontmatter, body), ...]。跳過範本與空檔。"""
    layer_dir = kb_root / dirname
    results = []
    if not layer_dir.exists():
        return results
    for p in sorted(layer_dir.glob("*.md")):
        fm, body = parse_md(p)
        if not fm:
            continue
        results.append((p, fm, body))
    return results


# ============================================================
# 索引讀取（runtime/indexer/index_builder.py 產生的 .index/generated/*.tsv）
# ============================================================
#
# scan_layer() 每次呼叫都會重新掃整個目錄、逐檔讀取 + 解析 YAML frontmatter——
# 知識庫還小的時候沒差，但查詢路徑（adapter.py 每個 handler）幾乎都是每個 request
# 呼叫好幾次 scan_layer()，知識庫大了之後這會變成每個 request 都重新解析整個
# 知識庫。load_indexed_layer() 優先讀預先攤平好的 TSV 索引，只有在索引不存在、
# 或明顯比來源目錄舊（代表沒有重建過，例如沒裝 pre-commit hook）時，才 fallback
# 回 scan_layer() 全量重掃——寧可退回較慢但保證正確的路徑，也不要讓查詢在
# 使用者沒發現的情況下靜默吃到舊資料。
#
# 已知限制：這個新鮮度判斷只用「來源目錄裡最新檔案的 mtime」跟「索引檔案的
# mtime」比較，抓得到「新增/修改檔案後沒重建索引」，抓不到「刪除檔案後沒重建
# 索引」（剩下的檔案 mtime 不會變新）。這個系統裡 Atom 不可變、Observation
# 只增不刪，Entity 偶爾編輯但很少真的刪除，這個不對稱在目前的使用模式下風險
# 很低；如果之後真的需要支援刪除即時反映，要換成雜湊比對或直接記錄檔案數量。
#
# TSV 是攤平過的 frontmatter 投影，不含 Markdown 全文——回傳的 body 一律是
# None。極少數需要全文的呼叫端（例如 Entity 描述摘要）不該因為要顯示幾筆
# 描述又把整層重掃一次，改成只對「這次真的要顯示的那幾筆」呼叫 parse_md()
# 現讀單一檔案，見 integration/epistemic_adapter/adapter.py 的用法。
def load_indexed_layer(kb_root: Path, dirname: str, index_filename: str,
                        hydrate) -> list[tuple[Path, dict, None]]:
    layer_dir = kb_root / dirname
    index_path = kb_root / ".index" / "generated" / index_filename

    if index_path.exists() and layer_dir.exists():
        index_mtime = index_path.stat().st_mtime
        newest_source_mtime = max((p.stat().st_mtime for p in layer_dir.glob("*.md")), default=0)
        if index_mtime >= newest_source_mtime:
            rows = read_tsv(index_path)
            return [(layer_dir / f"{row.get('uid', '')}.md", hydrate(row), None) for row in rows]
        print(f"[Index] {index_filename} 比 {dirname}/ 裡的檔案舊，可能是忘了跑 index_builder.py "
              f"或沒裝 pre-commit hook，這次 fallback 回全量掃描以確保資料正確；建議重跑 "
              f"`python3 runtime/indexer/index_builder.py`。", file=sys.stderr)

    return scan_layer(kb_root, dirname)


def _split_dim(raw: str) -> dict:
    """把 index_builder.py 攤平成 'value|confidence' 的單一維度字串還原成
    {"value":..., "confidence":...}，對應 observation frontmatter 的 context.<dim> 結構。"""
    value, _, confidence = (raw or "").partition("|")
    d: dict = {}
    if value:
        d["value"] = value
    if confidence:
        try:
            d["confidence"] = float(confidence)
        except ValueError:
            pass
    return d


def hydrate_entity_row(row: dict) -> dict:
    return {
        "uid":     row.get("uid", ""),
        "name":    row.get("name", ""),
        "domains": [d for d in (row.get("domains") or "").split(",") if d],
        "aliases": [a for a in (row.get("aliases") or "").split(",") if a],
        "type":    row.get("type", ""),
    }


def hydrate_atom_row(row: dict) -> dict:
    return {
        "uid":         row.get("uid", ""),
        "from":        row.get("from", ""),
        "to":          row.get("to", ""),
        "type":        row.get("type", ""),
        "status":      row.get("status", ""),
        "abstraction": {"level": row.get("abstraction_level", "")},
        "lifecycle":   {"last_review": row.get("lifecycle_last_review", "")},
    }


def hydrate_observation_row(row: dict) -> dict:
    confidence_value = row.get("confidence_value") or ""
    confidence: dict = {}
    if confidence_value:
        try:
            confidence["value"] = float(confidence_value)
        except ValueError:
            pass
    return {
        "uid":   row.get("uid", ""),
        "atom":  row.get("atom_uid", ""),
        "epoch": row.get("epoch", ""),
        "context": {
            "market_regime":   _split_dim(row.get("market_regime", "")),
            "monetary_policy": _split_dim(row.get("monetary_policy", "")),
            "liquidity":       _split_dim(row.get("liquidity", "")),
            "inflation":       _split_dim(row.get("inflation", "")),
            "geopolitical":    _split_dim(row.get("geopolitical", "")),
        },
        "impact":      row.get("impact", ""),
        "probability": row.get("probability", ""),
        "stance":      row.get("stance", ""),
        "confidence":  confidence,
        "evidence":    [e for e in (row.get("evidence") or "").split(";") if e],
    }


def load_entities(kb_root: Path) -> list[tuple[Path, dict, None]]:
    return load_indexed_layer(kb_root, "1_Entities", "entities.tsv", hydrate_entity_row)


def load_atoms(kb_root: Path) -> list[tuple[Path, dict, None]]:
    return load_indexed_layer(kb_root, "2_Atoms", "atoms.tsv", hydrate_atom_row)


def load_observations(kb_root: Path) -> list[tuple[Path, dict, None]]:
    return load_indexed_layer(kb_root, "3_Observations", "observations.tsv", hydrate_observation_row)


def months_between(d1: date, d2: date) -> float:
    """近似月數差（d2 - d1），允許非整月。"""
    return (d2.year - d1.year) * 12 + (d2.month - d1.month) + (d2.day - d1.day) / 30.0


def parse_date_safe(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return dateparser.parse(str(value)).date()
    except Exception:
        return None


def epoch_to_date(epoch: str) -> date | None:
    """把 '2024Q1' / '2024-03' / '2024' 這類 epoch 字串轉成可比較的日期（取該期間起始日）。"""
    if not epoch:
        return None
    epoch = str(epoch).strip()
    m = re.match(r"^(\d{4})Q([1-4])$", epoch, re.IGNORECASE)
    if m:
        year, q = int(m.group(1)), int(m.group(2))
        month = (q - 1) * 3 + 1
        return date(year, month, 1)
    return parse_date_safe(epoch)


def write_tsv(path: Path, header: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\t".join(header) + "\n")
        for row in rows:
            f.write("\t".join("" if v is None else str(v) for v in row) + "\n")


def read_tsv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f if l.strip() != ""]
    if not lines:
        return []
    header = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        cells = line.split("\t")
        rows.append(dict(zip(header, cells)))
    return rows


# ============================================================
# 提案寫檔工具：供 governance_auditor.py / correlation_engine.py 等
# 「掃描圖譜、產生人類決議提案」的模組共用。冪等：重跑會覆寫自動產生的部分，
# 但保留檔案裡「人類決議」區塊已經填寫的內容。
# ============================================================
PROPOSAL_AUTOGEN_HEADER = (
    "<!-- 本檔案由自動化服務產生，請勿手動編輯內容以外的區塊。"
    "重新執行會覆寫本檔案的自動部分，但保留「人類決議」區塊。 -->\n\n"
)
PROPOSAL_HUMAN_SECTION = "\n\n## 人類決議\n\n- [ ] 已審閱\n- 決議：（待填寫）\n- 決議日期：（待填寫）\n"


def preserve_human_section(existing_path: Path) -> str:
    if not existing_path.exists():
        return PROPOSAL_HUMAN_SECTION
    text = existing_path.read_text(encoding="utf-8")
    marker = "## 人類決議"
    idx = text.find(marker)
    if idx == -1:
        return PROPOSAL_HUMAN_SECTION
    return "\n\n" + text[idx:]


def write_proposal(path: Path, title: str, body: str) -> None:
    human = preserve_human_section(path)
    content = PROPOSAL_AUTOGEN_HEADER + f"# {title}\n\n" + body + human
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")