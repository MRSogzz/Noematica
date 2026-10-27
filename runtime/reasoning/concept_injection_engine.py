#!/usr/bin/env python3
"""
runtime/reasoning/concept_injection_engine.py — Concept Injection Engine

責任：「關鍵詞注入」的核心實作。使用者指定一個實體，系統沿知識圖譜
多跳展開，把信心足夠的關聯鏈撈出來，每條生成一段敘事，最後把 N 條
敘事交給 LLM 做總結——這是「主動沿圖擴散」，不是「單點認知查詢」。
（單點查詢是 reasoning_engine.reason() 的職責。）

LLM provider 支援（依 ai_config.ai_provider）：
  - anthropic（預設）：打 Anthropic 雲端 API
  - openai：打 OpenAI 雲端 API
  - llama：打本機 llama-server（OpenAI-compatible /v1/chat/completions）
  - custom：打任意 OpenAI-compatible 端點

跟 server.ts 的 /api/wiki/generate 一致，前端設定頁選什麼就用什麼。
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

_RUNTIME_DIR = Path(__file__).resolve().parents[1]  # runtime/
sys.path.insert(0, str(_RUNTIME_DIR))
sys.path.insert(0, str(_RUNTIME_DIR / "policy"))
sys.path.insert(0, str(_RUNTIME_DIR / "reasoning"))

from common import find_repo_root, load_entities, load_atoms, load_observations  # noqa: E402
import policy_engine as pe  # noqa: E402
import confidence_engine as ce  # noqa: E402


# Atom type → 中文關係標籤，跟 integration/epistemic_adapter/adapter.py 的 _RELATION_LABELS 一致
_RELATION_LABELS = {
    "causal": "因果", "correlation": "相關", "definition": "定義",
    "constraint": "限制", "heuristic": "經驗法則", "analogy": "類比",
}


# ══════════════════════════════════════════════════════════════════════════════
# LLM 呼叫（支援四種 provider，跟 server.ts 的 /api/wiki/generate 邏輯一致）
# ══════════════════════════════════════════════════════════════════════════════

_LLM_TIMEOUT = 120  # 本機 llama 可能跑很久，給寬鬆一點


def _call_llm_with_config(prompt: str, ai_config: dict | None = None) -> dict:
    """根據 ai_config.ai_provider 決定打哪個 LLM。

    回傳結構固定（跟 reasoning_engine.call_llm 對齊）：
      {"dry_run": bool, "prompt": str, "response"?: str, "error"?: str, "note"?: str}

    任何呼叫失敗都不拋異常，一律回結構化結果——讓上層決定怎麼顯示。
    """
    ai_config = ai_config or {}
    provider = (ai_config.get("ai_provider") or os.environ.get("AI_PROVIDER") or "anthropic").lower()

    if provider == "llama":
        return _call_llama(prompt, ai_config)
    elif provider == "openai":
        return _call_openai(prompt)
    elif provider == "custom":
        return _call_custom(prompt, ai_config)
    else:
        # anthropic（預設）：直接沿用既有 reasoning_engine.call_llm，
        # 保持跟 handle_query 完全相同的行為（包括沒有 key 時的 dry-run）
        import reasoning_engine as re_
        return re_.call_llm(prompt)


def _post_json(url: str, body: dict, headers: dict | None = None, timeout: int = _LLM_TIMEOUT) -> dict:
    """通用 POST JSON helper。失敗時 raise 帶清楚訊息的例外，讓呼叫端轉成結構化結果。"""
    data = json.dumps(body).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _extract_text_from_openai_response(data: dict) -> str:
    """從 OpenAI-compatible 回應抽文字（llama-server / openai / custom 共用這個格式）。"""
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return msg.get("content") or ""


def _call_llama(prompt: str, ai_config: dict) -> dict:
    """呼叫本機 llama-server（OpenAI-compatible /v1/chat/completions）。不需要 API key。"""
    host = (ai_config.get("llama_host") or "http://127.0.0.1").rstrip("/")
    port = ai_config.get("llama_port") or "8080"
    url = f"{host}:{port}/v1/chat/completions"

    try:
        data = _post_json(url, {
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4096,
            "temperature": 0.3,
            "stream": False,
        })
        text = _extract_text_from_openai_response(data)
        return {"dry_run": False, "prompt": prompt, "response": text}

    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"本機 llama-server 呼叫失敗（HTTP {e.code}）：{detail or e.reason}",
            "note": f"請確認 llama-server 已啟動並監聽 {host}:{port}。",
        }

    except urllib.error.URLError as e:
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"無法連線到本機 llama-server（{url}）：{e.reason}",
            "note": f"請確認 llama-server 已啟動，且監聽 {host}:{port}。",
        }

    except Exception as e:  # noqa: BLE001
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"llama-server 呼叫失敗：{type(e).__name__}: {e}",
        }


def _call_openai(prompt: str) -> dict:
    """呼叫 OpenAI /v1/chat/completions。Key 從 .env 的 OPENAI_API_KEY 讀。"""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {
            "dry_run": True, "prompt": prompt,
            "error": "未設定 OPENAI_API_KEY",
            "note": "請在 repo 根目錄 .env 設定 OPENAI_API_KEY，或改選 llama provider。",
        }

    try:
        data = _post_json(
            "https://api.openai.com/v1/chat/completions",
            {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1000,
                "temperature": 0.3,
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )
        text = _extract_text_from_openai_response(data)
        return {"dry_run": False, "prompt": prompt, "response": text}

    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"OpenAI API 呼叫失敗（HTTP {e.code}）：{detail or e.reason}",
        }

    except Exception as e:  # noqa: BLE001
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"OpenAI API 呼叫失敗：{type(e).__name__}: {e}",
        }


def _call_custom(prompt: str, ai_config: dict) -> dict:
    """呼叫自訂 OpenAI-compatible 端點。"""
    base_url = (ai_config.get("custom_base_url") or "").rstrip("/")
    api_key = (ai_config.get("custom_api_key") or "").strip()
    model = ai_config.get("custom_model") or "local-model"

    if not base_url:
        return {
            "dry_run": True, "prompt": prompt,
            "error": "未設定自訂端點的 Base URL",
            "note": "請在設定頁填入 Base URL（例如 http://127.0.0.1:11434 給 Ollama）。",
        }

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        data = _post_json(
            f"{base_url}/v1/chat/completions",
            {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1000,
                "temperature": 0.3,
            },
            headers=headers,
        )
        text = _extract_text_from_openai_response(data)
        return {"dry_run": False, "prompt": prompt, "response": text}

    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"自訂端點呼叫失敗（HTTP {e.code}）：{detail or e.reason}",
        }

    except Exception as e:  # noqa: BLE001
        return {
            "dry_run": True, "prompt": prompt,
            "error": f"自訂端點呼叫失敗：{type(e).__name__}: {e}",
        }


# ══════════════════════════════════════════════════════════════════════════════
# 圖譜展開（純本地，不依賴 LLM）
# ══════════════════════════════════════════════════════════════════════════════

def _resolve_entity_uid(entities: list, entity_text: str) -> str | None:
    """把使用者輸入的 entity 文字解析成 uid。

    優先順序：
      1. name / uid 精確匹配（不分大小寫）
      2. alias 精確匹配
      3. name / uid / alias 子串匹配，多個候選時選名字最短的（最精確）
    """
    q = (entity_text or "").strip()
    if not q:
        return None
    q_lower = q.lower()

    # Pass 1: name / uid 精確匹配
    for _, fm, _ in entities:
        uid = fm.get("uid")
        if not uid:
            continue
        if str(fm.get("name", "")).lower() == q_lower or str(uid).lower() == q_lower:
            return uid

    # Pass 2: alias 精確匹配
    for _, fm, _ in entities:
        uid = fm.get("uid")
        if not uid:
            continue
        aliases = [str(a).lower() for a in (fm.get("aliases") or [])]
        if q_lower in aliases:
            return uid

    # Pass 3: 子串匹配，選名字最短者（最精確）
    candidates: list[tuple[int, str]] = []
    for _, fm, _ in entities:
        uid = fm.get("uid")
        if not uid:
            continue
        names = [str(fm.get("name", "")), str(uid)] + [str(a) for a in (fm.get("aliases") or [])]
        if any(q_lower in n.lower() for n in names if n):
            candidates.append((len(str(fm.get("name", ""))), uid))

    if not candidates:
        return None
    candidates.sort()
    return candidates[0][1]


def _atom_scores(observations: list, atoms: list, policy: dict) -> dict[str, float]:
    """依 Atom 分組計算信心分數。跟 adapter.py 的 _compute_atom_scores 邏輯完全一致
    （兩邊共用同一份 confidence_engine，數字才會一致）。"""
    obs_by_atom: dict[str, list] = defaultdict(list)
    for _, fm, _ in observations:
        atom_uid = fm.get("atom")
        if atom_uid:
            obs_by_atom[atom_uid].append(fm)

    scores: dict[str, float] = {}
    for _, fm, _ in atoms:
        atom_uid = fm.get("uid")
        atom_type = fm.get("type", "")
        atom_obs = obs_by_atom.get(atom_uid, [])
        if not atom_obs:
            inf = ce.inference_confidence([atom_type], policy)
            scores[atom_uid] = round(ce.combine_confidence(0.5, inf, policy), 3)
            continue
        ev = ce.evidence_confidence(atom_obs, policy)
        inf = ce.inference_confidence([atom_type], policy)
        scores[atom_uid] = round(ce.combine_confidence(ev, inf, policy), 3)
    return scores


def _build_adjacency(atoms: list, valid_uids: set[str]) -> tuple[dict, dict]:
    """建構無向鄰接表（因為「關聯」是雙向的），跳過指向不存在 Entity 的 Atom。"""
    adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    atom_by_uid: dict[str, dict] = {}

    for _, fm, _ in atoms:
        frm = fm.get("from")
        to = fm.get("to")
        atom_uid = fm.get("uid")
        if not frm or not to or not atom_uid:
            continue
        if frm not in valid_uids or to not in valid_uids:
            continue
        adjacency[frm].append((to, atom_uid))
        adjacency[to].append((frm, atom_uid))
        atom_by_uid[atom_uid] = fm

    return adjacency, atom_by_uid


def _bfs_best_paths(
    adjacency: dict,
    scores: dict,
    center: str,
    max_hops: int,
    depth_penalty: float,
) -> dict[str, dict]:
    """BFS 從 center 出發，對每個可達節點保留最佳路徑（path_confidence 最高）。

    path_confidence 公式：
      hops=1: edge_score
      hops>=2: min(edge_score 沿途) × depth_penalty^(hops-1)
    """
    best: dict[str, dict] = {
        center: {"uids": [center], "atoms": [], "confidence": 1.0, "hops": 0}
    }

    queue: deque = deque([(center, [center], [], 1.0, 0)])

    while queue:
        uid, path_uids, path_atoms, min_score, hops = queue.popleft()
        if hops >= max_hops:
            continue

        for neighbor, atom_uid in adjacency.get(uid, []):
            if neighbor in path_uids:
                continue

            edge_score = scores.get(atom_uid, 0.5)
            new_min = edge_score if hops == 0 else min(min_score, edge_score)
            new_hops = hops + 1
            new_conf = new_min * (depth_penalty ** (new_hops - 1))

            existing = best.get(neighbor)
            if existing is None or new_conf > existing["confidence"]:
                new_path_uids = path_uids + [neighbor]
                new_path_atoms = path_atoms + [atom_uid]
                best[neighbor] = {
                    "uids": new_path_uids,
                    "atoms": new_path_atoms,
                    "confidence": new_conf,
                    "hops": new_hops,
                }
                queue.append((neighbor, new_path_uids, new_path_atoms, new_min, new_hops))

    return best


def _build_narrative(candidate: dict, entity_by_uid: dict, atom_by_uid: dict) -> str:
    """把 uids + atoms 序列拼成可讀的敘事鏈。格式：A →[因果] B →[相關] C"""
    uids = candidate["uids"]
    atoms = candidate["atoms"]
    names = [entity_by_uid.get(u, {}).get("name", u) for u in uids]

    parts = [names[0]]
    for i, atom_uid in enumerate(atoms):
        atom_fm = atom_by_uid.get(atom_uid, {})
        atom_type = atom_fm.get("type", "")
        label = _RELATION_LABELS.get(atom_type, atom_type or "關聯")
        parts.append(f"→[{label}] {names[i + 1]}")
    return " ".join(parts)


def _build_prompt(entity_name: str, chain: list[dict]) -> str:
    """把 N 條 narrative 組成給 LLM 的 prompt。

    目標：讓 LLM 用關聯鏈當素材，說明「這個實體是怎麼回事」，
    而不是描述「它在圖譜中的位置」。關聯鏈是線索，不是答案本身。
    """
    lines = [
        f"使用者想透過知識圖譜理解：「{entity_name}」",
        "",
        "以下是從這個實體出發、沿關聯鏈展開得到的高信心路徑——",
        "這些是理解的線索，不是最終答案：",
        "",
    ]
    for i, c in enumerate(chain, 1):
        lines.append(f"{i}. {c['narrative']}（信心 {c['confidence']:.2f}）")
    lines.append("")

    if len(chain) == 1:
        lines.append(
            "請根據以上關聯鏈，用繁體中文說明「這個實體是什麼、它與該關聯概念之間的關係意味著什麼」。"
            "把這條關聯當作素材，去解釋這個實體在真實世界中的角色、運作方式或關鍵特徵——"
            "而不是描述「它在圖中的位置」。"
            "因為只有一條線索，請明確區分「關聯鏈明示的內容」與「你的合理推論」，"
            "不要為了讓回答豐富而硬編出不存在的對立或張力。"
            "關聯鏈是你唯一的具體事實來源，不要引入清單以外的具體斷言（數字、日期、人名等）。"
        )
    else:
        lines.append(
            "請根據以上關聯鏈，用繁體中文說明「這個實體是什麼、它在真實世界中扮演什麼角色、"
            "以及這些關聯概念如何共同構成對它的完整理解」。"
            "把這些關聯當作素材——目標是讓人讀完之後理解「這個東西是怎麼回事」，"
            "而不是理解「它在圖譜中位於什麼位置」。"
            "若不同關聯指向不同面向（例如一部分講功能、一部分講限制、一部分講來源），"
            "請分開說明再統整；若彼此矛盾，明確指出。"
            "關聯鏈是你唯一的具體事實來源，不要引入清單以外的具體斷言。"
        )
    return "\n".join(lines)


def inject_concept(
    repo_root: Path,
    entity: str,
    max_hops: int = 3,
    top_k: int = 6,
    ai_config: dict | None = None,
) -> dict:
    """核心函式：entity 文字 → 多跳關聯鏈 + LLM 總結。

    ai_config：前端 localStorage 的 llm-wiki-config 原封不動傳進來即可，
               用來決定要打哪個 LLM provider（anthropic / openai / llama / custom）。
               不給就預設用 anthropic（或環境變數 AI_PROVIDER）。
    """
    kb_root = repo_root / "epistemic"
    policy = pe.load_policy(repo_root)
    aq_cfg = policy.get("activation_queue", {})
    medium_min = aq_cfg.get("medium_min", 0.40)
    depth_penalty = policy.get("path_confidence", {}).get("depth_penalty_per_hop", 0.9)

    entities = load_entities(kb_root)
    atoms = load_atoms(kb_root)
    observations = load_observations(kb_root)

    entity_by_uid = {fm.get("uid"): fm for _, fm, _ in entities if fm.get("uid")}

    # 1. 解析 entity → uid
    center_uid = _resolve_entity_uid(entities, entity)
    if not center_uid:
        return {
            "entity": entity,
            "center_uid": None,
            "chain": [],
            "answer": (
                f"知識圖譜中找不到符合「{entity}」的實體。"
                f"請嘗試更精確的名稱，或先用「📝 筆記抽取」建立相關知識。"
            ),
            "dry_run": True,
            "error": "entity_not_found",
            "provider": (ai_config or {}).get("ai_provider") or "anthropic",
            "plugin": None,
        }

    center_name = entity_by_uid.get(center_uid, {}).get("name", center_uid)

    # 2. 建圖 + 算 edge scores
    adjacency, atom_by_uid = _build_adjacency(atoms, set(entity_by_uid.keys()))
    scores = _atom_scores(observations, atoms, policy)

    # 3. BFS 找最佳路徑
    best_paths = _bfs_best_paths(adjacency, scores, center_uid, max_hops, depth_penalty)

    # 4. 篩選 + 排序
    candidates: list[dict] = []
    for uid, info in best_paths.items():
        if uid == center_uid:
            continue
        if info["confidence"] < medium_min:
            continue
        candidates.append({
            "uid": uid,
            "name": entity_by_uid.get(uid, {}).get("name", uid),
            "confidence": round(info["confidence"], 3),
            "hops": info["hops"],
            "uids": info["uids"],
            "atoms": info["atoms"],
        })
    candidates.sort(key=lambda c: -c["confidence"])
    candidates = candidates[:top_k]

    if not candidates:
        return {
            "entity": center_name,
            "center_uid": center_uid,
            "chain": [],
            "answer": (
                f"從「{center_name}」出發，在 {max_hops} 跳以內找不到信心 >= {medium_min} 的關聯鏈。"
                f"可能是這個實體的關聯太少，或信心都不足。"
            ),
            "dry_run": True,
            "error": None,
            "provider": (ai_config or {}).get("ai_provider") or "anthropic",
            "plugin": None,
        }

    # 5. 生成 narrative
    chain: list[dict] = []
    for c in candidates:
        narrative = _build_narrative(c, entity_by_uid, atom_by_uid)
        chain.append({
            "narrative": narrative,
            "confidence": c["confidence"],
            "hops": c["hops"],
            "uid": c["uid"],
        })

    # 6. 呼叫 LLM（依 ai_config 分流到 anthropic / openai / llama / custom）
    prompt = _build_prompt(center_name, chain)
    llm_result = _call_llm_with_config(prompt, ai_config)

    dry_run = bool(llm_result.get("dry_run", False))
    llm_error = llm_result.get("error")
    answer = "" if (dry_run and not llm_error) else (llm_result.get("response") or "")

    if dry_run and llm_error:
        answer = (
            f"⚠ {llm_error}\n\n"
            f"（上方關聯鏈不受影響，仍可參考；LLM 總結未產生，請檢查設定後重試。）"
        )

    provider_name = (ai_config or {}).get("ai_provider") or os.environ.get("AI_PROVIDER") or "anthropic"

    return {
        "entity": center_name,
        "center_uid": center_uid,
        "chain": chain,
        "answer": answer,
        "dry_run": dry_run,
        "error": llm_error,
        "provider": provider_name,
        "prompt": prompt if (dry_run and not llm_error) else None,
        "plugin": None,
    }


def main():
    ap = argparse.ArgumentParser(description="Concept Injection Engine")
    ap.add_argument("--entity", required=True, help="實體名稱（name / uid / alias 皆可）")
    ap.add_argument("--max-hops", type=int, default=3, help="最多跳數（1–5）")
    ap.add_argument("--top-k", type=int, default=6, help="取前 N 條鏈（1–10）")
    ap.add_argument("--provider", default=None,
                    help="LLM provider：anthropic / openai / llama / custom（預設讀 AI_PROVIDER 或 anthropic）")
    ap.add_argument("--llama-host", default="http://127.0.0.1")
    ap.add_argument("--llama-port", default="8080")
    ap.add_argument("--custom-base-url", default=None)
    ap.add_argument("--custom-api-key", default=None)
    ap.add_argument("--custom-model", default=None)
    ap.add_argument("--repo-root", default=None)
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(Path.cwd())

    ai_config = {
        "ai_provider":   args.provider,
        "llama_host":    args.llama_host,
        "llama_port":    args.llama_port,
        "custom_base_url": args.custom_base_url,
        "custom_api_key":  args.custom_api_key,
        "custom_model":    args.custom_model,
    }
    # 清掉 None 值，避免覆蓋既有預設
    ai_config = {k: v for k, v in ai_config.items() if v is not None}

    max_hops = max(1, min(args.max_hops, 5))
    top_k = max(1, min(args.top_k, 10))

    result = inject_concept(repo_root, entity=args.entity, max_hops=max_hops, top_k=top_k, ai_config=ai_config)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()