#!/usr/bin/env python3
"""
integration/epistemic_adapter/adapter.py — Epistemic Adapter

這是 epistemic 這一側唯一對外暴露的 API。llm-wiki（application/）永遠只能透過這個模組
跟 epistemic 溝通，不可以直接 import runtime/ 或 epistemic/ 底下的任何東西——
這條「不互相 import」的邊界，就是 integration/ 這一層存在的唯一理由。

對外函式：
    handle_query(payload)    — 收 Query Contract，回 Belief Contract
    handle_feedback(payload) — 收 Feedback Contract，寫回 epistemic/7_Query_History/

所有輸入/輸出都會對照 integration/contracts/*.schema.json 做驗證；
驗證失敗會丟 jsonschema.ValidationError，讓呼叫端（wiki_adapter）決定怎麼處理，
而不是在這裡靜默吞掉錯誤。
"""
from __future__ import annotations
import json
import sys
import uuid
from collections import defaultdict
from pathlib import Path
from datetime import datetime

import jsonschema

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_DIR = REPO_ROOT / "integration" / "contracts"

sys.path.insert(0, str(REPO_ROOT / "runtime"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "reasoning"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "activation"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "policy"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "extraction"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "correlation"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "compiler"))
sys.path.insert(0, str(REPO_ROOT / "runtime" / "graph"))
import reasoning_engine as re_  # noqa: E402
import policy_engine as pe  # noqa: E402
import note_extractor as ne  # noqa: E402
import correlation_engine as ce  # noqa: E402
import confidence_engine as cfe  # noqa: E402  # ce 已經被 correlation_engine 佔用，這裡改用 cfe
import graph_engine as ge  # noqa: E402
import inbox_review as ir  # noqa: E402
from common import scan_layer, epoch_to_date, read_tsv  # noqa: E402


def _load_schema(name: str) -> dict:
    with open(CONTRACTS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


_QUERY_SCHEMA = _load_schema("query_contract.schema.json")
_BELIEF_SCHEMA = _load_schema("belief_contract.schema.json")
_FEEDBACK_SCHEMA = _load_schema("feedback_contract.schema.json")


def handle_query(payload: dict) -> dict:
    """Query Contract -> Belief Contract。這是 Step 1（read only）到 Step 3（policy）
    在 integration 層的對外入口；Step 4（write back）走 handle_feedback。"""
    jsonschema.validate(instance=payload, schema=_QUERY_SCHEMA)

    result = re_.reason(
        REPO_ROOT,
        query=payload.get("query", ""),
        context=payload.get("context", {}) or {},
        atom=payload.get("atom"),
    )
    belief = result["belief"]
    jsonschema.validate(instance=belief, schema=_BELIEF_SCHEMA)
    return belief


def handle_feedback(payload: dict) -> dict:
    """Feedback Contract -> 寫入 epistemic/7_Query_History/。
    刻意不自動改動 Atom/Observation（那是人類或 Compiler 核准後才能做的事），
    只負責忠實記錄，供未來 Governance Auditor / 人工審查參考。"""
    jsonschema.validate(instance=payload, schema=_FEEDBACK_SCHEMA)

    log_dir = REPO_ROOT / "epistemic" / "7_Query_History"
    log_dir.mkdir(parents=True, exist_ok=True)
    record = dict(payload)
    record["received_at"] = datetime.now().isoformat()
    out_path = log_dir / f"feedback_{datetime.now().strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
    out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "recorded", "path": str(out_path.relative_to(REPO_ROOT))}


def handle_extract(payload: dict) -> dict:
    """筆記文字 -> LLM 抽取 -> 寫進 0_Inbox/ 的未核准草稿。
    刻意不走三份正式 Contract 之一（不是 Query/Belief/Feedback），因為這是「寫入提案」
    這個全新的操作類型，形狀由這裡跟 CLI/HTTP 呼叫端共同約定。

    payload: { "text": str（必填）, "title": str（選填，預設用文字前幾個字）,
               "date": str（選填，YYYY-MM-DD，預設今天）,
               "ai_config": dict（選填，決定用哪個 LLM provider，見 runtime/llm_client.py；
                                  通常是前端設定頁 localStorage 的 llm-wiki-config 原封不動傳過來）}
    回傳：note_extractor.write_drafts() 的結果（created/warnings/summary）。
    """
    text = (payload.get("text") or "").strip()
    if not text:
        raise ValueError("text 不能是空字串")
    title = (payload.get("title") or "").strip() or (text[:30] + ("…" if len(text) > 30 else ""))
    note_date = payload.get("date")
    ai_config = payload.get("ai_config")

    return ne.extract_note(REPO_ROOT, text=text, title=title, note_date=note_date, ai_config=ai_config)


