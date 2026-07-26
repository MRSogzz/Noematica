#!/usr/bin/env python3
"""
runtime/compiler/compiler.py — Compiler

責任：Inbox -> Entity / Atom / Observation / Source
把 0_Inbox/ 裡「人類（或 LLM）已核准」的草稿，驗證欄位完整性後編譯進正式的
1_Entities / 2_Atoms / 3_Observations / 4_Sources 四層；驗證失敗的草稿移進 6_Rejected/
並附上具體的拒絕原因（這就是「反模式記憶」的來源——下次不會用同樣錯誤的結構重犯）。

草稿格式：在 5_Templates/ 對應範本的 frontmatter 基礎上，額外加兩個欄位：
    draft_type: entity | atom | observation | source   # 目標編譯到哪一層
    approved: true                                        # 人類明確核准後才會被編譯，false/缺省一律跳過

用法：
    python3 runtime/compiler/compiler.py [repo 根目錄]
"""
from __future__ import annotations
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, scan_layer, parse_md  # noqa: E402

REQUIRED_FIELDS = {
    "entity": ["uid", "name", "type", "domains"],
    "atom": ["uid", "from", "to", "type", "abstraction", "status", "lifecycle"],
    "observation": ["uid", "atom", "epoch", "context", "impact", "probability",
                     "stance", "confidence", "evidence"],
    "source": ["title", "source_fingerprint", "published_date"],
}

TARGET_DIR = {
    "entity": "1_Entities",
    "atom": "2_Atoms",
    "observation": "3_Observations",
    "source": "4_Sources",
}

# 每種 draft_type 用哪個欄位當檔名／識別碼（source 沒有 uid，用 source_fingerprint）
ID_FIELD = {
    "entity": "uid",
    "atom": "uid",
    "observation": "uid",
    "source": "source_fingerprint",
}


def validate(draft_type: str, fm: dict) -> list[str]:
    """回傳缺漏或空白的必要欄位清單；空清單代表通過驗證。"""
    missing = []
    for field in REQUIRED_FIELDS.get(draft_type, []):
        val = fm.get(field, None)
        if val is None or val == "" or val == [] or val == {}:
            missing.append(field)
    return missing


def compile_inbox(kb_root: Path) -> dict:
    compiled, rejected, skipped = [], [], []

    for path, fm, body in scan_layer(kb_root, "0_Inbox"):
        draft_type = fm.get("draft_type")
        if draft_type not in REQUIRED_FIELDS:
            skipped.append(path.name)  # 不是草稿卡片（例如 governance_auditor 產的提案），略過
            continue
        if not fm.get("approved"):
            skipped.append(path.name)  # 尚未核准
            continue

        missing = validate(draft_type, fm)
        id_field = ID_FIELD.get(draft_type, "uid")
        uid = fm.get(id_field) or path.stem

        if missing:
            # 編譯失敗 -> 進 6_Rejected/，保留原始內容並附上拒絕原因
            rejected_fm = {k: v for k, v in fm.items() if k not in ("draft_type", "approved")}
            out_path = kb_root / "6_Rejected" / f"rejected_{uid}.md"
            reason_block = (
                f"<!-- 由 compiler.py 自動生成：驗證失敗 -->\n\n"
                f"# 編譯失敗：{uid}\n\n"
                f"- 原始草稿：`0_Inbox/{path.name}`\n"
                f"- 目標層級：{draft_type}\n"
                f"- 缺漏/空白欄位：{', '.join(missing)}\n"
                f"- 拒絕時間：{datetime.now().date().isoformat()}\n\n"
                f"## 原始內容\n\n{body}\n"
            )
            out_path.write_text(reason_block, encoding="utf-8")
            path.unlink()
            rejected.append((uid, missing))
            continue

        # 驗證通過 -> 編譯進正式層
        clean_fm = {k: v for k, v in fm.items() if k not in ("draft_type", "approved")}
        target_dir = kb_root / TARGET_DIR[draft_type]
        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = target_dir / f"{uid}.md"

        import yaml
        fm_yaml = yaml.safe_dump(clean_fm, allow_unicode=True, sort_keys=False)
        out_path.write_text(f"---\n{fm_yaml}---\n\n{body}", encoding="utf-8")
        path.unlink()
        compiled.append((draft_type, uid, str(out_path.relative_to(kb_root))))

    return {"compiled": compiled, "rejected": rejected, "skipped": skipped}


def main():
    repo_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else find_repo_root(Path.cwd())
    kb_root = repo_root / "epistemic"
    result = compile_inbox(kb_root)

    print(f"[Compiler] epistemic 根目錄: {kb_root}")
    for draft_type, uid, out in result["compiled"]:
        print(f"  ✔ 編譯成功: {draft_type}/{uid} -> {out}")
    for uid, missing in result["rejected"]:
        print(f"  ✘ 編譯失敗: {uid}（缺: {', '.join(missing)}）-> 6_Rejected/rejected_{uid}.md")
    if result["skipped"]:
        print(f"  略過（非草稿或未核准）: {len(result['skipped'])} 筆")


if __name__ == "__main__":
    main()
