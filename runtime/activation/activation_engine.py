#!/usr/bin/env python3
"""
runtime/activation/activation_engine.py — Activation Engine

觸發時機：使用者提問時。在完整系統中，這是 Reasoning Engine 呼叫的其中一步：
    Query Contract (llm-wiki -> epistemic_adapter)
        -> activation_engine.activate(query, context)   <- 就是本模組
        -> policy_engine 做棄權判斷
        -> reasoning_engine 組 prompt 交給 LLM
        -> Belief Contract (epistemic_adapter -> llm-wiki)

本檔案同時提供：
  1. 一個可被其他模組 import 的函式 activate(...)，回傳 dict（下游可直接轉成 Belief Contract）。
  2. 一個 CLI，方便手動測試。

用法（CLI）：
    python3 runtime/activation/activation_engine.py --query "升息" \
        --context '{"monetary_policy":{"value":"tightening","confidence":0.8}}'
    python3 runtime/activation/activation_engine.py --atom rate_affects_bank_nim
"""
from __future__ import annotations
import argparse
import json
import sys
import uuid
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, find_kb_root, scan_layer  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "policy"))  # runtime/policy/
import policy_engine as pe  # noqa: E402


def find_candidate_entities(entities_full: list, query: str) -> list[str]:
    q = query.lower()
    hits = []
    for _, fm, _ in entities_full:
        haystack = [fm.get("name", ""), fm.get("uid", "")] + list(fm.get("aliases", []) or [])
        if any(q in str(h).lower() for h in haystack if h):
            hits.append(fm.get("uid", ""))
    return hits


def find_candidate_atoms(atoms_full: list, entity_uids: set[str], explicit_atom: str | None) -> list[dict]:
    if explicit_atom:
        return [fm for _, fm, _ in atoms_full if fm.get("uid") == explicit_atom]
    if not entity_uids:
        return []
    return [fm for _, fm, _ in atoms_full
            if fm.get("from") in entity_uids or fm.get("to") in entity_uids]


def activate(repo_root: Path, query: str = "", atom: str | None = None,
             context: dict | None = None) -> dict:
    """核心函式：可被 integration/epistemic_adapter 直接呼叫，不透過 CLI。"""
    context = context or {}
    kb_root = repo_root / "epistemic"
    policy = pe.load_policy(repo_root)

    entities_full = scan_layer(kb_root, "1_Entities")
    atoms_full = scan_layer(kb_root, "2_Atoms")
    obs_full = scan_layer(kb_root, "3_Observations")

    entity_uids = set(find_candidate_entities(entities_full, query)) if query else set()
    candidate_atoms = find_candidate_atoms(atoms_full, entity_uids, atom)
    atoms_considered = [a.get("uid") for a in candidate_atoms]
    atoms_by_uid = {fm.get("uid"): fm for fm in candidate_atoms}

    result = {
        "query": query,
        "atom_filter": atom,
        "context": context,
        "atoms_considered": atoms_considered,
        "mode": None,
        "path_confidence": None,
        "abstained": False,
        "abstain_reason": None,
        "buckets": {"support": [], "contradict": [], "baseline": []},
    }

    if not candidate_atoms:
        result["abstained"] = True
        result["abstain_reason"] = "no_matching_atom"
        return result

    all_obs_for_atoms = [fm for _, fm, _ in obs_full if fm.get("atom") in atoms_considered]

    # Step 2: 硬過濾
    filtered = []
    for fm in all_obs_for_atoms:
        ratio = pe.context_match_ratio(policy, context, fm.get("context", {}) or {})
        if ratio >= policy.get("abstention", {}).get("min_context_match_ratio", 0.6):
            filtered.append((fm, ratio))

    mode = "context_filtered"
    activated = filtered
    min_n = policy.get("abstention", {}).get("min_activated_observations", 2)
    if len(activated) < min_n:
        mode = "baseline"
        activated = [(fm, 1.0) for fm in all_obs_for_atoms]
    result["mode"] = mode

    # Step 3: confidence（套用 confidence_decay cap，依各自 Atom.type）
    confidences = []
    for fm, _ in activated:
        raw = float((fm.get("confidence", {}) or {}).get("value", 0) or 0)
        atom_fm = atoms_by_uid.get(fm.get("atom"), {})
        capped = pe.confidence_decay_cap(policy, atom_fm.get("type", ""), raw)
        confidences.append(capped)

    path_conf = pe.path_confidence(policy, confidences, hops=1)
    result["path_confidence"] = round(path_conf, 3)

    avg_context_match = (sum(r for _, r in activated) / len(activated)) if activated else 0.0
    abstain, reason = pe.should_abstain(policy, path_conf, len(activated), avg_context_match)
    if abstain:
        result["abstained"] = True
        result["abstain_reason"] = reason
        return result

    for fm, ratio in activated:
        entry = {
            "uid": fm.get("uid"),
            "atom": fm.get("atom"),
            "epoch": fm.get("epoch"),
            "impact": fm.get("impact"),
            "confidence": (fm.get("confidence", {}) or {}).get("value"),
            "context_match_ratio": round(ratio, 2),
            "evidence": fm.get("evidence", []),
        }
        if mode == "baseline":
            result["buckets"]["baseline"].append(entry)
        elif fm.get("stance") == "support":
            result["buckets"]["support"].append(entry)
        elif fm.get("stance") == "contradict":
            result["buckets"]["contradict"].append(entry)
        else:
            result["buckets"]["baseline"].append(entry)

    return result


