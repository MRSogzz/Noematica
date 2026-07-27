#!/usr/bin/env python3
"""
runtime/policy/confidence_engine.py — Confidence Engine（證據信心 / 推論信心分離版）

背景：現有系統對「信心」有三套互不一致的算法（activation_engine.py 的
min-based path_confidence、adapter.py 的算術平均、correlation_engine.py 的
另一套 stance 分數），同一個 Atom 在不同介面看到的信心值可能不一樣。
本模組的目的是提供**唯一一份**信心計算邏輯，其他模組改呼叫這裡，數字才會一致。

設計原則（見討論紀錄，不重複收斂到單一大公式）：
  1. 證據信心（evidence_confidence）：「這些觀測本身有多可信」——只看觀測，不看
     這是從哪個 Atom 類型推出來的。
  2. 推論信心（inference_confidence）：「從證據推到目前結論，這條推論鏈本身結構
     有多可信」——只看路徑上的 Atom 類型與跳數，不看底下觀測寫了什麼。
  3. 兩者各自算完才相乘（combine_confidence），語義分開，互不干擾，任何一邊的
     公式要調整都不會動到另一邊。

刻意不做的事：
  - 不用「依樣本數切換不同統計量」（median/trimmed-mean/Huber 三選一）這種
    有硬邊界的設計——樣本數增加一筆導致估計方式整套換掉，會讓信心值無預警跳動。
    改用貝氏收斂平均（Bayesian shrinkage），數學上對樣本數是連續函式，
    小樣本自然收斂到保守的 prior，大樣本自然收斂到樣本平均，沒有分段。
  - 不用「多跳推論鏈上每一跳可靠度直接相乘」——跳數一多，純乘積會把一條
    「每一跳都普通、但沒有任何一跳真的壞掉」的鏈懲罰到跟真的有問題的鏈一樣低
    （乘法脆弱性）。改用幾何平均（跟跳數無關，只反映「平均每一跳品質」）
    ＋獨立的跳數懲罰（`path_confidence.depth_penalty_per_hop`，語義是
    「鏈越長，可驗證性代價越高」，這件事跟「每一跳品質好不好」是兩回事，
    分開算才不會互相污染）。

不是 CLI；被 activation_engine.py / adapter.py / correlation_engine.py 匯入使用。
可直接執行做 self-test（含「多跳疊加不應過度否定」的回歸測試）。
"""
from __future__ import annotations
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import policy_engine as pe  # noqa: E402  # 沿用 load_policy，避免重複實作

STANCE_CATEGORIES = ("support", "contradict", "neutral")


# ============================================================
# 內部工具
# ============================================================
def _cfg(policy: dict) -> dict:
    return policy.get("confidence_engine", {})


def _power_mean(values: list[float], p: float) -> float:
    """冪平均：p=1 算術平均、p→0 幾何平均、p=-1 調和平均。
    值域假設 values 皆 > 0（貝氏收斂平均的輸出天生 > 0，見 _bayesian_shrinkage）。"""
    if not values:
        return 0.0
    if abs(p) < 1e-9:
        # p -> 0 的極限是幾何平均，log 空間算比較穩定
        return math.exp(sum(math.log(v) for v in values) / len(values))
    return (sum(v ** p for v in values) / len(values)) ** (1.0 / p)


def _shrink(value: float, n: int, mu_prior: float, kappa: float) -> float:
    """貝氏收斂平均：r = (κ·μ_prior + n·value) / (κ + n)。
    對「有效樣本數」n 是連續函式，沒有 n=5、n=20 這種硬切換邊界：
    n 小時自然被拉向保守的 μ_prior，n 大時自然趨近 value，過渡是平滑的。"""
    if n <= 0:
        return mu_prior
    return (kappa * mu_prior + n * value) / (kappa + n)


def _cluster_key(obs: dict, idx: int) -> tuple:
    """依證據來源分群，避免同一來源的多筆觀測被當成互相獨立的證據重複計分。
    沒有標記證據來源的觀測，保守地各自獨立成一叢（不假設它們互相佐證）。"""
    evidence = obs.get("evidence") or []
    if evidence:
        return tuple(sorted(str(e) for e in evidence))
    return ("__no_source__", obs.get("uid") or idx)


