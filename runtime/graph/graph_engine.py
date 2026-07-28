#!/usr/bin/env python3
"""
runtime/graph/graph_engine.py — Graph Engine（Atom 圖的共用拓撲運算）

背景：在這個模組出現之前，「在 Atom 圖上找路徑」這件事被獨立寫了三次：
  1. correlation_engine.py 的 build_adjacency() + shortest_path()（無權重距離）
  2. adapter.py 的 handle_reasoning_path()（無權重 BFS，但自己重新刻了一次，
     還額外要維護 predecessor 做路徑重建）
  3. adapter.py 的 handle_orbit()（帶權重的類 Bellman-Ford 鬆弛，_build_adjacency_with_scores()
     另外建一份鄰接表）
三份實作對「鄰接表」的資料結構定義都不一樣（set[str] vs list[tuple]），語義也有微妙差異，
跟 confidence 曾經被算三次是同一種問題：概念一樣，但因為沒有共用模組，各自長出一套。

這個模組只負責**拓撲**（在圖上怎麼走、走多遠、哪條最強），不負責**信心怎麼算**——
信心數字（edge_score）由呼叫端算好、當參數傳進來（通常來自 confidence_engine.py），
兩件事分開，這裡才不會變成第三套信心公式的藏身處。

刻意不做的事：不在這裡合併「多條獨立路徑」的信心（例如 Noisy-OR）。這裡只找/評估
單一路徑，「要不要把多條路徑當成互相佐證」是語義判斷，見與使用者的討論——那件事該
交給 correlation/inbox 管線由人／LLM 判斷，不是在圖遍歷這一層自動生效。

不是 CLI；被 correlation_engine.py / adapter.py 匯入使用。可直接執行做 self-test。
"""
from __future__ import annotations
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/


@dataclass(frozen=True)
class Edge:
    neighbor: str
    atom_uid: str
    atom_type: str


Adjacency = dict[str, list[Edge]]


# ============================================================
# 建圖
# ============================================================
def build_adjacency(atoms: list) -> Adjacency:
    """無向鄰接表：{entity_uid: [Edge(neighbor, atom_uid, atom_type), ...]}。

    atoms 是 common.scan_layer() 回傳的 (path, frontmatter, body) tuple 列表。
    刻意做成無向——「概念上有多近」不看因果方向；每個呼叫端（correlation_engine 的
    圖距離、adapter 的 Orbit/Reasoning Path）都是這個語義，沒有一個真的需要有向圖，
    所以不多做一個參數去分岔。"""
    adjacency: Adjacency = defaultdict(list)
    for _, fm, _ in atoms:
        frm, to = fm.get("from"), fm.get("to")
        if not frm or not to:
            continue
        atom_uid, atom_type = fm.get("uid"), fm.get("type", "")
        adjacency[frm].append(Edge(to, atom_uid, atom_type))
        adjacency[to].append(Edge(frm, atom_uid, atom_type))
    return adjacency


def neighbors(adjacency: Adjacency, node: str) -> set[str]:
    return {e.neighbor for e in adjacency.get(node, [])}


# ============================================================
# 無權重：純拓撲
# ============================================================
def bfs_layers(adjacency: Adjacency, center: str, max_hops: int) -> dict[str, int]:
    """依跳數分層，center 本身是 layer 0。給 Orbit 同心圓佈局用（只管拓撲，不管信心）。"""
    layer_of: dict[str, int] = {center: 0}
    frontier = [center]
    for layer_num in range(1, max_hops + 1):
        next_frontier: list[str] = []
        for node in frontier:
            for e in adjacency.get(node, []):
                if e.neighbor not in layer_of:
                    layer_of[e.neighbor] = layer_num
                    next_frontier.append(e.neighbor)
        if not next_frontier:
            break
        frontier = next_frontier
    return layer_of


def bfs_shortest_path(adjacency: Adjacency, start: str, end: str, max_hops: int) -> list[str] | None:
    """回傳最短路徑上的節點序列（含頭尾），找不到回傳 None。給 Reasoning Path 面板用
    ——要的是一條可以講的敘事鏈，不是最高信心的路徑，所以不看權重。"""
    if start == end:
        return [start]
    prev: dict[str, str] = {}
    visited = {start}
    frontier = [start]
    for _ in range(max_hops):
        next_frontier: list[str] = []
        for node in frontier:
            for e in adjacency.get(node, []):
                if e.neighbor in visited:
                    continue
                visited.add(e.neighbor)
                prev[e.neighbor] = node
                if e.neighbor == end:
                    path = [end]
                    while path[-1] != start:
                        path.append(prev[path[-1]])
                    path.reverse()
                    return path
                next_frontier.append(e.neighbor)
        frontier = next_frontier
        if not frontier:
            break
    return None


def bfs_distance(adjacency: Adjacency, start: str, end: str, max_hops: int) -> int | None:
    """只需要距離、不需要路徑內容時用這個（correlation_engine 的圖距離維度）。"""
    path = bfs_shortest_path(adjacency, start, end, max_hops)
    return (len(path) - 1) if path else None