def handle_correlate(payload: dict) -> dict:
    """兩篇筆記文字 -> 三維關聯分析 -> 分數超過門檻時在 0_Inbox/ 產生提案。

    payload: { "text_a": str, "title_a": str, "text_b": str, "title_b": str,
               "source_a": str（選填）, "source_b": str（選填）,
               "ai_config": dict（選填，決定 stance 維度用哪個 LLM provider，同 handle_extract）}
    """
    text_a = (payload.get("text_a") or "").strip()
    text_b = (payload.get("text_b") or "").strip()
    if not text_a or not text_b:
        raise ValueError("text_a 與 text_b 都不能是空字串")
    title_a = (payload.get("title_a") or "").strip() or "筆記 A"
    title_b = (payload.get("title_b") or "").strip() or "筆記 B"
    source_a = payload.get("source_a") or title_a
    source_b = payload.get("source_b") or title_b
    ai_config = payload.get("ai_config")

    return ce.correlate_notes(REPO_ROOT, text_a, title_a, source_a, text_b, title_b, source_b, ai_config)


def handle_list_inbox() -> list[dict]:
    """列出 0_Inbox/ 裡所有 compiler 認得的草稿，給前端審查列表用。"""
    return ir.list_inbox_drafts(REPO_ROOT)


def handle_get_inbox_draft(filename: str) -> dict:
    """單一草稿的完整內容，給前端「查看完整內容」用。"""
    return ir.get_inbox_draft(REPO_ROOT, filename)


def handle_approve_inbox_draft(filename: str) -> dict:
    """把某份草稿的 approved 改成 true。核准之後還要呼叫 handle_compile() 才會真的編譯。"""
    return ir.approve_inbox_draft(REPO_ROOT, filename)


def handle_reject_inbox_draft(filename: str, reason: str = "") -> dict:
    """人工拒絕某份草稿，搬進 6_Rejected/ 並附上原因（不是直接刪除）。"""
    return ir.reject_inbox_draft(REPO_ROOT, filename, reason)


def handle_compile() -> dict:
    """觸發 Compiler：把所有 approved:true 的草稿驗證、編譯進正式四層；
    驗證失敗的草稿會被移進 6_Rejected/ 並附上原因。直接重用
    runtime/compiler/compiler.py 的邏輯，不重寫一份。"""
    return ir.run_compile(REPO_ROOT)


_RELATION_LABELS = {
    "causal": "因果", "correlation": "相關", "definition": "定義",
    "constraint": "限制", "heuristic": "經驗法則", "analogy": "類比",
}


def _extract_description(body: str) -> str:
    """從 Entity 卡片的 Markdown 內文抓出「## 描述」區塊，供前端卡片顯示用。
    抓不到就回傳空字串，呼叫端自己決定 fallback 文字。"""
    lines = body.splitlines()
    capturing = False
    buf: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            if capturing:
                break
            if "描述" in stripped:
                capturing = True
            continue
        if capturing and stripped:
            buf.append(stripped)
    text = " ".join(buf).strip()
    return text[:200]


