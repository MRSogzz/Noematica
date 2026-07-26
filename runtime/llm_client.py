#!/usr/bin/env python3
"""
runtime/llm_client.py — 統一的多 provider LLM 呼叫工具

跟 application/backend/server.ts 的 /api/wiki/generate 用同一套 provider 選擇邏輯
（ai_provider: anthropic | openai | llama | custom），這樣不管你在前端設定頁選了哪個
LLM，note_extractor.py / correlation_engine.py 這些 Python 端的功能都會呼叫到同一個
LLM，不會有「設定頁選了本地 llama.cpp，結果 Python 那邊還是偷偷打 Anthropic」的落差。

ai_config 的形狀（跟 Node 端 aiConfig 完全一致，欄位名稱都是 snake_case，直接把
localStorage 的 `llm-wiki-config` 原封不動傳過來就對了）：
    {
      "ai_provider": "llama" | "openai" | "anthropic" | "custom",
      "llama_host": "http://127.0.0.1", "llama_port": "8080",
      "custom_base_url": "...", "custom_model": "...", "custom_api_key": "...",
    }
沒有傳 ai_config，或 ai_provider 缺省時，預設走 anthropic（需要 ANTHROPIC_API_KEY 環境變數），
維持這幾個模組原本從 CLI 直接呼叫、沒有前端 aiConfig 可傳時的行為不變。

注意：openai/anthropic 的 API Key 一律從環境變數讀取，不接受從 ai_config（等於是從瀏覽器
傳過來的東西）帶入——這條規則跟 server.ts 的註解「API Key 不從 request body 接受」一致。
llama/custom 因為通常是打本機或內網服務，custom 允許帶 custom_api_key（例如自架的
OpenAI-compatible 服務也可能要驗證），這點也跟 server.ts 一致。
"""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.request


def call_llm(system_prompt: str, user_content: str, ai_config: dict | None = None,
             max_tokens: int = 4000, temperature: float = 0.3) -> str:
    """回傳 LLM 的純文字回應。四種 provider 共用同一個對外介面。"""
    ai_config = ai_config or {}
    provider = (ai_config.get("ai_provider") or os.environ.get("AI_PROVIDER") or "anthropic").lower()

    if provider == "llama":
        host = (ai_config.get("llama_host") or "http://127.0.0.1").rstrip("/")
        port = ai_config.get("llama_port") or "8080"
        return _call_openai_compatible(
            url=f"{host}:{port}/v1/chat/completions",
            api_key=None, model=None,
            system_prompt=system_prompt, user_content=user_content,
            max_tokens=max_tokens, temperature=temperature,
        )

    if provider == "custom":
        base_url = (ai_config.get("custom_base_url") or "").rstrip("/")
        if not base_url:
            raise RuntimeError("provider=custom 但沒有設定 custom_base_url（請在前端設定頁填寫）")
        return _call_openai_compatible(
            url=f"{base_url}/chat/completions",
            api_key=ai_config.get("custom_api_key") or None,
            model=ai_config.get("custom_model") or "local-model",
            system_prompt=system_prompt, user_content=user_content,
            max_tokens=max_tokens, temperature=temperature,
        )

    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("provider=openai 但沒有設定 OPENAI_API_KEY 環境變數（請在 application/.env 設定）")
        return _call_openai_compatible(
            url="https://api.openai.com/v1/chat/completions",
            api_key=api_key, model="gpt-4o",
            system_prompt=system_prompt, user_content=user_content,
            max_tokens=max_tokens, temperature=temperature,
        )

    # provider == "anthropic"（預設，向後相容原本沒有 aiConfig 時的行為）
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "provider=anthropic 但沒有設定 ANTHROPIC_API_KEY 環境變數。"
            "如果你想改用本機的 llama.cpp，去前端設定頁把「AI 提供者」切成 llama 即可，"
            "不需要這個環境變數。"
        )
    return _call_anthropic(system_prompt, user_content, api_key, max_tokens)


def _call_anthropic(system_prompt: str, user_content: str, api_key: str, max_tokens: int) -> str:
    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_content}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={"Content-Type": "application/json", "x-api-key": api_key,
                 "anthropic-version": "2023-06-01"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(f"呼叫 Anthropic API 失敗：{e}") from e
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")


def _call_openai_compatible(url: str, api_key: str | None, model: str | None,
                             system_prompt: str, user_content: str,
                             max_tokens: int, temperature: float) -> str:
    """llama.cpp（OpenAI-compatible /v1/chat/completions）、OpenAI 本身、跟自訂端點，
    三者的請求/回應格式一致，共用同一個函式，邏輯跟 server.ts 對應的三個分支一致。"""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload: dict = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if model:
        payload["model"] = model

    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"呼叫 {url} 失敗：{e}。如果是 llama.cpp，確認伺服器有跑起來"
            f"（例如 `llama-server -m model.gguf --port 8080`），且 host/port 設定正確。"
        ) from e

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"{url} 回應裡沒有 choices，原始回應：{json.dumps(data, ensure_ascii=False)[:300]}")
    return choices[0].get("message", {}).get("content", "")
