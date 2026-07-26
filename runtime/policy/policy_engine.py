#!/usr/bin/env python3
"""
runtime/policy/policy_engine.py — Policy Engine

責任：系統的「安全機制」本體。所有門檻判斷都集中在這裡，
Activation Engine 與 Governance Auditor（都在 runtime/ 底下）呼叫這個模組做判斷，
而不是各自硬寫門檻邏輯——這樣門檻只需要在 policy.yaml 改一次，行為就會全系統一致。

不是 CLI；被其他模組 import 使用。也可直接執行做 self-test（見檔尾 __main__）。
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root  # noqa: E402
import yaml  # noqa: E402

DIMS = ["market_regime", "monetary_policy", "liquidity", "inflation", "geopolitical"]


def load_policy(repo_root: Path | None = None) -> dict:
    repo_root = repo_root or find_repo_root()
    with open(repo_root / "runtime" / "policy" / "policy.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def confidence_decay_cap(policy: dict, atom_type: str, raw_confidence: float) -> float:
    """套用 confidence_decay.derived_cap：某類型 Atom 的推導信心不可超過上限。"""
    cap = policy.get("confidence_decay", {}).get("derived_cap", {}).get(atom_type)
    if cap is None:
        return raw_confidence
    return min(raw_confidence, cap)


def context_match_ratio(policy: dict, query_ctx: dict, obs_ctx: dict) -> float:
    """只比對 query_ctx 中有指定的維度；query_ctx 為空視為不篩選，回傳 1.0。"""
    specified = [d for d in DIMS if d in query_ctx and query_ctx[d].get("value")]
    if not specified:
        return 1.0
    matched = 0
    for d in specified:
        want = str(query_ctx[d].get("value", "")).lower()
        got = str((obs_ctx.get(d, {}) or {}).get("value", "")).lower()
        if want and got and want == got:
            matched += 1
    return matched / len(specified)


def path_confidence(policy: dict, obs_confidences: list[float], hops: int = 1) -> float:
    if not obs_confidences:
        return 0.0
    penalty = policy.get("path_confidence", {}).get("depth_penalty_per_hop", 0.9)
    return min(obs_confidences) * (penalty ** max(hops - 1, 0))


def evidence_independence_count(policy: dict, observations: list[dict]) -> int:
    """依 source_fingerprint 去重計算獨立證據數（觀測數量本身不代表證據強度）。"""
    fingerprints = set()
    for obs in observations:
        for ev in obs.get("evidence", []) or []:
            fingerprints.add(str(ev))  # 呼叫端應傳入已解析成 source_fingerprint 的字串
    return len(fingerprints)


def should_abstain(policy: dict, path_conf: float, n_activated: int, context_match: float) -> tuple[bool, str | None]:
    ab = policy.get("abstention", {})
    if path_conf < ab.get("min_path_confidence", 0.4):
        return True, "low_path_confidence"
    if n_activated < ab.get("min_activated_observations", 2):
        return True, "insufficient_observations"
    if context_match < ab.get("min_context_match_ratio", 0.6):
        return True, "insufficient_context_match"
    return False, None


def mediation_trigger(policy: dict, n_conflicting: int, span_months: float) -> bool:
    mt = policy.get("mediation_trigger", {})
    return (n_conflicting > mt.get("min_conflicting_observations", 5)
            and span_months >= mt.get("min_time_span_months", 18))


def is_stale(policy: dict, atom_type: str, age_months: float) -> bool:
    lr = policy.get("lifecycle_review", {})
    if atom_type not in set(lr.get("applies_to_types", [])):
        return False
    return age_months > lr.get("stale_after_months", 24)


if __name__ == "__main__":
    # self-test：確保 policy.yaml 讀得到、規則函式行為符合預期
    policy = load_policy()
    assert confidence_decay_cap(policy, "causal", 0.9) == 0.6
    assert confidence_decay_cap(policy, "definition", 0.9) == 0.9
    abstain, reason = should_abstain(policy, path_conf=0.3, n_activated=5, context_match=1.0)
    assert abstain and reason == "low_path_confidence"
    abstain, reason = should_abstain(policy, path_conf=0.9, n_activated=5, context_match=1.0)
    assert not abstain
    assert mediation_trigger(policy, n_conflicting=6, span_months=20)
    assert not mediation_trigger(policy, n_conflicting=6, span_months=10)
    assert is_stale(policy, "causal", 30)
    assert not is_stale(policy, "definition", 30)  # definition 不在 applies_to_types
    print("[Policy Engine] self-test 全部通過")