def _compute_atom_scores(observations: list, atoms: list, policy: dict) -> dict[str, float]:
    """依 Atom 分組計算信心分數。改呼叫 confidence_engine（證據信心 × 推論信心），
    取代原本「簡單平均再套 confidence_decay cap」的做法——這是 Orbit 面板 edge score
    的來源，也是 CLI/API 認知查詢共用的同一份邏輯，兩邊數字才會一致。
    多個地方共用這個函式，避免重算。"""
    obs_by_atom: dict[str, list] = defaultdict(list)
    for _, fm, _ in observations:
        atom_uid = fm.get("atom")
        if atom_uid:
            obs_by_atom[atom_uid].append(fm)
    scores = {}
    for _, fm, _ in atoms:
        atom_uid, atom_type = fm.get("uid"), fm.get("type", "")
        atom_obs = obs_by_atom.get(atom_uid, [])
        if not atom_obs:
            inf = cfe.inference_confidence([atom_type], policy)
            scores[atom_uid] = round(cfe.combine_confidence(0.5, inf, policy), 3)
            continue
        ev = cfe.evidence_confidence(atom_obs, policy)
        inf = cfe.inference_confidence([atom_type], policy)
        scores[atom_uid] = round(cfe.combine_confidence(ev, inf, policy), 3)
    return scores


def _stale_atom_uids(kb_root: Path) -> set[str]:
    """debt_report.tsv 裡的 atom_uid 集合（知識債務：太久沒有新 support 觀測的因果/經驗類 Atom）。"""
    rows = read_tsv(kb_root / ".index" / "generated" / "debt_report.tsv")
    return {row.get("atom_uid") for row in rows if row.get("atom_uid")}


def handle_graph(center: str | None = None, hops: int = 2) -> dict:
    """給 Frontend M 面板（3D 卡片關聯地圖）用的圖譜資料。
    掃描 1_Entities/ + 2_Atoms/（+ 3_Observations/ 算平均信心），
    組成 [{ id, name, type, desc, links:[{targetId,score,relation,atomUid}] }] 的形狀，
    刻意不透過 jsonschema 驗證——這個端點不是三份正式 Contract 之一，是專門給
    3D 視覺化用的衍生資料，形狀由這個函式跟前端共同約定，不需要獨立 schema 檔案。

    center/hops：只回傳以 center（Entity uid）為中心、hops 跳以內的局部子圖，不給就回整張圖。
    整張圖在實體數量變多之後不適合當預設行為（一次畫幾百張卡片沒有意義），
    所以前端現在預設都會帶 center，只有明確要看全圖時才不帶。
    """
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)

    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")

    nodes_by_uid: dict[str, dict] = {}
    for _, fm, body in entities:
        uid = fm.get("uid")
        if not uid:
            continue
        nodes_by_uid[uid] = {
            "id": uid,
            "name": fm.get("name", uid),
            "type": fm.get("type", "unknown"),
            "desc": _extract_description(body) or "（尚無描述）",
            "links": [],
        }

    scores = _compute_atom_scores(observations, atoms, policy)
    for _, fm, _ in atoms:
        frm, to = fm.get("from"), fm.get("to")
        atom_uid, atom_type = fm.get("uid"), fm.get("type", "")
        if frm not in nodes_by_uid or to not in nodes_by_uid:
            continue  # 指向不存在的 Entity（資料不完整），跳過而不是讓前端崩潰
        nodes_by_uid[frm]["links"].append({
            "targetId": to,
            "score": scores.get(atom_uid, 0.5),
            "relation": _RELATION_LABELS.get(atom_type, atom_type or "關聯"),
            "atomUid": atom_uid,
        })

    if center and center in nodes_by_uid:
        adjacency: dict[str, set[str]] = defaultdict(set)
        for uid, node in nodes_by_uid.items():
            for link in node["links"]:
                adjacency[uid].add(link["targetId"])
                adjacency[link["targetId"]].add(uid)

        visited = {center}
        frontier = {center}
        for _ in range(max(hops, 0)):
            next_frontier: set[str] = set()
            for u in frontier:
                next_frontier |= adjacency.get(u, set())
            next_frontier -= visited
            if not next_frontier:
                break
            visited |= next_frontier
            frontier = next_frontier

        nodes_by_uid = {k: v for k, v in nodes_by_uid.items() if k in visited}
        for node in nodes_by_uid.values():
            node["links"] = [l for l in node["links"] if l["targetId"] in visited]

    return {"nodes": list(nodes_by_uid.values())}