def _cohesion(stances: list[str]) -> float:
    """立場內聚性，正規化到真正的 [0,1]（三類完全平分時為 0，完全一致時為 1）。
    原始的 L2 norm（sqrt(Σp_i²)）值域是 [1/√3, 1]，直接乘進信心會導致「立場完全
    分裂」時分數仍被撐在 0.577 以上，不符合語義，所以這裡做線性正規化。"""
    if not stances:
        return 1.0  # 沒有立場資訊時不額外懲罰，交給其他門檻（如觀測數量）把關
    counts = Counter(s if s in STANCE_CATEGORIES else "neutral" for s in stances)
    n = len(stances)
    props = [counts.get(c, 0) / n for c in STANCE_CATEGORIES]
    l2 = math.sqrt(sum(p * p for p in props))
    floor = 1.0 / math.sqrt(len(STANCE_CATEGORIES))
    if l2 <= floor:
        return 0.0
    return (l2 - floor) / (1.0 - floor)


# ============================================================
# 一、證據信心：「這些觀測本身有多可信」
# ============================================================
def evidence_confidence_detail(observations: list[dict], policy: dict) -> dict:
    """observations：該 Atom（或該 Atom 集合）底下要納入計算的觀測 frontmatter 列表，
    每筆至少要有 confidence.value；有 evidence / stance 會被用來做分群與內聚性計算，
    缺少也不會壞掉（分別退化成「各自獨立」與「不額外懲罰」）。

    回傳 dict 而不是單一數字，方便除錯與測試——實際呼叫端多半只需要 ["score"]。
    """
    cfg = _cfg(policy).get("evidence", {})
    mu_prior = cfg.get("prior_mean", 0.5)
    kappa = cfg.get("prior_strength", 2.0)
    cluster_power = cfg.get("cluster_power", 1.0)

    if not observations:
        return {"score": 0.0, "n_observations": 0, "n_clusters": 0, "cohesion": 1.0}

    clusters: dict[tuple, list[float]] = defaultdict(list)
    stances: list[str] = []
    for idx, obs in enumerate(observations):
        conf = (obs.get("confidence") or {}).get("value")
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            continue
        clusters[_cluster_key(obs, idx)].append(conf)
        stances.append(obs.get("stance") or "neutral")

    if not clusters:
        return {"score": 0.0, "n_observations": len(observations), "n_clusters": 0, "cohesion": 1.0}

    # Step 1：叢集內先簡單平均（同一來源重複提到同一件事，只降噪、不重複計分）
    cluster_means = [sum(vals) / len(vals) for vals in clusters.values()]
    # Step 2：叢集間用冪平均取穩健中心值（p 可調，預設算術平均）
    robust_center = _power_mean(cluster_means, cluster_power)
    # Step 3：用「獨立叢集數」K 當有效樣本數做貝氏收斂——K 越大（越多互相獨立的
    # 來源佐證同一件事），越不需要被 prior 往回拉；同一來源狂重複提及不會墊高 K，
    # 這樣才符合「證據獨立性」原本的設計精神（見 policy.yaml evidence_independence）。
    n_clusters = len(cluster_means)
    raw_score = _shrink(robust_center, n_clusters, mu_prior, kappa)
    coh = _cohesion(stances)

    # Cohesion 當懲罰項乘進去：立場分裂的證據，就算平均信心值高，也不該被視為
    # 「這件事很確定」，這是證據本身的性質，跟推論鏈結構無關，放在這一層算。
    score = raw_score * coh

    return {
        "score": round(score, 4),
        "raw_score": round(raw_score, 4),
        "cohesion": round(coh, 4),
        "n_observations": len(observations),
        "n_clusters": len(clusters),
    }


def evidence_confidence(observations: list[dict], policy: dict) -> float:
    return evidence_confidence_detail(observations, policy)["score"]


# ============================================================
# 二、推論信心：「這條推論鏈本身的結構有多可信」
# ============================================================
def _type_reliability(atom_type: str, policy: dict) -> float:
    """沿用既有的 confidence_decay.derived_cap 當作每種 Atom 類型的推論可靠度係數
    ——不重新設計一組新數值，只是把它的角色從「事後夾住信心上限」改成
    「這一跳本身貢獻多少可靠度的乘法因子」，語義更直接，數值不用重調。"""
    cap = policy.get("confidence_decay", {}).get("derived_cap", {}).get(atom_type)
    if cap is not None:
        return float(cap)
    default = _cfg(policy).get("inference", {}).get("default_type_reliability", 0.5)
    return float(default)


