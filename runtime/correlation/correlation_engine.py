#!/usr/bin/env python3
"""
runtime/correlation/correlation_engine.py — Correlation Engine

責任：分析兩篇筆記（或任意兩段文字）之間的關聯程度，三個維度：

  1. Entity Overlap（實體重疊度）
     兩篇筆記各自提到哪些「已經存在於 epistemic/1_Entities/」的實體，算 Jaccard 相似度。
  2. Graph Distance（認知圖距離）
     兩篇筆記各自的核心實體，在 epistemic/2_Atoms/ 構成的圖上，最短路徑是多近。
     這是三個維度裡權重最高的——字面上不像，但圖譜上緊密相連，往往比純粹關鍵字重疊更有價值。
  3. Stance（立場與互補性）
     呼叫 LLM，判斷兩篇筆記對彼此提到的內容是加強(reinforce)、互補(complementary)、
     矛盾(contradict)、還是無關(neutral)。

前提（重要）：這個引擎假設兩篇筆記提到的實體「已經存在」於 epistemic/1_Entities/
（通常是先前用 runtime/extraction/note_extractor.py 抽取、審查、編譯過的結果）。
如果兩篇筆記講的東西完全是全新的，實體重疊度跟圖距離兩個維度都會是 0 分——
這不是 bug，是提醒你該先讓 note_extractor 建立基礎實體，Correlation Engine
才有東西可以比對。

觸發提案的邏輯（刻意跟原始需求文件的設計不同，見 application/README.md 說明）：
  - 若兩個錨點實體之間「已經有 Atom」：不新增重複的 Atom，只提案一筆新 Observation
    （引用兩篇筆記互相印證這個既有機制），符合系統「Atom 不可變、Observation 只增」原則。
  - 若兩個錨點實體之間「還沒有 Atom」：提案新增 Atom + Observation。
  - 提案永遠是 draft_type + approved:false，寫進 0_Inbox/，不會自動核准。

用法：
    python3 runtime/correlation/correlation_engine.py \
        --note-a path/to/note_a.md --note-b path/to/note_b.md
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, scan_layer, write_proposal  # noqa: E402
from llm_client import call_llm  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "policy"))
import policy_engine as pe  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "graph"))
import graph_engine as ge  # noqa: E402

VALID_ATOM_TYPES = {"causal", "correlation", "definition", "constraint", "heuristic", "analogy"}

STANCE_SYSTEM_PROMPT = """你是一個知識關聯分析器。使用者會給你兩篇筆記的內容，以及圖譜分析
找到的兩個「錨點實體」（這兩篇筆記各自最核心、且在知識圖譜上距離最近的實體）。

請判斷：
1. stance：這兩篇筆記對彼此的立場關係，只能是 contradict / neutral / reinforce / complementary 之一。
   - contradict：兩篇筆記對同一件事有矛盾的說法
   - neutral：兩篇筆記講不同的事，看不出加強或矛盾的關係
   - reinforce：兩篇筆記在講同一件事，互相印證、支持同樣的結論
   - complementary：兩篇筆記講的是同一個主題的不同面向，合起來能拼出更完整的畫面
     （例如一篇講「這個技術演進到哪」，另一篇講「其中一個環節底層怎麼運作」）
2. 如果 stance 不是 neutral，額外建議兩個錨點實體之間可能存在的關係：
   - type：只能是 causal / correlation / definition / constraint / heuristic / analogy 之一
   - mechanism：一兩句話描述這個關係
   - confidence：0~1，你對這個建議關係有多確定（不要每次都給 0.8 這種預設值）