def handle_list_domains() -> dict:
    """回傳目前所有出現過的 domain 值（去重排序），純粹給搜尋篩選的下拉選單用。
    domains 降級成搜尋的篩選條件之一，不再是獨立的「領域總覽」頁面——這是刻意的決定，
    domains 陣列本來的語義就是標籤／篩選條件，不是組織軸心，見 README 的設計討論。"""
    kb_root = REPO_ROOT / "epistemic"
    entities = scan_layer(kb_root, "1_Entities")
    domains: set[str] = set()
    for _, fm, _ in entities:
        domains.update(fm.get("domains") or [])
    return {"domains": sorted(domains)}


def handle_orbit(center: str, max_layer: int | None = None) -> dict:
    """M 面板 Orbit 介面的核心資料來源。拓撲運算（分層、可達性）都交給
    runtime/graph/graph_engine.py，這裡只負責：算 edge_score（confidence_engine）、
    組裝成 Orbit 要的 JSON 形狀、依 policy 門檻分桶。

    兩件事分開算，語義不同：
      - layers：純粹依「跳數」分層（Layer 0 = center 自己，Layer 1 = 直接相鄰...），
        給 Orbit 的同心圓佈局用，滑鼠滾輪 Layer+1 就是多展開一層——graph_engine.bfs_layers()。
      - queue：依 Path Confidence（min(edge_score 沿途) * depth_penalty^(hops-1)）分成
        Strong/Medium/Weak/Hidden 四桶，給左側 Activation Queue 排序用——edge_score
        本身來自 confidence_engine.py（證據信心 × 推論信心，跟 CLI/API 認知查詢、
        Explain 面板同一份邏輯），拓撲傳播交給 graph_engine.weighted_reachability()。
        距離遠但沿途信心都很高的實體，排名可能比距離近但信心低的實體更前面，
        這是刻意的，因為它反映的是「這個關聯有多可信」，不是純粹的空間距離。
    """
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)
    aq_cfg = policy.get("activation_queue", {})
    depth_penalty = policy.get("path_confidence", {}).get("depth_penalty_per_hop", 0.9)
    max_layer = max_layer if max_layer is not None else aq_cfg.get("max_layer", 4)

    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    if center not in entity_by_uid:
        raise FileNotFoundError(f"找不到實體：{center}")

    scores = _compute_atom_scores(observations, atoms, policy)
    adjacency = ge.build_adjacency(atoms)

    # ---- Layer：純跳數 BFS（拓撲交給 graph_engine，這裡只轉換成 Orbit 要的 JSON 形狀）----
    layer_of = ge.bfs_layers(adjacency, center, max_layer)

    layers: list[list[dict]] = [[] for _ in range(max(layer_of.values(), default=0) + 1)]
    for uid, layer_num in layer_of.items():
        fm = entity_by_uid.get(uid, {})
        layers[layer_num].append({
            "uid": uid, "name": fm.get("name", uid), "type": fm.get("type", "unknown"),
            "domains": fm.get("domains") or [],
        })

    # 目前 Orbit 展開範圍內（layer_of 有出現）的所有邊，前端用來畫真正的連線，
    # 不是單純用同心圓「暗示」關係——兩個節點在同一層不代表彼此有連線。
    visited_uids = set(layer_of.keys())
    edges = []
    seen_edge_keys = set()
    for _, fm, _ in atoms:
        frm, to, atom_uid, atom_type = fm.get("from"), fm.get("to"), fm.get("uid"), fm.get("type", "")
        if frm not in visited_uids or to not in visited_uids:
            continue
        key = frozenset((frm, to))
        if key in seen_edge_keys:
            continue
        seen_edge_keys.add(key)
        edges.append({
            "from": frm, "to": to, "atomUid": atom_uid,
            "relation": _RELATION_LABELS.get(atom_type, atom_type or "關聯"),
            "score": scores.get(atom_uid, 0.5),
        })

    # ---- Queue：Path Confidence（拓撲傳播交給 graph_engine.weighted_reachability，
    #      這裡只算 edge_score 當輸入，並依 policy 門檻分桶）----
    reachability = ge.weighted_reachability(adjacency, center, scores, max_layer, depth_penalty)
    best_path_conf = {uid: r["confidence"] for uid, r in reachability.items()}
    best_hops = {uid: r["hops"] for uid, r in reachability.items()}

    strong_min = aq_cfg.get("strong_min", 0.70)
    medium_min = aq_cfg.get("medium_min", 0.40)
    weak_min = aq_cfg.get("weak_min", 0.15)

    buckets = {"strong": [], "medium": [], "weak": []}
    hidden_count = 0
    for uid, conf in best_path_conf.items():
        if uid == center:
            continue
        fm = entity_by_uid.get(uid, {})
        entry = {
            "uid": uid, "name": fm.get("name", uid), "type": fm.get("type", "unknown"),
            "domains": fm.get("domains") or [], "path_confidence": round(conf, 3), "hops": best_hops[uid],
        }
        if conf >= strong_min:
            buckets["strong"].append(entry)
        elif conf >= medium_min:
            buckets["medium"].append(entry)
        elif conf >= weak_min:
            buckets["weak"].append(entry)
        else:
            hidden_count += 1
    for bucket in buckets.values():
        bucket.sort(key=lambda e: -e["path_confidence"])

    return {
        "center": {"uid": center, "name": entity_by_uid[center].get("name", center)},
        "layers": layers,
        "edges": edges,
        "queue": {**buckets, "hidden_count": hidden_count},
    }


