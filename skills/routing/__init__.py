"""
TMLPD v2.2 Routing Module

Universal Learned Router with online adaptation and model profile learning.

Based on:
- arXiv:2502.08773 (UniRoute - Universal Routing)
- ICML 2025 (BEST-Route)
- ICLR 2024 (Hybrid LLM)

Key Features:
- Learned model profiles from execution data
- Quality prediction based on task features
- Cost-quality optimization
- Online adaptation to new models
"""

from .universal_router import (
    UniversalModelRouter,
    ModelProfile,
    RoutingDecision
)

__all__ = [
    "UniversalModelRouter",
    "ModelProfile",
    "RoutingDecision"
]

__version__ = "2.2.0-alpha"