def inference_confidence_detail(atom_types: list[str], policy: dict) -> dict:
    """atom_types：沿路徑依序經過的 Atom 類型（單跳查詢時長度為 1）。

    刻意用「幾何平均 × 跳數懲罰」而不是「逐跳相乘」：幾何平均只反映路徑上
    平均每一跳的推論可靠度，不會隨跳數增加而自動被壓低；跳數本身要付出的
    代價（可驗證性隨鏈長下降）用獨立的 depth_penalty 表達，兩件事不互相污染。
    單跳時 depth_penalty^(1-1)=1，行為等同直接回傳 δ(atom_type)，向下相容。
    """
    if not atom_types:
        return {"score": 0.0, "type_reliability": 0.0, "depth_penalty": 1.0, "hops": 0}

    penalty = policy.get("path_confidence", {}).get("depth_penalty_per_hop", 0.9)
    reliabilities = [_type_reliability(t, policy) for t in atom_types]
    type_reliability = _power_mean(reliabilities, 0.0)  # p=0 -> 幾何平均
    hops = len(atom_types)
    depth_penalty = penalty ** max(hops - 1, 0)
    score = type_reliability * depth_penalty

    return {
        "score": round(score, 4),
        "type_reliability": round(type_reliability, 4),
        "depth_penalty": round(depth_penalty, 4),
        "hops": hops,
    }


def inference_confidence(atom_types: list[str], policy: dict) -> float:
    return inference_confidence_detail(atom_types, policy)["score"]


# ============================================================
# 三、合併
# ============================================================
def combine_confidence(evidence: float, inference: float, policy: dict) -> float:
    """預設直接相乘：證據品質、推論結構是兩個獨立維度，任一邊真的很差，
    結論就不該被信任——這是刻意的「短板」語義，不是乘法濫用（兩邊各自的
    公式已經處理過自己的脆弱性來源，見模組開頭說明）。

    若之後覺得乘法太嚴格，可在 policy.yaml 的 confidence_engine.combine_mode
    設成 weighted_geometric，改用兩個可調權重的加權幾何平均；預設不啟用，
    避免一開始就多兩個要調的魔術數字。"""
    mode = _cfg(policy).get("combine_mode", "multiply")
    if mode == "weighted_geometric":
        weights = _cfg(policy).get("combine_weights", {})
        we = weights.get("evidence", 0.5)
        wi = weights.get("inference", 0.5)
        if evidence <= 0 or inference <= 0:
            return 0.0
        return (evidence ** we) * (inference ** wi)
    return evidence * inference


# ============================================================
# 便利函式：單一 Atom／單一路徑的完整計算
# ============================================================
def compute_atom_confidence(observations: list[dict], atom_type: str, policy: dict) -> dict:
    """單一 Atom 的完整信心（activation_engine.py 單跳查詢、adapter.py Orbit 的
    edge score 都是這個特例：path 長度為 1）。"""
    ev_detail = evidence_confidence_detail(observations, policy)
    inf_detail = inference_confidence_detail([atom_type], policy)
    confidence = combine_confidence(ev_detail["score"], inf_detail["score"], policy)
    return {
        "confidence": round(confidence, 4),
        "evidence": ev_detail,
        "inference": inf_detail,
    }


def compute_path_confidence(atoms_along_path: list[dict], policy: dict) -> dict:
    """多跳路徑的完整信心。atoms_along_path 是依序排列的
    [{"type": atom_type, "observations": [...]}, ...]。

    證據信心取路徑上最弱一段（min）——鏈的證據強度取決於最薄弱的環節，這點
    維持跟現有系統一致的「最弱環節」直覺；推論信心走上面的幾何平均 + 跳數懲罰，
    避免多跳時被過度否定。"""
    if not atoms_along_path:
        return {"confidence": 0.0, "evidence": 0.0, "inference": 0.0, "hops": 0}

    per_atom_evidence = [
        evidence_confidence(a.get("observations") or [], policy) for a in atoms_along_path
    ]
    atom_types = [a.get("type", "") for a in atoms_along_path]

    evidence_path = min(per_atom_evidence) if per_atom_evidence else 0.0
    inf_detail = inference_confidence_detail(atom_types, policy)
    confidence = combine_confidence(evidence_path, inf_detail["score"], policy)

    return {
        "confidence": round(confidence, 4),
        "evidence": round(evidence_path, 4),
        "inference": inf_detail["score"],
        "hops": len(atoms_along_path),
    }