def handle_explain(uid: str) -> dict:
    """Orbit 的 Explain 面板：把「這個實體」直接連著的所有 Atom 底下的觀測，
    彙總成 support/contradiction/baseline 三桶——這跟 handle_query() 的差異是，
    handle_query 是針對「一個 Atom」回答，這裡是針對「一個實體」把它所有關聯的
    證據都收斂在一起，因為 Orbit 的焦點是實體，不是單一關係。"""
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)
    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    if uid not in entity_by_uid:
        raise FileNotFoundError(f"找不到實體：{uid}")

    related_atom_uids = {
        fm.get("uid") for _, fm, _ in atoms
        if fm.get("from") == uid or fm.get("to") == uid
    }

    atom_type_by_uid = {fm.get("uid"): fm.get("type", "") for _, fm, _ in atoms}
    support, contradiction, baseline = [], [], []
    obs_fms = []
    for _, fm, _ in observations:
        if fm.get("atom") not in related_atom_uids:
            continue
        conf = (fm.get("confidence") or {}).get("value")
        entry = {"obs": fm.get("uid"), "atom": fm.get("atom"), "epoch": fm.get("epoch"),
                  "confidence": conf}
        obs_fms.append(fm)
        stance = fm.get("stance")
        if stance == "support":
            support.append(entry)
        elif stance == "contradict":
            contradiction.append(entry)
        else:
            baseline.append(entry)

    # 跟 _compute_atom_scores() / activation_engine.py 共用同一份 confidence_engine，
    # 證據信心（跨相關 Atom 的所有觀測）× 推論信心（牽涉到的 Atom 類型），數字才會一致。
    if obs_fms:
        atom_types = sorted({atom_type_by_uid.get(fm.get("atom"), "") for fm in obs_fms})
        ev = cfe.evidence_confidence(obs_fms, policy)
        inf = cfe.inference_confidence(atom_types, policy)
        path_confidence = cfe.combine_confidence(ev, inf, policy)
    else:
        path_confidence = 0.0
    ab = policy.get("abstention", {})
    abstained = (not obs_fms) or path_confidence < ab.get("min_path_confidence", 0.4)

    return {
        "uid": uid,
        "name": entity_by_uid[uid].get("name", uid),
        "support": support,
        "contradiction": contradiction,
        "baseline": baseline,
        "uncertainty": round(1.0 - path_confidence, 3) if obs_fms else 1.0,
        "abstained": abstained,
    }


