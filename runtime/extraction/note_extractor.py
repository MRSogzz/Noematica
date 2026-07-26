#!/usr/bin/env python3
"""
runtime/extraction/note_extractor.py — Note Extractor

責任：把使用者寫的自由文字筆記，透過 LLM 解析成候選 Entity / Atom(關係) / Observation(證據)，
寫成「未核准」的草稿進 epistemic/0_Inbox/（draft_type + approved: false）。

刻意不自動核准，這是整套治理設計的核心原則（見 epistemic/8_Governance.md）：
LLM 抽取出來的因果關係永遠只是「提案」，必須經過人類把 approved 改成 true，
再由 runtime/compiler/compiler.py 編譯，才會變成正式知識庫的一部分。
本模組不做真正的統計因果推斷（不是格蘭傑因果檢定那種東西），只是「讀你的文字，
幫你把你已經寫出來的因果判斷轉成結構化草稿」——判斷的責任還是在寫筆記的人身上。

流程：
    筆記文字
        │  extract_with_llm()  ── 呼叫 Anthropic API，要求輸出結構化 JSON
        ▼
    候選 entities / relationships
        │  write_drafts()  ── 跟現有 epistemic/1_Entities、2_Atoms 比對，避免重複建立，
        │                     全部寫成 approved:false 的草稿
        ▼
    epistemic/0_Inbox/draft_*.md（等人審查）+ 一份 extraction_summary_*.md 方便一次看完
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root, scan_layer  # noqa: E402
from llm_client import call_llm  # noqa: E402

VALID_ATOM_TYPES = {"causal", "correlation", "definition", "constraint", "heuristic", "analogy"}
VALID_STANCES = {"support", "contradict", "neutral"}

EXTRACTION_SYSTEM_PROMPT = """你是一個知識抽取器，負責從使用者的筆記文字中，找出裡面明確提到或強烈暗示的
「實體」與「實體之間的關係」，輸出成嚴格的 JSON，不要有任何 JSON 以外的文字、不要用 markdown code fence。

規則：
1. 只抽取筆記裡明確寫出來或強烈暗示的關係，不要自己腦補筆記沒提到的因果關係。
2. 如果筆記裡沒有清楚的因果/相關/定義/限制/經驗法則/類比關係，relationships 回傳空陣列即可，
   不要為了湊數硬編。
3. 每個 entity 的 uid 用英文 snake_case（例如 fed_funds_rate），如果這個實體看起來
   跟下面「現有實體清單」裡的某一個是同一個東西，直接重用那個 uid，不要建立新的重複實體。
4. relationship.type 只能是這六種之一：causal, correlation, definition, constraint, heuristic, analogy。
5. relationship.stance 只能是 support / contradict / neutral 之一：這篇筆記的內容是支持、
   反駁、還是中性描述這個關係。
6. confidence 是 0~1，反映筆記文字本身的肯定程度（筆記寫「可能」「我猜」就給低一點，
   寫「明顯」「數據顯示」可以給高一點），不要每個都給 0.8 這種預設值。
7. impact 是 -100~100 的整數，代表這個關係對「to」實體的影響方向與強度的粗略估計。