def to_belief_contract(result: dict) -> dict:
    """把內部 result 轉成 integration/contracts/belief_contract.schema.json 定義的形狀。"""
    if result["abstained"]:
        return {
            "support": [],
            "contradiction": [],
            "uncertainty": 1.0,
            "abstained": True,
            "abstain_reason": result["abstain_reason"],
        }
    support = [{"obs": e["uid"], "confidence": e["confidence"]} for e in result["buckets"]["support"]]
    contradiction = [{"obs": e["uid"], "confidence": e["confidence"]} for e in result["buckets"]["contradict"]]
    uncertainty = round(1.0 - result["path_confidence"], 3) if result["path_confidence"] is not None else 1.0
    return {
        "support": support,
        "contradiction": contradiction,
        "uncertainty": uncertainty,
        "abstained": False,
        "abstain_reason": None,
        "baseline": [{"obs": e["uid"], "confidence": e["confidence"]} for e in result["buckets"]["baseline"]],
    }


def log_query(kb_root: Path, result: dict) -> Path:
    log_dir = kb_root / "7_Query_History"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{datetime.now().strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
    log_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return log_path


def main():
    ap = argparse.ArgumentParser(description="Activation Engine")
    ap.add_argument("--query", default="")
    ap.add_argument("--atom", default=None)
    ap.add_argument("--context", default="{}")
    ap.add_argument("--repo-root", default=None)
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(Path.cwd())
    try:
        context = json.loads(args.context) if args.context else {}
    except json.JSONDecodeError as e:
        print(f"[錯誤] --context 不是合法 JSON: {e}", file=sys.stderr)
        sys.exit(1)

    result = activate(repo_root, query=args.query, atom=args.atom, context=context)

    print(f"[Activation Engine] query={args.query!r} atom={args.atom!r}")
    if result["abstained"]:
        print(f"  → 棄權（原因: {result['abstain_reason']}）")
    else:
        print(f"  → 模式: {result['mode']}, Path Confidence: {result['path_confidence']}")
        for bucket_name in ("support", "contradict", "baseline"):
            entries = result["buckets"][bucket_name]
            if entries:
                print(f"  [{bucket_name}] {len(entries)} 筆")
                for e in entries:
                    print(f"    - {e['uid']} (epoch={e['epoch']}, conf={e['confidence']})")

    log_path = log_query(repo_root / "epistemic", result)
    print(f"  查詢紀錄: {log_path.relative_to(repo_root)}")
    print(json.dumps(to_belief_contract(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