def handle_reasoning_path(from_uid: str, to_uid: str) -> dict:
    """Reasoning 面板：從 search_origin 到目前 Focus 的路徑（純最短跳數，不是最高信心路徑——
    這裡要的是一個可以講的敘事鏈，不是「哪條路最可信」，那是 Queue 在做的事）。
    直接找最短路徑並把沿途的節點序列回傳，前端負責畫成 A → B → C。"""
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)
    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    if from_uid not in entity_by_uid:
        raise FileNotFoundError(f"找不到實體：{from_uid}")
    if to_uid not in entity_by_uid:
        raise FileNotFoundError(f"找不到實體：{to_uid}")

    adjacency = ge.build_adjacency(atoms)

    if from_uid == to_uid:
        return {"path": [{"uid": from_uid, "name": entity_by_uid[from_uid].get("name", from_uid)}], "found": True}

    max_hops = policy.get("correlation_engine", {}).get("max_graph_hops", 5)
    path_uids = ge.bfs_shortest_path(adjacency, from_uid, to_uid, max_hops)

    if path_uids is None:
        return {"path": [], "found": False}

    return {
        "path": [{"uid": u, "name": entity_by_uid.get(u, {}).get("name", u)} for u in path_uids],
        "found": True,
    }


def handle_timeline(uid: str) -> dict:
    """Timeline 面板：這個實體所有關聯 Atom 底下的觀測，依 epoch 分組排序。
    epoch 欄位在 Observation schema 裡本來就有，但目前沒有任何介面用過——
    這是它第一次被實際拿來用。"""
    kb_root = REPO_ROOT / "epistemic"
    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    if uid not in entity_by_uid:
        raise FileNotFoundError(f"找不到實體：{uid}")

    related_atom_uids = {
        fm.get("uid") for _, fm, _ in atoms
        if fm.get("from") == uid or fm.get("to") == uid
    }

    by_epoch: dict[str, dict] = defaultdict(lambda: {"support": 0, "contradict": 0, "neutral": 0, "observations": []})
    for _, fm, _ in observations:
        if fm.get("atom") not in related_atom_uids:
            continue
        epoch = fm.get("epoch") or "（未標記）"
        stance = fm.get("stance") or "neutral"
        by_epoch[epoch][stance if stance in ("support", "contradict") else "neutral"] += 1
        by_epoch[epoch]["observations"].append(fm.get("uid"))

    def _sort_key(epoch: str):
        d = epoch_to_date(epoch)
        return (0, d) if d else (1, epoch)  # 解析不出日期的排到後面，用字串排序當備援

    entries = [{"epoch": k, **v} for k, v in sorted(by_epoch.items(), key=lambda kv: _sort_key(kv[0]))]
    return {"uid": uid, "timeline": entries}


def handle_search(q: str = "", domain: str = "", type_filter: str = "", stale_only: bool = False) -> dict:
    """搜尋/篩選 Entity 與 Atom，取代「在 3D 圖裡用眼睛找卡片」的主要方式。
    q 對 Entity 比對 name/aliases/uid，對 Atom 比對兩端 Entity 名稱與 uid，都不分大小寫、
    子字串比對，跟 Activation Engine 找實體用的邏輯一致（見 activation_engine.py
    的 find_candidate_entities）。"""
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)
    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")
    stale = _stale_atom_uids(kb_root)

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    q_lower = q.lower().strip()

    matched_entities = []
    for _, fm, _ in entities:
        if domain and domain not in (fm.get("domains") or []):
            continue
        if type_filter and fm.get("type") != type_filter:
            continue
        if q_lower:
            names = [fm.get("name", "")] + list(fm.get("aliases") or []) + [fm.get("uid", "")]
            if not any(q_lower in n.lower() for n in names if n):
                continue
        matched_entities.append({
            "uid": fm.get("uid"), "name": fm.get("name"), "type": fm.get("type"),
            "domains": fm.get("domains") or [],
        })

    scores = _compute_atom_scores(observations, atoms, policy)
    matched_atoms = []
    for _, fm, _ in atoms:
        atom_uid = fm.get("uid")
        if stale_only and atom_uid not in stale:
            continue
        doms = fm.get("domains") or []
        if domain and domain not in doms:
            continue
        frm_name = entity_by_uid.get(fm.get("from"), {}).get("name", fm.get("from"))
        to_name = entity_by_uid.get(fm.get("to"), {}).get("name", fm.get("to"))
        if q_lower:
            haystack = [frm_name or "", to_name or "", atom_uid or ""]
            if not any(q_lower in h.lower() for h in haystack):
                continue
        matched_atoms.append({
            "uid": atom_uid, "from": fm.get("from"), "from_name": frm_name,
            "to": fm.get("to"), "to_name": to_name, "type": fm.get("type"),
            "score": scores.get(atom_uid, 0.5), "stale": atom_uid in stale,
        })

    return {"entities": matched_entities, "atoms": matched_atoms}


