#!/usr/bin/env python3
"""
integration/wiki_adapter/client_example.py — Wiki Adapter（示範用）

這個檔案代表 application/（llm-wiki）那一側「應該怎麼呼叫 epistemic」的參考實作。
application/ 目前還沒有實際程式碼（backend/frontend/cli 都是待建的骨架），
但邊界規則現在就先立好：

    application/ 的任何程式碼，永遠只 import integration.epistemic_adapter，
    絕對不 import runtime.* 或 epistemic 內部模組。

這支腳本本身就是一個可執行的驗證：如果它能在完全不 import runtime/epistemic
內部細節的情況下跑起來，就代表邊界是乾淨的。

用法：
    python3 integration/wiki_adapter/client_example.py "升息對銀行獲利的影響"
"""
from __future__ import annotations
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "epistemic_adapter"))
import adapter  # 只 import 到這一行為止，這就是全部允許的耦合面


def ask(query: str, atom: str | None = None, context: dict | None = None) -> str:
    """模擬 llm-wiki 後端收到使用者問題後的處理流程。"""
    belief = adapter.handle_query({"query": query, "atom": atom, "context": context or {}})

    if belief["abstained"]:
        return f"（系統誠實棄權：{belief['abstain_reason']}，目前證據不足以回答這個問題。）"

    lines = [f"關於「{query}」，目前的結構化證據如下（不確定性 {belief['uncertainty']}）："]
    if belief["support"]:
        lines.append(f"  支持：{[e['obs'] for e in belief['support']]}")
    if belief["contradiction"]:
        lines.append(f"  反駁：{[e['obs'] for e in belief['contradiction']]}")
    if belief.get("baseline"):
        lines.append(f"  歷史基線：{[e['obs'] for e in belief['baseline']]}")
    return "\n".join(lines)


def submit_feedback(target_obs: str, signal: str, note: str = "") -> dict:
    return adapter.handle_feedback({
        "type": "feedback", "target": target_obs, "signal": signal, "note": note,
    })


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "升息對銀行獲利的影響"
    print(ask(query, atom="rate_affects_bank_nim"))
