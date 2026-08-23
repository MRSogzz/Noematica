#!/usr/bin/env python3
"""
runtime/plugins/latent_provider.py — Core 端的 Plugin Interface

對應設計文件裡的結論：Noematica Core 只定義 LatentProvider 這個介面，
不 import、不依賴任何實際的 latent backend（Jacobian Lens / Qwen / Llama...）。
這些全部交給外部套件（例如 Noematica-JSpace）在執行期自己註冊進來。

Core 不知道、也不需要知道：
  - J-space 是什麼、Jacobian 怎麼算
  - 哪個模型、哪一層
  - intervention 實際上怎麼做

Core 只知道兩件事：
  1. 「我可以問 provider：這個 query/belief 需不需要 intervene？」
  2. 「我可以把組好的 prompt 交給 provider 執行（provider 決定要不要真的碰
      latent，或退化成純文字呼叫）」

=== 使用方式（Plugin 端）===
    from runtime.plugins.latent_provider import LatentProvider, register_provider

    class MyProvider(LatentProvider):
        name = "noematica-jspace/dummy"
        def supports_activation_intervention(self) -> bool: ...
        def project(self, entity: dict) -> JSpaceProjection: ...
        def build_intervention(self, query, belief) -> InterventionSpec | None: ...
        def apply(self, prompt, intervention, ai_config) -> dict: ...

    register_provider(MyProvider())

=== 使用方式（Core 端，reasoning_engine.py）===
    provider = get_provider()          # 沒註冊過就是 None，行為跟以前完全一樣
    if provider:
        llm_result = provider.apply(prompt, intervention, ai_config)
    else:
        llm_result = call_llm(prompt)  # 原本的純文字呼叫，沒被 J-space 插件動過
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


# ── 資料形狀 ────────────────────────────────────────────────────────────────
# 這兩個 dataclass 是 Core 跟 Plugin 之間唯一共用的「契約」。故意設計成純資料、
# 沒有任何方法，Entity 本身完全不需要因為裝了這個 plugin 而多長出
# j_space_vector / hidden_state / layer_18 這些欄位——投影關係是 plugin 自己
# 另外建一份 JSpaceProjection，跟 Entity 用 entity_id 關聯起來，不污染 Entity。

@dataclass
class JSpaceProjection:
    """Entity → J-space 的投影結果。對應設計文件裡的：
       Entity → JSpaceProjection { model, layer, coordinates, strength, confidence }"""
    entity_id: str
    model: str
    layer: int
    coordinates: list[float]
    strength: float = 1.0
    confidence: float = 0.0
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class InterventionSpec:
    """一次 intervention 要做什麼。mode 目前定義三種（對應設計文件的
       intervention/inject、suppress、maintain），plugin 可以自己擴充，
       Core 不會檢查 mode 的合法值——這欄位對 Core 來說是不透明的。"""
    mode: str                       # "inject" | "suppress" | "maintain" | 其他 plugin 自定義的值
    projections: list[JSpaceProjection]
    query: str
    strength: float = 1.0
    meta: dict[str, Any] = field(default_factory=dict)


# ── 插件介面 ────────────────────────────────────────────────────────────────

class LatentProvider(ABC):
    """所有 latent backend 插件都要實作這個介面。"""

    name: str = "unnamed-provider"

    @abstractmethod
    def supports_activation_intervention(self) -> bool:
        """True＝這個 provider 真的能碰到模型的 hidden state（例如本地跑
        transformers + forward hook）。False＝只能做 prompt-level 的替代方案
        （把 intervention 轉譯成文字提示塞進 prompt，llm 端仍是純文字 API）。
        Core 不會因為這個回傳值改變行為——純粹讓呼叫端/log 知道這次到底是
        「真 latent intervention」還是「文字提示模擬」，避免研究結果被誤讀。"""
        raise NotImplementedError

    @abstractmethod
    def project(self, entity: dict) -> JSpaceProjection:
        """把一個 Entity（Core 的 dict，欄位是 identity/attributes/relations/
        evidence/interpretation/confidence）投影成 JSpaceProjection。"""
        raise NotImplementedError

    @abstractmethod
    def build_intervention(self, query: str, belief: dict) -> Optional[InterventionSpec]:
        """依 Belief Contract（activation_engine.to_belief_contract() 的輸出）
        決定要不要 intervene、intervene 哪些 entity。回傳 None＝這次不介入，
        Core 端會直接退化成原本的 call_llm(prompt)。"""
        raise NotImplementedError

    @abstractmethod
    def apply(self, prompt: str, intervention: Optional[InterventionSpec],
              ai_config: Optional[dict] = None) -> dict:
        """實際執行一次「LLM 呼叫 + （視情況）intervention」。回傳形狀要跟
        runtime/reasoning/reasoning_engine.py 的 call_llm() 對齊：
            {"dry_run": bool, "prompt": str, "response": str, ...}
        intervention 為 None 時，這個方法應該等同純文字呼叫（例如內部直接
        呼叫 runtime/llm_client.py 的 call_llm）。"""
        raise NotImplementedError


# ── Registry ────────────────────────────────────────────────────────────────
# 故意用最簡單的 module-level dict，不做成 class/singleton，因為 Core 這邊
# 只需要「query 的時候拿得到 provider」，不需要更複雜的生命週期管理。

_REGISTRY: dict[str, LatentProvider] = {}
_DEFAULT: Optional[str] = None


def register_provider(provider: LatentProvider, *, default: bool = True) -> None:
    """Plugin 在自己套件的 import 時機（例如 __init__.py 或明確呼叫一次）
    呼叫這個函式把自己註冊進 Core。default=True（預設）代表註冊完就變成
    get_provider() 不帶名字時回傳的那一個；一次 process 裡如果註冊多個
    provider，最後一個 default=True 的會生效。"""
    global _DEFAULT
    if not getattr(provider, "name", None):
        raise ValueError("LatentProvider 必須有非空的 .name")
    _REGISTRY[provider.name] = provider
    if default:
        _DEFAULT = provider.name


def unregister_provider(name: str) -> None:
    """主要給測試用：清掉註冊，讓 Core 回到「完全沒有 J-space」的狀態。"""
    global _DEFAULT
    _REGISTRY.pop(name, None)
    if _DEFAULT == name:
        _DEFAULT = next(iter(_REGISTRY), None)


def get_provider(name: Optional[str] = None) -> Optional[LatentProvider]:
    """沒有任何 plugin 註冊過的話回傳 None——這是關鍵：Core 端的呼叫方
    （reasoning_engine.py）必須把 None 當成「完全跳過，走原本的純文字路徑」，
    不能假設一定拿得到 provider。"""
    if name:
        return _REGISTRY.get(name)
    if _DEFAULT:
        return _REGISTRY.get(_DEFAULT)
    return None


def list_providers() -> list[str]:
    return list(_REGISTRY.keys())