def handle_entity_detail(uid: str) -> dict:
    """單一實體的完整資訊：描述、所屬領域、所有直接關聯的 Atom（含信心/是否過期），
    以及有沒有 pending 的調解提案牽涉到它——這是「實體詳情頁」的資料來源，
    取代原本只能在 3D 圖裡點卡片才看得到的資訊。"""
    kb_root = REPO_ROOT / "epistemic"
    policy = pe.load_policy(REPO_ROOT)
    entities = scan_layer(kb_root, "1_Entities")
    atoms = scan_layer(kb_root, "2_Atoms")
    observations = scan_layer(kb_root, "3_Observations")
    stale = _stale_atom_uids(kb_root)

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}
    target = None
    for _, fm, body in entities:
        if fm.get("uid") == uid:
            target = (fm, body)
            break
    if not target:
        raise FileNotFoundError(f"找不到實體：{uid}")
    fm, body = target

    scores = _compute_atom_scores(observations, atoms, policy)
    related = []
    related_atom_uids: set[str] = set()
    for _, atom_fm, _ in atoms:
        if atom_fm.get("from") != uid and atom_fm.get("to") != uid:
            continue
        atom_uid = atom_fm.get("uid")
        related_atom_uids.add(atom_uid)
        outgoing = atom_fm.get("from") == uid
        other_uid = atom_fm.get("to") if outgoing else atom_fm.get("from")
        related.append({
            "atom_uid": atom_uid,
            "direction": "outgoing" if outgoing else "incoming",
            "other_uid": other_uid,
            "other_name": entity_by_uid.get(other_uid, {}).get("name", other_uid),
            "type": atom_fm.get("type"),
            "relation_label": _RELATION_LABELS.get(atom_fm.get("type"), atom_fm.get("type") or "關聯"),
            "score": scores.get(atom_uid, 0.5),
            "stale": atom_uid in stale,
            "last_review": (atom_fm.get("lifecycle") or {}).get("last_review", ""),
        })

    inbox = scan_layer(kb_root, "0_Inbox")
    pending_mediation = [
        path.name for path, _, _ in inbox
        if path.name.startswith("mediation_proposal_")
        and path.stem.replace("mediation_proposal_", "") in related_atom_uids
    ]

    return {
        "uid": uid,
        "name": fm.get("name", uid),
        "type": fm.get("type", "unknown"),
        "domains": fm.get("domains") or [],
        "aliases": fm.get("aliases") or [],
        "description": _extract_description(body) or "（尚無描述）",
        "related_atoms": related,
        "pending_mediation": pending_mediation,
    }


def handle_governance_summary() -> dict:
    """給審查 Modal 標題列用的最小治理提示（不是獨立儀表板頁面——量還小的時候，
    一個獨立頁面的維護成本比它省下來的時間還高，等這兩個數字長期維持兩位數，
    才值得升級成專門的頁面）。"""
    kb_root = REPO_ROOT / "epistemic"
    debt_count = len(_stale_atom_uids(kb_root))
    inbox = scan_layer(kb_root, "0_Inbox")
    mediation_count = sum(1 for path, _, _ in inbox if path.name.startswith("mediation_proposal_"))
    return {"debt_count": debt_count, "mediation_count": mediation_count}


if __name__ == "__main__":
    # self-test：確保 contract 驗證與 pipeline 串接沒問題
    belief = handle_query({
        "query": "",
        "atom": "rate_affects_bank_nim",
        "context": {},
    })
    print("[Epistemic Adapter] handle_query self-test:")
    print(json.dumps(belief, ensure_ascii=False, indent=2))

    fb_result = handle_feedback({
        "type": "feedback",
        "target": belief["support"][0]["obs"] if belief["support"] else "unknown",
        "signal": "low_confidence",
        "note": "self-test 產生的假回饋",
    })
    print("\n[Epistemic Adapter] handle_feedback self-test:")
    print(fb_result)