輸出格式（只能是這個 JSON 結構）：
{
  "entities": [
    {"uid": "...", "name": "...", "type": "...", "domains": ["..."], "aliases": ["..."], "description": "..."}
  ],
  "relationships": [
    {
      "from": "entity_uid", "to": "entity_uid", "type": "causal",
      "mechanism": "一兩句話描述機制", "limitations": "已知的適用邊界，沒有就留空字串",
      "abstraction_level": 2,
      "stance": "support", "impact": 60, "probability": 0.6, "confidence": 0.5,
      "reasoning": "為什麼你從筆記這樣判讀（一句話，給人類審查用）"
    }
  ]
}
"""


def _build_user_prompt(text: str, existing_entities: dict[str, dict]) -> str:
    existing_summary = "\n".join(
        f"- {uid}：{fm.get('name','')}（別名：{', '.join(fm.get('aliases') or [])}）"
        for uid, fm in existing_entities.items()
    ) or "（目前沒有任何現有實體）"
    return (
        f"現有實體清單（如果筆記提到同一個東西，請重用這裡的 uid）：\n{existing_summary}\n\n"
        f"筆記內容：\n{text}\n"
    )


def call_llm_extract(text: str, existing_entities: dict[str, dict], ai_config: dict | None = None) -> dict:
    """呼叫 LLM 做抽取，provider 由 ai_config 決定（見 llm_client.py 說明）。
    沒有傳 ai_config 時預設走 Anthropic，需要 ANTHROPIC_API_KEY——維持這個函式原本
    從 CLI 直接呼叫、沒有前端可傳 aiConfig 時的行為不變。"""
    raw_text = call_llm(EXTRACTION_SYSTEM_PROMPT, _build_user_prompt(text, existing_entities), ai_config)

    # 容錯：萬一 LLM 還是包了 code fence，剝掉再解析
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM 回傳的內容不是合法 JSON，無法解析：{e}\n原始回應：{raw_text[:500]}") from e


def load_existing_entities(kb_root: Path) -> dict[str, dict]:
    return {fm.get("uid"): fm for _, fm, _ in scan_layer(kb_root, "1_Entities") if fm.get("uid")}


def load_existing_atoms(kb_root: Path) -> dict[tuple, str]:
    """回傳 {(from, to, type): atom_uid}，用來判斷「這個關係是不是已經有 Atom 了」。"""
    result = {}
    for _, fm, _ in scan_layer(kb_root, "2_Atoms"):
        key = (fm.get("from"), fm.get("to"), fm.get("type"))
        if all(key):
            result[key] = fm.get("uid")
    return result


def _slugify(text: str) -> str:
    ascii_part = re.sub(r"[^a-zA-Z0-9_]+", "_", text.strip().lower())
    ascii_part = re.sub(r"_+", "_", ascii_part).strip("_")
    if len(ascii_part) >= 3:
        return ascii_part[:60]
    # 中文/日文等非 ASCII 標題，slugify 後幾乎是空的（例如「7月投資筆記」只剩下「7」），
    # 改用內容的 hash 當檔名主體，確保不會撞名、也不會產生看起來壞掉的檔名。
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
    return f"note_{h}"


def _unique_path(dir_path: Path, stem: str) -> Path:
    candidate = dir_path / f"{stem}.md"
    n = 2
    while candidate.exists():
        candidate = dir_path / f"{stem}_{n}.md"
        n += 1
    return candidate


def _write_draft(inbox_dir: Path, stem: str, frontmatter: dict, body: str) -> Path:
    import yaml
    out_path = _unique_path(inbox_dir, f"draft_{stem}")
    fm_yaml = yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False)
    out_path.write_text(f"---\n{fm_yaml}---\n\n{body}\n", encoding="utf-8")
    return out_path


def write_drafts(repo_root: Path, extraction: dict, note_title: str, note_text: str,
                  note_date: str | None = None) -> dict:
    """把 extract_with_llm() 的結果轉成 0_Inbox/ 的草稿檔案。純函式邏輯（不呼叫 LLM），
    可以直接餵假資料測試，不需要真的打 API。"""
    kb_root = repo_root / "epistemic"
    inbox_dir = kb_root / "0_Inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)

    today = note_date or date.today().isoformat()
    existing_entities = load_existing_entities(kb_root)
    existing_atoms = load_existing_atoms(kb_root)

    # ---- 1. Source 草稿：這篇筆記本身，作為後面 Observation 的證據 ----
    fingerprint = "NOTE_" + hashlib.sha1(
        f"{note_title}|{note_text[:200]}".encode("utf-8")
    ).hexdigest()[:10].upper()
    source_path = _write_draft(inbox_dir, f"source_{_slugify(note_title)}", {
        "draft_type": "source",
        "approved": False,
        "title": note_title,
        "source_fingerprint": fingerprint,
        "published_date": today,
        "publisher": "使用者筆記",
        "reliability": "primary",
        "created": date.today().isoformat(),
    }, f"## 摘要\n\n（由 note_extractor 自動帶入，原始筆記全文如下）\n\n{note_text}\n")

    created = {"source": [str(source_path.relative_to(repo_root))],
               "entity": [], "atom": [], "observation": []}
    warnings: list[str] = []

    # ---- 2. Entity 草稿：跟現有的比對，避免重複 ----
    # entity_uid_map：LLM 提出的 uid -> 實際要用的 uid（可能是既有的，也可能是新建的）
    entity_uid_map: dict[str, str] = {}
    for ent in extraction.get("entities", []):
        proposed_uid = ent.get("uid")
        if not proposed_uid:
            continue
        if proposed_uid in existing_entities:
            entity_uid_map[proposed_uid] = proposed_uid  # LLM 自己就重用對了
            continue
        # 用名稱/別名再比對一次，避免 LLM 取了不同的 uid 但其實是同一個實體
        matched = _fuzzy_match_entity(ent, existing_entities)
        if matched:
            entity_uid_map[proposed_uid] = matched
            continue
        # 真的是新實體 -> 建立草稿
        entity_uid_map[proposed_uid] = proposed_uid
        path = _write_draft(inbox_dir, f"entity_{proposed_uid}", {
            "draft_type": "entity",
            "approved": False,
            "uid": proposed_uid,
            "name": ent.get("name", proposed_uid),
            "type": ent.get("type", "concept"),
            "domains": ent.get("domains", []),
            "aliases": ent.get("aliases", []),
            "created": date.today().isoformat(),
        }, f"## 描述\n\n{ent.get('description', '')}\n\n## 備註\n\n（由 note_extractor 從筆記「{note_title}」自動抽取，待審查）\n")
        created["entity"].append(str(path.relative_to(repo_root)))
        existing_entities[proposed_uid] = ent  # 讓同一批次內後面的關係也能參照到它

    # ---- 3. Relationship -> Atom（若不存在）+ Observation（一定新增）----
    for i, rel in enumerate(extraction.get("relationships", [])):
        frm_raw, to_raw = rel.get("from"), rel.get("to")
        frm = entity_uid_map.get(frm_raw, frm_raw)
        to = entity_uid_map.get(to_raw, to_raw)
        atom_type = rel.get("type")

        if frm not in existing_entities and frm not in entity_uid_map.values():
            warnings.append(f"relationship[{i}]：from={frm_raw} 找不到對應的實體，已略過")
            continue
        if to not in existing_entities and to not in entity_uid_map.values():
            warnings.append(f"relationship[{i}]：to={to_raw} 找不到對應的實體，已略過")
            continue
        if atom_type not in VALID_ATOM_TYPES:
            warnings.append(f"relationship[{i}]：type={atom_type} 不是合法的 Atom 類型，已略過")
            continue

        key = (frm, to, atom_type)
        if key in existing_atoms:
            atom_uid = existing_atoms[key]  # 機制已經有人建過了，只補新的觀測證據
        else:
            atom_uid = _slugify(f"{frm}_{atom_type}_{to}")
            existing_atoms[key] = atom_uid  # 同一批次內若重複出現，後面直接重用
            path = _write_draft(inbox_dir, f"atom_{atom_uid}", {
                "draft_type": "atom",
                "approved": False,
                "uid": atom_uid,
                "from": frm,
                "to": to,
                "type": atom_type,
                "abstraction": {"level": rel.get("abstraction_level", 2), "jump_allowed": False},
                "status": "active",
                "lifecycle": {"status": "active", "last_review": date.today().isoformat()},
                "lineage": {"type": "", "parents": [], "inherit_rules": []},
                "domains": [],
                "created": date.today().isoformat(),
            }, (
                f"## 機制說明\n\n{rel.get('mechanism', '')}\n\n"
                f"## 已知限制 / 適用邊界\n\n{rel.get('limitations', '') or '（筆記未提及）'}\n\n"
                f"## 抽取來源\n\n由 note_extractor 從筆記「{note_title}」自動抽取，待審查。\n"
                f"LLM 判讀理由：{rel.get('reasoning', '（無）')}\n"
            ))
            created["atom"].append(str(path.relative_to(repo_root)))

        obs_stem = _slugify(f"{today}_{atom_uid}")[:40]
        obs_uid = f"{obs_stem}_obs_{uuid.uuid4().hex[:8]}"
        stance = rel.get("stance") if rel.get("stance") in VALID_STANCES else "neutral"
        confidence = float(rel.get("confidence", 0.3) or 0.3)
        path = _write_draft(inbox_dir, f"observation_{obs_uid}", {
            "draft_type": "observation",
            "approved": False,
            "uid": obs_uid,
            "atom": atom_uid,
            "epoch": today,
            "context": {
                "market_regime":  {"value": "", "confidence": 0.0},
                "monetary_policy": {"value": "", "confidence": 0.0},
                "liquidity":       {"value": "", "confidence": 0.0},
                "inflation":       {"value": "", "confidence": 0.0},
                "geopolitical":    {"value": "", "confidence": 0.0},
            },
            "impact": rel.get("impact", 0),
            "probability": rel.get("probability", 0.5),
            "stance": stance,
            "contradicts": [],
            "contradiction_reason": "",
            "confidence": {"value": round(confidence, 2), "basis": "derived"},
            "evidence": [f"[[4_Sources/{fingerprint}.md]]"],
            "created": date.today().isoformat(),
        }, (
            f"## 觀測敘述\n\n（由 note_extractor 從筆記「{note_title}」自動抽取）\n\n"
            f"## 解讀\n\nLLM 判讀理由：{rel.get('reasoning', '（無）')}\n\n"
            f"> ⚠️ `confidence.basis` 標記為 `derived`（機器抽取），不是 `direct`（人類直接判斷）。"
            f" 審查時請確認信心值是否合理，不合理就直接改掉再核准。\n"
        ))
        created["observation"].append(str(path.relative_to(repo_root)))

    # ---- 4. 摘要檔案（非草稿卡片，Compiler 會自動略過，純粹方便人類一次看完）----
    summary_lines = [
        f"# 筆記抽取摘要：{note_title}",
        "",
        f"- 抽取時間：{datetime.now().isoformat(timespec='seconds')}",
        f"- 新建 Entity：{len(created['entity'])} 筆",
        f"- 新建 Atom：{len(created['atom'])} 筆",
        f"- 新建 Observation：{len(created['observation'])} 筆",
        "",
        "## 下一步",
        "",
        "1. 打開 `0_Inbox/` 底下這批 `draft_*.md` 檔案，逐一檢查內容是否合理。",
        "2. 覺得沒問題的，把 frontmatter 的 `approved: false` 改成 `approved: true`。",
        "3. 執行 `python3 runtime/compiler/compiler.py`，通過驗證的會編譯進正式三層，",
        "   沒通過的會被說明原因後移進 `6_Rejected/`。",
        "",
    ]
    if warnings:
        summary_lines += ["## ⚠️ 抽取時的警告", ""] + [f"- {w}" for w in warnings] + [""]
    summary_lines += ["## 本次產生的檔案", ""]
    for kind, paths in created.items():
        for p in paths:
            summary_lines.append(f"- `{p}`")

    summary_path = inbox_dir / f"extraction_summary_{datetime.now().strftime('%Y%m%dT%H%M%S')}.md"
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")

    return {
        "created": created,
        "warnings": warnings,
        "summary": str(summary_path.relative_to(repo_root)),
    }


def _fuzzy_match_entity(candidate: dict, existing: dict[str, dict]) -> str | None:
    names = [candidate.get("name", "")] + list(candidate.get("aliases") or [])
    names = [n.lower() for n in names if n]
    for uid, fm in existing.items():
        pool = [fm.get("name", "")] + list(fm.get("aliases") or []) + [uid]
        pool = [p.lower() for p in pool if p]
        if any(n == p for n in names for p in pool):
            return uid
    return None


def extract_note(repo_root: Path, text: str, title: str, note_date: str | None = None,
                  ai_config: dict | None = None) -> dict:
    """對外主入口：呼叫 LLM 抽取 + 寫草稿。ai_config 決定用哪個 LLM provider
    （見 runtime/llm_client.py），通常是前端設定頁的 localStorage 配置原封不動傳過來。"""
    kb_root = repo_root / "epistemic"
    existing_entities = load_existing_entities(kb_root)
    extraction = call_llm_extract(text, existing_entities, ai_config)
    return write_drafts(repo_root, extraction, title, text, note_date)