# ============================================================
# 帶權重：Path Confidence 可達性
# ============================================================
def weighted_reachability(adjacency: Adjacency, center: str, edge_scores: dict[str, float],
                           max_hops: int, depth_penalty: float,
                           default_edge_score: float = 0.5) -> dict[str, dict]:
    """類 Bellman-Ford 鬆弛：從 center 出發最多展開 max_hops 跳，對每個可達節點保留
    「目前找到最強的一條路徑」的信心與跳數。給 Orbit 的 Activation Queue 用。

    信心公式：min(沿途 edge_score) * depth_penalty^(hops-1)——單一路徑內部取最弱環節，
    這是拓撲層該管的事；如果一個節點同時被多條路徑到達，這裡只留最強那條，不做
    多路徑疊加（見模組開頭說明，那是語義判斷，不在這裡做）。

    edge_scores：{atom_uid: score}，由呼叫端算好傳入（通常來自 confidence_engine），
    這個函式完全不碰信心怎麼算，只負責沿圖傳播。"""
    best_conf: dict[str, float] = {center: 1.0}
    best_hops: dict[str, int] = {center: 0}
    frontier = [center]
    visited = {center}
    for _ in range(max_hops):
        next_frontier: list[str] = []
        for node in frontier:
            node_conf = best_conf[node]
            node_hops = best_hops[node]
            for e in adjacency.get(node, []):
                edge_score = edge_scores.get(e.atom_uid, default_edge_score)
                new_hops = node_hops + 1
                new_conf = min(node_conf, edge_score) * (depth_penalty ** max(new_hops - 1, 0))
                if e.neighbor not in best_conf or new_conf > best_conf[e.neighbor]:
                    best_conf[e.neighbor] = new_conf
                    best_hops[e.neighbor] = new_hops
                if e.neighbor not in visited:
                    visited.add(e.neighbor)
                    next_frontier.append(e.neighbor)
        frontier = next_frontier
        if not frontier:
            break
    return {uid: {"confidence": round(conf, 4), "hops": best_hops[uid]} for uid, conf in best_conf.items()}


if __name__ == "__main__":
    # ---- self-test ----
    # 合成一個小圖：A-B-C-D（鏈狀）＋ A-E（旁支），atom_uid 用 "ab"/"bc"/"cd"/"ae"
    fake_atoms = [
        (None, {"from": "A", "to": "B", "uid": "ab", "type": "causal"}, None),
        (None, {"from": "B", "to": "C", "uid": "bc", "type": "correlation"}, None),
        (None, {"from": "C", "to": "D", "uid": "cd", "type": "causal"}, None),
        (None, {"from": "A", "to": "E", "uid": "ae", "type": "definition"}, None),
    ]
    adj = build_adjacency(fake_atoms)

    # 1) 無向：B 應該同時看到 A 跟 C
    assert neighbors(adj, "B") == {"A", "C"}, f"got {neighbors(adj, 'B')}"

    # 2) bfs_layers：以 A 為中心，B/E 是 layer1，C 是 layer2，D 是 layer3
    layers = bfs_layers(adj, "A", max_hops=5)
    assert layers == {"A": 0, "B": 1, "E": 1, "C": 2, "D": 3}, f"got {layers}"

    # 3) max_hops 限制要生效：只展開 1 層，C/D 不該出現
    layers_limited = bfs_layers(adj, "A", max_hops=1)
    assert "C" not in layers_limited and "D" not in layers_limited

    # 4) bfs_shortest_path / bfs_distance
    path = bfs_shortest_path(adj, "A", "D", max_hops=5)
    assert path == ["A", "B", "C", "D"], f"got {path}"
    assert bfs_distance(adj, "A", "D", max_hops=5) == 3
    assert bfs_distance(adj, "A", "Z", max_hops=5) is None  # 不存在的節點
    assert bfs_shortest_path(adj, "A", "A", max_hops=5) == ["A"]  # 起訖點相同

    # 5) 跳數不夠時該找不到路徑，不能默默回傳錯的東西
    assert bfs_shortest_path(adj, "A", "D", max_hops=2) is None

    # 6) weighted_reachability：ab 信心 0.9、bc 信心 0.3、cd 信心 0.9，
    #    A→D 沿途最弱一段是 bc(0.3)，應該取 min 而不是其他統計量
    scores = {"ab": 0.9, "bc": 0.3, "cd": 0.9, "ae": 0.8}
    reach = weighted_reachability(adj, "A", scores, max_hops=5, depth_penalty=0.9)
    assert reach["B"]["confidence"] == 0.9, f"got {reach['B']}"
    # C: min(0.9, 0.3) * 0.9^1 = 0.27
    assert abs(reach["C"]["confidence"] - 0.27) < 1e-6, f"got {reach['C']}"
    assert reach["D"]["hops"] == 3

    print("[Graph Engine] self-test 全部通過")