只輸出嚴格 JSON，不要有 markdown code fence、不要有其他文字：
{
  "stance": "complementary",
  "reasoning": "一句話說明為什麼",
  "suggested_relation": {"type": "constraint", "mechanism": "...", "confidence": 0.6}
}
若 stance 是 neutral，suggested_relation 給 null。
"""


# ============================================================
# 維度一：Entity Overlap
# ============================================================
def find_entities_in_text(text: str, entities: dict[str, dict]) -> set[str]:
    """回傳文字中出現的既有 Entity uid 集合（用 name/aliases 子字串比對，不分大小寫）。"""
    text_lower = text.lower()
    found = set()
    for uid, fm in entities.items():
        names = [fm.get("name", "")] + list(fm.get("aliases") or [])
        for n in names:
            if n and n.lower() in text_lower:
                found.add(uid)
                break
    return found


def entity_overlap_score(entities_a: set[str], entities_b: set[str]) -> dict:
    union = entities_a | entities_b
    intersection = entities_a & entities_b
    score = (len(intersection) / len(union)) if union else 0.0
    return {"score": round(score, 3), "intersection": sorted(intersection), "union": sorted(union)}


# ============================================================
# 維度二：Graph Distance（鄰接表/BFS 邏輯已收斂到 runtime/graph/graph_engine.py，
# 這裡只保留跟這個維度語義相關的部分：怎麼挑錨點、怎麼把距離換算成分數）
# ============================================================
def graph_distance_score(adj: "ge.Adjacency", entities_a: set[str], entities_b: set[str],
                          max_hops: int) -> dict:
    """找兩組實體之間最短的一條路徑（取所有配對裡最近的），回傳分數與是哪一對錨點實體。

    優先在「兩篇筆記各自獨有」的實體之間找橋接（entities_a - 交集 × entities_b - 交集）：
    如果隨便挑一個兩邊都提到的詞當錨點，這個維度就只是在重複 entity_overlap 已經講過的事，
    失去「字面上看不出關聯，但圖譜上很近」這個維度存在的意義。只有在獨有實體之間真的
    找不到路徑時，才退而求其次，允許用共同提及的實體當錨點。
    """
    shared = entities_a & entities_b
    distinctive_a, distinctive_b = entities_a - shared, entities_b - shared

    def best_pair(set_a: set[str], set_b: set[str]) -> tuple[str, str, int] | None:
        best: tuple[str, str, int] | None = None
        for a in set_a:
            for b in set_b:
                if a == b:
                    continue
                d = ge.bfs_distance(adj, a, b, max_hops)
                if d is not None and (best is None or d < best[2]):
                    best = (a, b, d)
        return best

    best = best_pair(distinctive_a, distinctive_b) if (distinctive_a and distinctive_b) else None
    if best is None:
        best = best_pair(entities_a, entities_b)  # 退而求其次：允許用共同實體當錨點

    if best is None:
        return {"score": 0.0, "anchor_a": None, "anchor_b": None, "distance": None}
    a, b, d = best
    return {"score": round(1 / (1 + d), 3), "anchor_a": a, "anchor_b": b, "distance": d}


# ============================================================
# 維度三：Stance（需要 LLM）
# ============================================================
def call_llm_stance(text_a: str, text_b: str, title_a: str, title_b: str,
                     ai_config: dict | None = None) -> dict:
    """呼叫 LLM 判斷立場關係，provider 由 ai_config 決定（見 runtime/llm_client.py）。"""
    prompt = f"筆記 A「{title_a}」：\n{text_a}\n\n筆記 B「{title_b}」：\n{text_b}\n"
    raw_text = call_llm(STANCE_SYSTEM_PROMPT, prompt, ai_config)
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM 回傳的內容不是合法 JSON：{e}\n原始回應：{raw_text[:500]}") from e


def stance_score(policy: dict, stance_label: str) -> float:
    labels = policy.get("correlation_engine", {}).get("stance_labels", {})
    return float(labels.get(stance_label, 0.4))


# ============================================================
# 找兩個實體之間有沒有既有 Atom（任一方向、任何類型都算）
# ============================================================
def find_atom_between(atoms: list, a: str, b: str) -> str | None:
    for _, fm, _ in atoms:
        if {fm.get("from"), fm.get("to")} == {a, b}:
            return fm.get("uid")
    return None


# ============================================================
# 主流程
# ============================================================
def compute_correlation(repo_root: Path, text_a: str, title_a: str,
                         text_b: str, title_b: str, ai_config: dict | None = None) -> dict:
    kb_root = repo_root / "epistemic"
    policy = pe.load_policy(repo_root)
    ce_cfg = policy.get("correlation_engine", {})
    weights = ce_cfg.get("weights", {"entity_overlap": 0.3, "graph_distance": 0.5, "stance": 0.2})
    max_hops = ce_cfg.get("max_graph_hops", 5)

    entities = {fm.get("uid"): fm for _, fm, _ in scan_layer(kb_root, "1_Entities") if fm.get("uid")}
    atoms = scan_layer(kb_root, "2_Atoms")
    adj = ge.build_adjacency(atoms)

    ents_a = find_entities_in_text(text_a, entities)
    ents_b = find_entities_in_text(text_b, entities)

    dim_entity = entity_overlap_score(ents_a, ents_b)
    dim_graph = graph_distance_score(adj, ents_a, ents_b, max_hops)

    dim_stance: dict = {"score": None, "label": None, "reasoning": None, "suggested_relation": None}
    stance_error: str | None = None
    try:
        llm_result = call_llm_stance(text_a, text_b, title_a, title_b, ai_config)
        label = llm_result.get("stance", "neutral")
        dim_stance = {
            "score": stance_score(policy, label),
            "label": label,
            "reasoning": llm_result.get("reasoning"),
            "suggested_relation": llm_result.get("suggested_relation"),
        }
    except RuntimeError as e:
        stance_error = str(e)
        dim_stance["score"] = 0.0  # 沒有 LLM 判斷時，這個維度保守給 0，不是假裝有答案

    total = (
        weights.get("entity_overlap", 0.3) * dim_entity["score"]
        + weights.get("graph_distance", 0.5) * dim_graph["score"]
        + weights.get("stance", 0.2) * (dim_stance["score"] or 0.0)
    )

    return {
        "note_a": {"title": title_a, "entities": sorted(ents_a)},
        "note_b": {"title": title_b, "entities": sorted(ents_b)},
        "dimensions": {"entity_overlap": dim_entity, "graph_distance": dim_graph, "stance": dim_stance},
        "stance_error": stance_error,
        "total_score": round(total, 3),
        "proposal_threshold": ce_cfg.get("proposal_threshold", 0.4),
        "atoms_snapshot": atoms,  # 給 propose_atom 用，避免重掃一次
    }


def propose(repo_root: Path, result: dict, title_a: str, title_b: str,
            source_a: str, source_b: str) -> dict:
    """分數超過門檻才會真的寫草稿；回傳 {proposed: bool, reason, path?}。"""
    if result.get("stance_error"):
        # stance 這個維度需要 LLM 才能判斷「兩篇筆記到底是加強、互補、還是矛盾」；
        # 呼叫失敗時寧可不提案，也不要用預設值（例如 neutral/0.4 信心）假裝有判斷結果——
        # 那樣看起來像系統做了語意判斷，實際上只是猜的。
        return {"proposed": False,
                "reason": f"stance 維度需要 LLM 才能判斷，但呼叫失敗：{result['stance_error']}"}

    threshold = result["proposal_threshold"]
    if result["total_score"] < threshold:
        return {"proposed": False, "reason": f"總分 {result['total_score']} 低於門檻 {threshold}"}

    anchor_a = result["dimensions"]["graph_distance"]["anchor_a"]
    anchor_b = result["dimensions"]["graph_distance"]["anchor_b"]
    if not anchor_a or not anchor_b:
        return {"proposed": False, "reason": "找不到可以當錨點的一對實體（兩篇筆記在圖譜上沒有可比較的核心實體）"}

    suggested = result["dimensions"]["stance"].get("suggested_relation")
    stance_label = result["dimensions"]["stance"].get("label")
    if stance_label == "contradict":
        return {"proposed": False,
                "reason": "LLM 判斷兩篇筆記立場矛盾（contradict），不適合自動提案新關係，建議人工檢視"}

    kb_root = repo_root / "epistemic"
    inbox_dir = kb_root / "0_Inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)
    existing_atom_uid = find_atom_between(result["atoms_snapshot"], anchor_a, anchor_b)

    score_breakdown = (
        f"- 實體重疊度：{result['dimensions']['entity_overlap']['score']}"
        f"（交集：{', '.join(result['dimensions']['entity_overlap']['intersection']) or '（無）'}）\n"
        f"- 認知圖距離：{result['dimensions']['graph_distance']['score']}"
        f"（{anchor_a} ↔ {anchor_b}，最短路徑 {result['dimensions']['graph_distance']['distance']} 跳）\n"
        f"- 立場關係：{stance_label}"
        f"（{result['dimensions']['stance'].get('reasoning') or '（無說明）'}）\n"
        f"- **綜合分數：{result['total_score']}**（門檻 {threshold}）\n"
    )

    import yaml
    from datetime import datetime

    if existing_atom_uid:
        # 已經有 Atom 連接這兩個錨點實體 -> 不重複建 Atom，只提案一筆新 Observation
        obs_uid = f"correlation_{anchor_a}_{anchor_b}_{datetime.now().strftime('%Y%m%d%H%M%S')}"[:80]
        stance_to_obs_stance = {"reinforce": "support", "complementary": "support", "neutral": "neutral"}
        obs_stance = stance_to_obs_stance.get(stance_label, "neutral")
        confidence = (suggested or {}).get("confidence", 0.4)
        path = inbox_dir / f"draft_correlation_obs_{anchor_a}_{anchor_b}.md"
        fm = {
            "draft_type": "observation", "approved": False,
            "uid": obs_uid, "atom": existing_atom_uid,
            "epoch": date.today().isoformat(),
            "context": {d: {"value": "", "confidence": 0.0} for d in
                        ["market_regime", "monetary_policy", "liquidity", "inflation", "geopolitical"]},
            "impact": 0, "probability": 0.5, "stance": obs_stance,
            "contradicts": [], "contradiction_reason": "",
            "confidence": {"value": round(float(confidence), 2), "basis": "derived"},
            "evidence": [], "created": date.today().isoformat(),
        }
        fm_yaml = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)
        body = (
            f"## 觀測敘述\n\nCorrelation Engine 發現既有 Atom `{existing_atom_uid}`"
            f"（連接 `{anchor_a}` ↔ `{anchor_b}`）被兩篇筆記互相印證：\n"
            f"- 筆記 A：{title_a}（{source_a}）\n- 筆記 B：{title_b}（{source_b}）\n\n"
            f"## 關聯分數拆解\n\n{score_breakdown}\n"
            f"> ⚠️ `confidence.basis` 標記為 `derived`，審查時請確認信心值是否合理。\n"
        )
        path.write_text(f"---\n{fm_yaml}---\n\n{body}\n", encoding="utf-8")
        return {"proposed": True, "kind": "observation", "atom_uid": existing_atom_uid,
                "path": str(path.relative_to(repo_root))}

    # 還沒有 Atom -> 提案新增 Atom + 一筆 Observation
    if not suggested or suggested.get("type") not in VALID_ATOM_TYPES:
        return {"proposed": False,
                "reason": "LLM 沒有給出合法的建議關係類型（suggested_relation.type），無法提案新 Atom"}

    atom_uid = f"{anchor_a}_{suggested['type']}_{anchor_b}"[:80]
    fm = {
        "draft_type": "atom", "approved": False,
        "uid": atom_uid, "from": anchor_a, "to": anchor_b, "type": suggested["type"],
        "abstraction": {"level": 2, "jump_allowed": False},
        "status": "active",
        "lifecycle": {"status": "active", "last_review": date.today().isoformat()},
        "lineage": {"type": "", "parents": [], "inherit_rules": []},
        "domains": [], "created": date.today().isoformat(),
    }
    fm_yaml = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)
    body = (
        f"## 機制說明\n\n{suggested.get('mechanism', '')}\n\n"
        f"## 已知限制 / 適用邊界\n\n（由 Correlation Engine 自動產生，尚待人工補充）\n\n"
        f"## 抽取來源\n\nCorrelation Engine 分析以下兩篇筆記時發現這個關聯：\n"
        f"- 筆記 A：{title_a}（{source_a}）\n- 筆記 B：{title_b}（{source_b}）\n\n"
        f"## 關聯分數拆解\n\n{score_breakdown}\n"
    )
    path = inbox_dir / f"draft_correlation_atom_{atom_uid}.md"
    path.write_text(f"---\n{fm_yaml}---\n\n{body}\n", encoding="utf-8")
    return {"proposed": True, "kind": "atom", "atom_uid": atom_uid,
            "path": str(path.relative_to(repo_root))}


def correlate_notes(repo_root: Path, text_a: str, title_a: str, source_a: str,
                     text_b: str, title_b: str, source_b: str,
                     ai_config: dict | None = None) -> dict:
    result = compute_correlation(repo_root, text_a, title_a, text_b, title_b, ai_config)
    proposal = propose(repo_root, result, title_a, title_b, source_a, source_b)
    result.pop("atoms_snapshot", None)  # 不需要回傳給呼叫端，純粹是內部用的
    result["proposal"] = proposal
    return result


def main():
    ap = argparse.ArgumentParser(description="Correlation Engine")
    ap.add_argument("--note-a", required=True)
    ap.add_argument("--note-b", required=True)
    ap.add_argument("--repo-root", default=None)
    ap.add_argument("--provider", default=None, choices=["anthropic", "openai", "llama", "custom"],
                     help="LLM provider，預設 anthropic（見 runtime/llm_client.py）")
    ap.add_argument("--llama-host", default=None, help="provider=llama 時的 host，預設 http://127.0.0.1")
    ap.add_argument("--llama-port", default=None, help="provider=llama 時的 port，預設 8080")
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(Path.cwd())
    path_a, path_b = Path(args.note_a), Path(args.note_b)
    text_a, text_b = path_a.read_text(encoding="utf-8"), path_b.read_text(encoding="utf-8")
    title_a, title_b = path_a.stem, path_b.stem

    ai_config = None
    if args.provider:
        ai_config = {"ai_provider": args.provider}
        if args.llama_host:
            ai_config["llama_host"] = args.llama_host
        if args.llama_port:
            ai_config["llama_port"] = args.llama_port

    result = correlate_notes(repo_root, text_a, title_a, str(path_a),
                              text_b, title_b, str(path_b), ai_config)

    print(f"[Correlation Engine] {title_a}  ×  {title_b}")
    print(f"  實體重疊度: {result['dimensions']['entity_overlap']['score']}")
    print(f"  認知圖距離: {result['dimensions']['graph_distance']['score']} "
          f"(錨點: {result['dimensions']['graph_distance']['anchor_a']} ↔ "
          f"{result['dimensions']['graph_distance']['anchor_b']}, "
          f"距離: {result['dimensions']['graph_distance']['distance']})")
    print(f"  立場關係: {result['dimensions']['stance']['label']} "
          f"(分數: {result['dimensions']['stance']['score']})")
    if result.get("stance_error"):
        print(f"  ⚠️  {result['stance_error']}")
    print(f"  綜合分數: {result['total_score']}（門檻 {result['proposal_threshold']}）")
    print()
    if result["proposal"]["proposed"]:
        print(f"  ✔ 已產生提案（{result['proposal']['kind']}）→ {result['proposal']['path']}")
    else:
        print(f"  （未產生提案：{result['proposal']['reason']}）")


if __name__ == "__main__":
    main()