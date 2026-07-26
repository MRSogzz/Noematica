#!/usr/bin/env python3
"""
runtime/compiler/inbox_review.py — Inbox 草稿的審查工具（列表/查看/核准/拒絕）

責任：讓前端（或 CLI）可以「不用打開檔案系統」就完成
    看有哪些待審草稿 → 核准或拒絕 → 觸發 Compiler
這條完整的人工審查閉環。實際的驗證/編譯邏輯還是 compiler.py 那一份，這裡只負責
「列表」「核准（改 approved 欄位）」「拒絕（搬進 6_Rejected/ 並附上人類拒絕的原因）」
這三個動作，加上呼叫 compiler.compile_inbox() 的 run_compile()。

安全性：filename 一律做路徑防護——不接受任何含斜線、反斜線、`..` 的檔名，且解析後的路徑
必須真的落在 0_Inbox/ 底下，否則拒絕操作。這是因為 filename 是從前端/HTTP request
直接傳進來的，不能信任它不會被用來做路徑穿越攻擊（例如試圖讀寫 0_Inbox/ 以外的檔案）。

只認得 draft_type 是 entity/atom/observation/source 的檔案（即 compiler.py 認得的
四種類型）；0_Inbox/ 底下其他檔案（governance_auditor 產生的 mediation_proposal 等）
不在這個審查介面的範圍內——那些走的是另一套「人類決議」區塊的審查方式，見
runtime/policy/governance_auditor.py 的說明。
"""
from __future__ import annotations
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import scan_layer, parse_md  # noqa: E402
import compiler as compiler_mod  # noqa: E402

DRAFT_TYPES = {"entity", "atom", "observation", "source"}


def _safe_inbox_path(kb_root: Path, filename: str) -> Path:
    """把使用者傳來的 filename 轉成安全的絕對路徑，擋掉路徑穿越。"""
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError(f"不合法的檔名：{filename!r}")
    inbox_dir = (kb_root / "0_Inbox").resolve()
    target = (inbox_dir / filename).resolve()
    if inbox_dir not in target.parents and target != inbox_dir:
        raise ValueError(f"檔名解析後不在 0_Inbox/ 底下：{filename!r}")
    return target


def _draft_summary(draft_type: str, fm: dict) -> str:
    if draft_type == "entity":
        return f"{fm.get('name', '?')}（{fm.get('type', '?')}）"
    if draft_type == "atom":
        return f"{fm.get('from', '?')} --{fm.get('type', '?')}--> {fm.get('to', '?')}"
    if draft_type == "observation":
        conf = (fm.get("confidence") or {}).get("value", "?")
        return f"atom={fm.get('atom', '?')}　stance={fm.get('stance', '?')}　信心={conf}"
    if draft_type == "source":
        return fm.get("title", "?")
    return ""


def list_inbox_drafts(repo_root: Path) -> list[dict]:
    """列出 0_Inbox/ 底下所有 compiler 認得的草稿（entity/atom/observation/source），
    依 filename 排序，回傳給前端渲染列表用的精簡資訊（不含完整內文，內文用
    get_inbox_draft() 另外拿）。"""
    kb_root = repo_root / "epistemic"
    results = []
    for path, fm, _ in scan_layer(kb_root, "0_Inbox"):
        draft_type = fm.get("draft_type")
        if draft_type not in DRAFT_TYPES:
            continue
        results.append({
            "filename": path.name,
            "draft_type": draft_type,
            "approved": bool(fm.get("approved", False)),
            "summary": _draft_summary(draft_type, fm),
            "created": fm.get("created", ""),
        })
    results.sort(key=lambda d: d["filename"])
    return results


def get_inbox_draft(repo_root: Path, filename: str) -> dict:
    """回傳單一草稿的完整內容（frontmatter + body），給前端「查看完整內容」用。"""
    kb_root = repo_root / "epistemic"
    path = _safe_inbox_path(kb_root, filename)
    if not path.exists():
        raise FileNotFoundError(f"找不到草稿：{filename}")
    fm, body = parse_md(path)
    if fm.get("draft_type") not in DRAFT_TYPES:
        raise ValueError(f"{filename} 不是 compiler 認得的草稿類型（draft_type={fm.get('draft_type')!r}）")
    return {
        "filename": filename,
        "frontmatter": fm,
        "body": body,
        "raw": path.read_text(encoding="utf-8"),
    }


def approve_inbox_draft(repo_root: Path, filename: str) -> dict:
    """把 approved 改成 true。不做驗證——驗證是 Compiler 的責任，這裡只負責「使用者說可以」
    這件事本身的紀錄，核准之後還是要呼叫 run_compile() 才會真的編譯進正式層。"""
    kb_root = repo_root / "epistemic"
    path = _safe_inbox_path(kb_root, filename)
    if not path.exists():
        raise FileNotFoundError(f"找不到草稿：{filename}")
    fm, body = parse_md(path)
    if fm.get("draft_type") not in DRAFT_TYPES:
        raise ValueError(f"{filename} 不是 compiler 認得的草稿類型")

    import yaml
    fm["approved"] = True
    fm_yaml = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)
    path.write_text(f"---\n{fm_yaml}---\n\n{body}", encoding="utf-8")
    return {"filename": filename, "approved": True}


def reject_inbox_draft(repo_root: Path, filename: str, reason: str = "") -> dict:
    """人工拒絕：搬進 6_Rejected/ 並附上拒絕原因，而不是直接刪掉——
    延續系統「反模式記憶」的設計，未來重跑抽取時人類還能回頭看「這種草稿之前被拒絕過、為什麼」。
    這跟 compiler.py 自動拒絕（驗證失敗）用的是同一個目錄，但原因欄位會標明是人工拒絕。"""
    kb_root = repo_root / "epistemic"
    path = _safe_inbox_path(kb_root, filename)
    if not path.exists():
        raise FileNotFoundError(f"找不到草稿：{filename}")
    fm, body = parse_md(path)
    if fm.get("draft_type") not in DRAFT_TYPES:
        raise ValueError(f"{filename} 不是 compiler 認得的草稿類型")

    uid = fm.get("uid") or fm.get("source_fingerprint") or path.stem
    rejected_dir = kb_root / "6_Rejected"
    rejected_dir.mkdir(parents=True, exist_ok=True)
    out_path = rejected_dir / f"rejected_{uid}.md"
    reason_block = (
        f"<!-- 由 inbox_review.py 自動生成：人工拒絕 -->\n\n"
        f"# 人工拒絕：{uid}\n\n"
        f"- 原始草稿：`0_Inbox/{filename}`\n"
        f"- 目標層級：{fm.get('draft_type')}\n"
        f"- 拒絕原因：{reason or '（未填寫原因）'}\n"
        f"- 拒絕時間：{date.today().isoformat()}\n\n"
        f"## 原始內容\n\n{body}\n"
    )
    out_path.write_text(reason_block, encoding="utf-8")
    path.unlink()
    return {"filename": filename, "rejected_to": str(out_path.relative_to(repo_root))}


def run_compile(repo_root: Path) -> dict:
    """核准完之後呼叫這個，實際去跑 runtime/compiler/compiler.py 的驗證/編譯邏輯。
    直接重用 compiler.compile_inbox()，不重寫一份。"""
    kb_root = repo_root / "epistemic"
    return compiler_mod.compile_inbox(kb_root)
