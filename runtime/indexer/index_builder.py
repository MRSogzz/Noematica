#!/usr/bin/env python3
"""
runtime/indexer/index_builder.py — Index Builder

觸發時機：每次 Git commit 前（建議掛在 pre-commit hook），或手動執行。
輸入：掃描整個 epistemic/。
產出：寫入 epistemic/.index/generated/*.tsv（受 Git 追蹤的唯讀快照）。

用法：
    python3 runtime/indexer/index_builder.py [repo 根目錄，預設自動偵測]
"""
from __future__ import annotations
import sys
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, find_kb_root, load_policy, scan_layer, write_tsv, months_between, epoch_to_date, parse_date_safe


def build_entities(kb_root: Path):
    rows = []
    for path, fm, _ in scan_layer(kb_root, "1_Entities"):
        rows.append([
            fm.get("uid", ""),
            fm.get("name", ""),
            ",".join(fm.get("domains", []) or []),
            ",".join(fm.get("aliases", []) or []),
            fm.get("type", ""),
        ])
    write_tsv(kb_root / ".index/generated/entities.tsv",
              ["uid", "name", "domains", "aliases", "type"], rows)
    return rows


def build_atoms(kb_root: Path):
    rows = []
    atoms_by_uid = {}
    for path, fm, _ in scan_layer(kb_root, "2_Atoms"):
        uid = fm.get("uid", "")
        abstraction = fm.get("abstraction", {}) or {}
        rows.append([
            uid,
            fm.get("from", ""),
            fm.get("to", ""),
            fm.get("type", ""),
            fm.get("status", ""),
            abstraction.get("level", ""),
        ])
        atoms_by_uid[uid] = fm
    write_tsv(kb_root / ".index/generated/atoms.tsv",
              ["uid", "from", "to", "type", "status", "abstraction_level"], rows)
    return rows, atoms_by_uid


def build_edges(kb_root: Path, atom_rows: list[list]):
    rows = []
    for uid, frm, to, *_ in atom_rows:
        if frm and to:
            rows.append([frm, to, uid])
    write_tsv(kb_root / ".index/generated/edges.tsv",
              ["from_uid", "to_uid", "atom_uid"], rows)
    return rows


def build_observations(kb_root: Path):
    rows = []
    obs_by_uid = {}
    for path, fm, _ in scan_layer(kb_root, "3_Observations"):
        ctx = fm.get("context", {}) or {}

        def dim(name):
            d = ctx.get(name, {}) or {}
            return f"{d.get('value','')}|{d.get('confidence','')}"

        rows.append([
            fm.get("uid", ""),
            fm.get("atom", ""),
            fm.get("epoch", ""),
            dim("market_regime"),
            dim("monetary_policy"),
            dim("liquidity"),
            dim("inflation"),
            dim("geopolitical"),
            fm.get("impact", ""),
            fm.get("probability", ""),
            fm.get("stance", ""),
            (fm.get("confidence", {}) or {}).get("value", ""),
        ])
        obs_by_uid[fm.get("uid", "")] = fm
    write_tsv(kb_root / ".index/generated/observations.tsv",
              ["uid", "atom_uid", "epoch", "market_regime", "monetary_policy",
               "liquidity", "inflation", "geopolitical", "impact", "probability",
               "stance", "confidence_value"], rows)
    return rows, obs_by_uid


def build_debt_report(kb_root: Path, atoms_by_uid: dict, obs_rows_full: list[dict], policy: dict, today: date):
    """
    找出：
      - Atom.type 屬於 lifecycle_review.applies_to_types 的因果/經驗類 Atom，
      - 且其「最後一筆 stance=support 的 Observation」超過 stale_after_months。
    """
    lr = policy.get("lifecycle_review", {})
    stale_months = lr.get("stale_after_months", 24)
    applies_to = set(lr.get("applies_to_types", []))

    last_support_epoch: dict[str, date] = {}
    for path, fm, _ in obs_rows_full:
        if fm.get("stance") != "support":
            continue
        d = epoch_to_date(fm.get("epoch"))
        if d is None:
            continue
        atom_uid = fm.get("atom", "")
        if atom_uid not in last_support_epoch or d > last_support_epoch[atom_uid]:
            last_support_epoch[atom_uid] = d

    rows = []
    for uid, fm in atoms_by_uid.items():
        if fm.get("type") not in applies_to:
            continue
        if fm.get("status") in ("deprecated", "archived"):
            continue  # 已經退場的節點不需要再提醒
        last_epoch = last_support_epoch.get(uid)
        if last_epoch is None:
            # 從未有 support observation，一律視為高風險
            rows.append([uid, "", "", "high", "no_support_observation_found"])
            continue
        age = months_between(last_epoch, today)
        if age > stale_months:
            risk = "high" if age > stale_months * 1.5 else "medium"
            rows.append([uid, last_epoch.isoformat(), round(age, 1), risk,
                         "last_support_older_than_threshold"])
    write_tsv(kb_root / ".index/generated/debt_report.tsv",
              ["atom_uid", "last_support_epoch", "age_months", "risk", "reason"], rows)
    return rows


def main():
    repo_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else find_repo_root(Path.cwd())
    kb_root = repo_root / "epistemic"
    policy = load_policy(kb_root)
    today = date.today()

    entity_rows = build_entities(kb_root)
    atom_rows, atoms_by_uid = build_atoms(kb_root)
    edge_rows = build_edges(kb_root, atom_rows)
    obs_rows, obs_by_uid = build_observations(kb_root)
    obs_rows_full = scan_layer(kb_root, "3_Observations")
    debt_rows = build_debt_report(kb_root, atoms_by_uid, obs_rows_full, policy, today)

    print(f"[Index Builder] epistemic 根目錄: {kb_root}")
    print(f"  entities.tsv      : {len(entity_rows)} 筆")
    print(f"  atoms.tsv         : {len(atom_rows)} 筆")
    print(f"  edges.tsv         : {len(edge_rows)} 筆")
    print(f"  observations.tsv  : {len(obs_rows)} 筆")
    print(f"  debt_report.tsv   : {len(debt_rows)} 筆（需要人工審查的 Atom）")


if __name__ == "__main__":
    main()
