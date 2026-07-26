#!/usr/bin/env python3
"""
runtime/reasoning/reasoning_engine.py — Reasoning Engine

責任：整條 Runtime pipeline 的最後一棒。
    Activation Result -> Policy Check（已經在 activation_engine 內做過棄權判斷）
        -> Prompt Builder（本檔案）
        -> LLM（呼叫 Anthropic API；若沒有設定 ANTHROPIC_API_KEY，改為 dry-run 只印出 prompt）

這是 integration/epistemic_adapter 處理 Query Contract 時實際呼叫的入口點，
也是唯一「知道 LLM 存在」的模組——epistemic 層其他模組完全不知道有 LLM 這件事。

用法：
    python3 runtime/reasoning/reasoning_engine.py --query "AI 晶片股會不會泡沫化？" \
        --context '{"market_regime":{"value":"risk_on","confidence":0.6}}'
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # runtime/
from common import find_repo_root  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "activation"))
import activation_engine as ae  # noqa: E402


def build_prompt(user_query: str, belief: dict) -> str:
    """把 Belief Contract 組成給 LLM 的 prompt。刻意保守：只給結構化事實，
    不要求 LLM 编造沒有的證據，且明確標示不確定性與棄權狀態。"""
    if belief["abstained"]:
        return (
            f"使用者問題：{user_query}\n\n"
            f"[系統狀態] 知識庫證據不足以回答（原因：{belief['abstain_reason']}）。\n"
            "請誠實告知使用者目前缺乏足夠證據，不要臆測答案，並可建議使用者提供更多情境資訊。"
        )

    lines = [f"使用者問題：{user_query}", "", "已激活的結構化證據："]
    if belief["support"]:
        lines.append("[支持]")
        for s in belief["support"]:
            lines.append(f"  - {s['obs']}（信心 {s['confidence']}）")
    if belief["contradiction"]:
        lines.append("[反駁]")
        for c in belief["contradiction"]:
            lines.append(f"  - {c['obs']}（信心 {c['confidence']}）")
    if belief.get("baseline"):
        lines.append("[歷史基線，非嚴格情境匹配]")
        for b in belief["baseline"]:
            lines.append(f"  - {b['obs']}（信心 {b['confidence']}）")
    lines.append("")
    lines.append(f"整體不確定性（uncertainty）：{belief['uncertainty']}")
    lines.append("")
    lines.append(
        "請只根據上面列出的證據回答，不要引入清單以外的事實；"
        "若支持與反駁並存，明確呈現雙方，並如實反映 uncertainty 的高低。"
    )
    return "\n".join(lines)


def call_llm(prompt: str) -> dict:
    """呼叫 Anthropic API。沒有 ANTHROPIC_API_KEY 時回傳 dry-run 結果，方便離線測試整條 pipeline。"""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"dry_run": True, "prompt": prompt,
                "note": "未設定 ANTHROPIC_API_KEY，僅回傳組好的 prompt，未實際呼叫 LLM。"}

    import urllib.request
    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 1000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return {"dry_run": False, "prompt": prompt, "response": text}


def reason(repo_root: Path, query: str, context: dict, atom: str | None = None) -> dict:
    activation_result = ae.activate(repo_root, query=query, atom=atom, context=context)
    belief = ae.to_belief_contract(activation_result)
    prompt = build_prompt(query, belief)
    llm_result = call_llm(prompt)
    return {"belief": belief, "llm": llm_result}


def main():
    ap = argparse.ArgumentParser(description="Reasoning Engine")
    ap.add_argument("--query", required=True)
    ap.add_argument("--atom", default=None)
    ap.add_argument("--context", default="{}")
    ap.add_argument("--repo-root", default=None)
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(Path.cwd())
    context = json.loads(args.context) if args.context else {}

    out = reason(repo_root, args.query, context, atom=args.atom)
    print(f"[Reasoning Engine] query={args.query!r}")
    print("\n--- Belief Contract ---")
    print(json.dumps(out["belief"], ensure_ascii=False, indent=2))
    print("\n--- Prompt 交給 LLM ---")
    print(out["llm"]["prompt"])
    if out["llm"]["dry_run"]:
        print(f"\n[Dry Run] {out['llm']['note']}")
    else:
        print("\n--- LLM 回應 ---")
        print(out["llm"]["response"])


if __name__ == "__main__":
    main()
