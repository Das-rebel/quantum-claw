"""
Multi-Provider System Module

This module provides a unified interface for multiple LLM providers
with health monitoring, intelligent routing, and automatic failover.

Components:
- BaseProvider: Abstract base class for all providers
- Individual Providers: Anthropic, OpenAI, Cerebras, Groq, Together
- ProviderRegistry: Central registry with health monitoring
- IntelligentRouter: Difficulty-aware routing (arXiv:2509.11079)
- MultiProviderExecutor: High-level executor

Usage:
    executor = MultiProviderExecutor()
    await executor.start()

    result = await executor.execute({
        "description": "Create a React component"
    })

    await executor.stop()
"""

from .base import (
    BaseProvider,
    ProviderConfig,
    ProviderHealth,
    ProviderResponse
)

from .anthropic import (
    AnthropicProvider,
    OpenAIProvider
)

from .cerebras import (
    CerebrasProvider,
    GroqProvider,
    TogetherProvider
)

from .registry import (
    ProviderRegistry,
    IntelligentRouter,
    MultiProviderExecutor
)

__all__ = [
    # Base classes
    "BaseProvider",
    "ProviderConfig",
    "ProviderHealth",
    "ProviderResponse",

    # Individual providers
    "AnthropicProvider",
    "OpenAIProvider",
    "CerebrasProvider",
    "GroqProvider",
    "TogetherProvider",

    # Registry and routing
    "ProviderRegistry",
    "IntelligentRouter",
    "MultiProviderExecutor",
]
