#!/usr/bin/env python3
"""
integration/epistemic_adapter/http_server.py — Epistemic Adapter 的 HTTP 外殼

方案 1 的實作：application/backend/server.ts（Node）沒辦法直接 import Python 模組，
所以把 adapter.py 的 handle_query()/handle_feedback() 包成一個小型 FastAPI 服務，
Node 端用 fetch() 呼叫它——就像現在呼叫 Anthropic/OpenAI 一樣，是同一種整合模式。

端點：
    GET  /health              健康檢查
    POST /query                 body = Query Contract   -> Belief Contract
    POST /feedback              body = Feedback Contract -> {status, path}

驗證：直接重用 adapter.py 內部已經在做的 jsonschema 驗證；驗證失敗會回 422，
body 是 jsonschema 的錯誤訊息，不是靜默吞掉或回假資料。

啟動：
    python3 integration/epistemic_adapter/http_server.py
    # 或：uvicorn integration.epistemic_adapter.http_server:app --port 8765
預設監聽 127.0.0.1:8765（只允許本機，跟 Node 那邊的 HUD_TOKEN 設計理念一致——
這兩個 process 假設是在同一台機器上，不是要對外網開放的公開 API）。
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapter  # noqa: E402

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import jsonschema
import uvicorn

app = FastAPI(title="Epistemic Adapter", version="1.0.0")

# CORS：只允許本機來源，跟 Node 後端的 CORS_ORIGIN 預設策略一致
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://127.0.0.1:3001",
                    "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "epistemic_adapter"}


@app.post("/query")
def query(payload: dict):
    try:
        return adapter.handle_query(payload)
    except jsonschema.ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Query Contract 驗證失敗: {e.message}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback")
def feedback(payload: dict):
    try:
        return adapter.handle_feedback(payload)
    except jsonschema.ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Feedback Contract 驗證失敗: {e.message}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/graph")
def graph():
    """給前端 M 面板（3D 卡片關聯地圖）用；不吃 body，直接回目前整個 Entity/Atom 圖譜。"""
    try:
        return adapter.handle_graph()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract")
def extract(payload: dict):
    """筆記文字 -> LLM 抽取 -> 0_Inbox/ 未核准草稿。需要 ANTHROPIC_API_KEY，
    沒設定的話會回 500 並附上明確訊息（而不是安靜地回空結果）。"""
    try:
        return adapter.handle_extract(payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/correlate")
def correlate(payload: dict):
    """兩篇筆記 -> 三維關聯分析（實體重疊/圖距離/立場）-> 分數夠高才產生 0_Inbox/ 提案。
    stance 維度需要 ANTHROPIC_API_KEY；沒設定時仍會回傳前兩個維度的分數，
    但不會產生提案（見 correlation_engine.propose() 的說明）。"""
    try:
        return adapter.handle_correlate(payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/inbox")
def list_inbox():
    """列出 0_Inbox/ 裡所有 compiler 認得的草稿，給前端審查列表用。"""
    try:
        return {"drafts": adapter.handle_list_inbox()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/inbox/{filename}")
def get_inbox_draft(filename: str):
    """單一草稿的完整內容。filename 有做路徑穿越防護，見 inbox_review.py。"""
    try:
        return adapter.handle_get_inbox_draft(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/inbox/{filename}/approve")
def approve_inbox_draft(filename: str):
    try:
        return adapter.handle_approve_inbox_draft(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/inbox/{filename}/reject")
def reject_inbox_draft(filename: str, payload: dict | None = None):
    reason = (payload or {}).get("reason", "")
    try:
        return adapter.handle_reject_inbox_draft(filename, reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compile")
def compile_drafts():
    """觸發 Compiler：驗證並編譯所有 approved:true 的草稿。"""
    try:
        return adapter.handle_compile()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/domains")
def list_domains():
    """給搜尋篩選的下拉選單用（不是獨立總覽頁——domains 降級為篩選條件，見設計討論）。"""
    try:
        return adapter.handle_list_domains()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
def search(q: str = "", domain: str = "", type: str = "", stale_only: bool = False):
    try:
        return adapter.handle_search(q=q, domain=domain, type_filter=type, stale_only=stale_only)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/orbit/{uid}")
def orbit(uid: str, max_layer: int | None = None):
    """M 面板 Orbit 介面：以 uid 為中心，回傳 layers（同心圓分層）+ queue（Path Confidence 分桶）。"""
    try:
        return adapter.handle_orbit(uid, max_layer=max_layer)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/explain/{uid}")
def explain(uid: str):
    """Orbit 的 Explain 面板：這個實體所有關聯 Atom 的證據彙總（support/contradiction/baseline）。"""
    try:
        return adapter.handle_explain(uid)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reasoning-path")
def reasoning_path(from_: str = Query(..., alias="from"), to: str = Query(...)):
    """Reasoning 面板：從 search_origin 到目前 Focus 的最短路徑（敘事鏈，不是最高信心路徑）。
    Python 裡 from 是保留字，所以參數名是 from_，用 alias 讓 query string 還是寫 ?from=...&to=..."""
    try:
        return adapter.handle_reasoning_path(from_, to)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/timeline/{uid}")
def timeline(uid: str):
    """Timeline 面板：這個實體所有關聯觀測依 epoch 分組。"""
    try:
        return adapter.handle_timeline(uid)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/governance-summary")
def governance_summary():
    """給頂欄治理提示按鈕用（不是獨立儀表板頁面，見設計討論）。"""
    try:
        return adapter.handle_governance_summary()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import os
    port = int(os.environ.get("EPISTEMIC_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