if __name__ == "__main__":
    # ---- self-test ----
    demo_policy = {
        "confidence_decay": {
            "derived_cap": {
                "causal": 0.60, "correlation": 0.50, "definition": 0.95,
                "constraint": 0.85, "heuristic": 0.45, "analogy": 0.35,
            }
        },
        "path_confidence": {"depth_penalty_per_hop": 0.90},
        "confidence_engine": {
            "evidence": {"prior_mean": 0.5, "prior_strength": 2.0, "cluster_power": 1.0},
            "inference": {"default_type_reliability": 0.5},
        },
    }

    # 1) 稀疏證據不應假性崩潰到 0，應被拉向 prior，而不是被 mean/median 硬切邏輯搞出跳動
    single_obs = [{"confidence": {"value": 0.9}, "stance": "support", "evidence": ["srcA"]}]
    r = evidence_confidence(single_obs, demo_policy)
    assert 0.5 < r < 0.9, f"單筆高信心觀測應被貝氏收斂拉向 prior 但不崩潰到 0，got {r}"

    # 2) 樣本數增加應連續變化，不應在特定 n 值上跳動（用差分檢查沒有異常大跳）
    base_obs = {"confidence": {"value": 0.9}, "stance": "support"}
    scores = []
    for n in range(1, 30):
        obs_list = [{**base_obs, "evidence": [f"src{i}"]} for i in range(n)]
        scores.append(evidence_confidence(obs_list, demo_policy))
    diffs = [abs(scores[i + 1] - scores[i]) for i in range(len(scores) - 1)]
    assert max(diffs) < 0.15, f"樣本數遞增不應該有大幅跳動（硬邊界殘留），最大差分 {max(diffs)}"
    assert scores[-1] > scores[0], "樣本數增加、觀測一致偏高時，證據信心應該持續上升趨近樣本均值"

    # 3) 多跳疊加不應過度否定（乘法脆弱性回歸測試）
    #    3 段 correlation（δ=0.5）：純乘積會是 0.5^3=0.125，改用幾何平均+獨立跳數懲罰後應明顯更高
    naive_product = 0.5 ** 3
    inf = inference_confidence(["correlation", "correlation", "correlation"], demo_policy)
    assert inf > naive_product * 2, f"3 段中等品質推論不應被乘法過度懲罰，got {inf} vs naive {naive_product}"
    expected = 0.5 * (0.90 ** 2)  # 幾何平均(0.5,0.5,0.5)=0.5，depth_penalty=0.9^2
    assert abs(inf - expected) < 1e-6, f"expected {expected}, got {inf}"

    # 4) 單跳時應與直接查表一致（向下相容）
    single_hop = inference_confidence(["causal"], demo_policy)
    assert abs(single_hop - 0.60) < 1e-6, f"單跳 causal 應等於 derived_cap['causal']=0.60，got {single_hop}"

    # 5) 立場完全分裂時，cohesion 應該真正趨近 0（不是原始 L2 norm 的 0.577 下限）
    split_obs = [
        {"confidence": {"value": 0.8}, "stance": "support", "evidence": ["s1"]},
        {"confidence": {"value": 0.8}, "stance": "contradict", "evidence": ["s2"]},
        {"confidence": {"value": 0.8}, "stance": "neutral", "evidence": ["s3"]},
    ]
    detail = evidence_confidence_detail(split_obs, demo_policy)
    assert detail["cohesion"] < 0.05, f"三方完全分裂應正規化到接近 0，got {detail['cohesion']}"

    # 6) 三個既有呼叫點的典型情境應該給出同一個數字（一致性是本次重構的主要目的）
    same_obs = [
        {"confidence": {"value": 0.8}, "stance": "support", "evidence": ["s1"]},
        {"confidence": {"value": 0.7}, "stance": "support", "evidence": ["s2"]},
    ]
    a = compute_atom_confidence(same_obs, "causal", demo_policy)["confidence"]
    b = combine_confidence(evidence_confidence(same_obs, demo_policy),
                            inference_confidence(["causal"], demo_policy), demo_policy)
    assert abs(a - b) < 1e-9, "同一組觀測透過不同進入點應得到相同信心值"

    print("[Confidence Engine] self-test 全部通過")