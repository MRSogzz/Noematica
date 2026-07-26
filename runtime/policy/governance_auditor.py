#!/usr/bin/env python3
"""
runtime/policy/governance_auditor.py — Governance Auditor

責任：把 policy.yaml 裡的「圖譜層級規則」（調解觸發、生命週期審查、復活偵測）
套用到目前整個 epistemic 圖譜上，產生給人類看的提案。屬於 Policy Engine 的
「批次稽核」形態（policy_engine.py 是逐次查詢時的即時判斷，本檔案是離線掃描全圖）。

觸發時機：Index Builder 執行「之後」（依賴 epistemic/.index/generated/debt_report.tsv）。

用法：
    python3 runtime/indexer/index_builder.py      # 先跑索引
    python3 runtime/policy/governance_auditor.py
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, scan_layer, read_tsv, epoch_to_date, months_between, write_proposal  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))  # runtime/policy/
import policy_engine as pe  # noqa: E402


def mediation_proposals(kb_root: Path, policy: dict, obs_full: list, atoms_by_uid: dict):
    by_atom: dict[str, list] = {}
    for path, fm, _ in obs_full:
        if fm.get("stance") in ("support", "contradict"):
            by_atom.setdefault(fm.get("atom", ""), []).append(fm)

    created = []
    for atom_uid, obs_list in by_atom.items():
        dates = [d for d in (epoch_to_date(o.get("epoch")) for o in obs_list) if d]
        if not dates:
            continue
        span = months_between(min(dates), max(dates))
        if not pe.mediation_trigger(policy, len(obs_list), span):
            continue
        support = [o for o in obs_list if o.get("stance") == "support"]
        contradict = [o for o in obs_list if o.get("stance") == "contradict"]
        atom_fm = atoms_by_uid.get(atom_uid, {})
        body = (
            f"- Atom: `{atom_uid}` ({atom_fm.get('from','?')} → {atom_fm.get('to','?')}, "
            f"type={atom_fm.get('type','?')})\n"
            f"- 衝突觀測總數: {len(obs_list)}（support: {len(support)}, contradict: {len(contradict)}）\n"
            f"- 觀測時間跨度: {span:.1f} 個月\n\n"
            "### 建議下一步\n\n"
            "1. 檢視是否為 `context_change`——若是，考慮拆分為兩個更精確的子 Atom（`lineage.type = split`）。\n"
            "2. 檢視是否為 `mechanism_change`——若機制已改變，建新 Atom 並用 `lineage.type = replacement` "
            "指回本節點，並將本節點 `status` 改為 `deprecated`。\n"
            "3. 若屬雜訊或真實對立且無法化解，可新增一筆 Meta-Observation 記錄共識（非強制）。\n"
        )
        out = kb_root / "0_Inbox" / f"mediation_proposal_{atom_uid}.md"
        write_proposal(out, f"調解提案：{atom_uid}", body)
        created.append(out)
    return created


def review_requests(kb_root: Path, debt_rows: list[dict], atoms_by_uid: dict):
    created = []
    for row in debt_rows:
        atom_uid = row.get("atom_uid", "")
        if not atom_uid:
            continue
        atom_fm = atoms_by_uid.get(atom_uid, {})
        body = (
            f"- Atom: `{atom_uid}` ({atom_fm.get('from','?')} → {atom_fm.get('to','?')}, "
            f"type={atom_fm.get('type','?')})\n"
            f"- 最後一筆 support observation: {row.get('last_support_epoch') or '（找不到）'}\n"
            f"- 距今: {row.get('age_months') or '（未知）'} 個月\n"
            f"- 風險等級: {row.get('risk','?')}（原因: {row.get('reason','?')}）\n\n"
            "### 建議下一步\n\n"
            "確認此機制是否仍然成立。若仍成立但恰好近期沒有新資料，補一筆新的 support/neutral "
            "Observation 即可解除債務；若已不成立，將 `status` 改為 `dormant` 或 `deprecated`。\n"
        )
        out = kb_root / "9_Blind_Spots" / f"review_request_{atom_uid}.md"
        write_proposal(out, f"生命週期審查請求：{atom_uid}", body)
        created.append(out)
    return created


def reactivation_proposals(kb_root: Path, obs_full: list, atoms_by_uid: dict):
    created = []
    for path, fm, _ in obs_full:
        atom_uid = fm.get("atom", "")
        atom_fm = atoms_by_uid.get(atom_uid, {})
        if atom_fm.get("status") != "archived":
            continue
        body = (
            f"- Atom `{atom_uid}` 目前狀態為 `archived`，但發現新的 Observation 指向它："
            f"`{fm.get('uid','')}`（epoch: {fm.get('epoch','')}, stance: {fm.get('stance','')}）\n\n"
            "### 建議下一步\n\n"
            "確認這是否代表舊機制重新成立，若是，將 Atom `status` 改回 `active` 或 `dormant`，"
            "並在 Atom 的「已知限制」區塊補充復活的條件。\n"
        )
        out = kb_root / "0_Inbox" / f"reactivation_proposal_{atom_uid}.md"
        write_proposal(out, f"復活提案：{atom_uid}", body)
        created.append(out)
    return created


def main():
    repo_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else find_repo_root(Path.cwd())
    kb_root = repo_root / "epistemic"
    policy = pe.load_policy(repo_root)

    atoms_full = scan_layer(kb_root, "2_Atoms")
    atoms_by_uid = {fm.get("uid", ""): fm for _, fm, _ in atoms_full}
    obs_full = scan_layer(kb_root, "3_Observations")
    debt_rows = read_tsv(kb_root / ".index/generated/debt_report.tsv")

    med = mediation_proposals(kb_root, policy, obs_full, atoms_by_uid)
    rev = review_requests(kb_root, debt_rows, atoms_by_uid)
    react = reactivation_proposals(kb_root, obs_full, atoms_by_uid)

    print(f"[Governance Auditor] epistemic 根目錄: {kb_root}")
    print(f"  mediation_proposal   : {len(med)} 筆 -> 0_Inbox/")
    print(f"  review_request       : {len(rev)} 筆 -> 9_Blind_Spots/")
    print(f"  reactivation_proposal: {len(react)} 筆 -> 0_Inbox/")
    if not (med or rev or react):
        print("  （目前沒有需要人類注意的治理事項）")


if __name__ == "__main__":
    main()
