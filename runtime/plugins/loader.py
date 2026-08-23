#!/usr/bin/env python3
"""
runtime/plugins/loader.py — 從環境變數載入 LatentProvider 插件

用法（啟動 epistemic_adapter 的 HTTP 服務之前，設定這個環境變數）：
    export NOEMATICA_LATENT_PROVIDER="noematica_jspace.adapter.noematica_provider:NoematicaJSpaceProvider"
    python3 integration/epistemic_adapter/http_server.py

格式是 "module.path:AttrName"，冒號後面那個名字：
  - 如果是 class（不帶參數就能建構），會自動 `AttrName()` 生一個實例再註冊
  - 如果已經是一個現成的 instance（例如 module 頂層寫 `provider = NoematicaJSpaceProvider()`），
    直接拿來註冊，不會多 New 一次

沒有設定這個環境變數，或設定了但 import 失敗（最常見原因：套件根本沒
`pip install -e .`），load_provider_from_env() 只會印一行 log、回傳 None，
不會讓呼叫端的 process 掛掉——Core 不應該因為一個外部插件沒裝好就整個
服務起不來，這跟 hud-settings.js 那邊 theme.json 載入失敗時只是 toast
提示、不會讓整個 HUD 打不開是同一個設計原則。
"""
from __future__ import annotations
import importlib
import logging
import os

from latent_provider import register_provider, LatentProvider  # noqa: E402  (跟本檔同資料夾)

logger = logging.getLogger("noematica.plugins.loader")

ENV_VAR = "NOEMATICA_LATENT_PROVIDER"


def load_provider_from_env(env_var: str = ENV_VAR) -> LatentProvider | None:
    spec = os.environ.get(env_var)
    if not spec:
        logger.info("[plugins] 環境變數 %s 未設定，不載入任何 LatentProvider（Core 走純文字路徑）。", env_var)
        return None

    if ":" not in spec:
        logger.warning("[plugins] %s=%r 格式錯誤，應為 'module.path:ClassOrInstance'，略過。", env_var, spec)
        return None

    module_path, attr_name = spec.split(":", 1)
    try:
        module = importlib.import_module(module_path)
        attr = getattr(module, attr_name)
        provider = attr() if isinstance(attr, type) else attr
        register_provider(provider)
        logger.info("[plugins] 已註冊 LatentProvider：%s（來自 %s）", provider.name, spec)
        return provider
    except ModuleNotFoundError as e:
        logger.warning(
            "[plugins] 載入 %s 失敗：找不到套件（%s）。多半是還沒 `pip install -e .` 那個插件；"
            "Core 會照常啟動，只是這次不會有任何插件介入。", spec, e,
        )
        return None
    except Exception as e:  # noqa: BLE001
        logger.warning("[plugins] 載入 %s 失敗（%s: %s），Core 走純文字路徑，不會因此掛掉。", spec, type(e).__name__, e)
        return None