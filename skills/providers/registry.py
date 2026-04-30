"""
Provider Registry and Routing - Agent 4 Output

Implements provider registry, health monitoring, and intelligent routing.
"""

import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
import json

from .base import BaseProvider, ProviderConfig, ProviderHealth, ProviderResponse
from .anthropic import AnthropicProvider, OpenAIProvider
from .cerebras import CerebrasProvider, GroqProvider, TogetherProvider


class ProviderRegistry:
    """
    Central registry for all LLM providers.

    Features:
    - Provider registration and management
    - Health monitoring with automatic failover
    - Cost-aware provider selection
    - Performance metrics tracking
    """

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize provider registry.

        Args:
            config_path: Path to provider configuration file (YAML or JSON)
        """
        self.providers: Dict[str, BaseProvider] = {}
        self.config = self._load_config(config_path)
        self.health_check_interval = 60  # seconds
        self._health_task = None

        # Register providers from config
        self._register_providers()

    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        """Load provider configuration"""
        if config_path and Path(config_path).exists():
            # Load from file
            with open(config_path, 'r') as f:
                if config_path.endswith('.json'):
                    return json.load(f)
                else:
                    # Assume YAML (requires pyyaml)
                    import yaml
                    return yaml.safe_load(f)

        # Default configuration
        return {
            "providers": [
                {
                    "name": "anthropic",
                    "model": "claude-sonnet-4",
                    "api_key_env": "ANTHROPIC_API_KEY",
                    "priority": 1,
                    "enabled": True
                },
                {
                    "name": "openai",
                    "model": "gpt-4o",
                    "api_key_env": "OPENAI_API_KEY",
                    "priority": 2,
                    "enabled": True
                },
                {
                    "name": "cerebras",
                    "model": "llama-3.3-70b",
                    "api_key_env": "CEREBRAS_API_KEY",
                    "priority": 3,
                    "enabled": True
                },
                {
                    "name": "groq",
                    "model": "llama-3.3-70b-8192",
                    "api_key_env": "GROQ_API_KEY",
                    "priority": 4,
                    "enabled": True
                }
            ]
        }

    def _register_providers(self):
        """Register providers from configuration"""
        provider_classes = {
            "anthropic": AnthropicProvider,
            "openai": OpenAIProvider,
            "cerebras": CerebrasProvider,
            "groq": GroqProvider,
            "together": TogetherProvider,
        }

        for provider_config in self.config.get("providers", []):
            if not provider_config.get("enabled", True):
                continue

            provider_class = provider_classes.get(provider_config["name"])
            if not provider_class:
                continue

            config = ProviderConfig(
                name=provider_config["name"],
                model=provider_config["model"],
                api_key_env=provider_config["api_key_env"],
                priority=provider_config.get("priority", 1),
                max_retries=provider_config.get("max_retries", 3),
                timeout=provider_config.get("timeout", 30),
                enabled=provider_config.get("enabled", True)
            )

            try:
                provider = provider_class(config)
                self.providers[provider_config["name"]] = provider
                print(f"✓ Registered provider: {provider_config['name']}")
            except Exception as e:
                print(f"✗ Failed to register {provider_config['name']}: {e}")

    def get_provider(self, name: str) -> Optional[BaseProvider]:
        """Get provider by name"""
        return self.providers.get(name)

    def get_healthy_providers(self) -> List[BaseProvider]:
        """Get all healthy providers, sorted by priority"""
        healthy = []

        for provider in self.providers.values():
            health = provider.get_health()

            if health.status == "healthy":
                healthy.append(provider)

        # Sort by priority (lower number = higher priority)
        healthy.sort(key=lambda p: p.config.priority)

        return healthy

    def get_all_providers(self) -> List[BaseProvider]:
        """Get all providers, sorted by priority"""
        all_providers = list(self.providers.values())
        all_providers.sort(key=lambda p: p.config.priority)
        return all_providers

    async def start_health_monitoring(self):
        """Start background health monitoring"""
        if self._health_task is None:
            self._health_task = asyncio.create_task(self._health_monitor_loop())

    async def stop_health_monitoring(self):
        """Stop background health monitoring"""
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
            self._health_task = None

    async def _health_monitor_loop(self):
        """Background health check loop"""
        while True:
            try:
                await self.check_all_providers()
                await asyncio.sleep(self.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Health check error: {e}")
                await asyncio.sleep(self.health_check_interval)

    async def check_all_providers(self) -> Dict[str, ProviderHealth]:
        """Check health of all providers"""
        health_status = {}

        for name, provider in self.providers.items():
            try:
                health = await provider.health_check()
                health_status[name] = health
            except Exception as e:
                health_status[name] = ProviderHealth(
                    status="unhealthy",
                    last_check=datetime.now().isoformat(),
                    consecutive_failures=0,
                    last_error=str(e)
                )

        return health_status

    def get_registry_stats(self) -> Dict[str, Any]:
        """Get registry statistics"""
        total_providers = len(self.providers)
        healthy_providers = len(self.get_healthy_providers())

        total_stats = {
            "total_providers": total_providers,
            "healthy_providers": healthy_providers,
            "unhealthy_providers": total_providers - healthy_providers,
            "providers": {}
        }

        for name, provider in self.providers.items():
            total_stats["providers"][name] = provider.get_stats()

        return total_stats


class IntelligentRouter:
    """
    Intelligent routing based on task difficulty and provider capabilities.

    Implements difficulty-aware routing from arXiv:2509.11079
    """

    # Difficulty levels
    DIFFICULTY_LEVELS = {
        "TRIVIAL": range(0, 20),
        "SIMPLE": range(20, 40),
        "MEDIUM": range(40, 60),
        "COMPLEX": range(60, 80),
        "EXPERT": range(80, 100)
    }

    # Provider preferences by difficulty
    PROVIDER_PREFERENCES = {
        "TRIVIAL": ["cerebras", "groq", "together"],      # Fastest, cheapest
        "SIMPLE": ["cerebras", "groq", "openai"],           # Fast
        "MEDIUM": ["openai", "anthropic"],                  # Balanced
        "COMPLEX": ["anthropic", "openai"],                 # Quality
        "EXPERT": ["anthropic"]                             # Best
    }

    def __init__(self, registry: ProviderRegistry):
        """
        Initialize intelligent router.

        Args:
            registry: ProviderRegistry instance
        """
        self.registry = registry

    def classify_difficulty(self, task: Dict[str, Any]) -> str:
        """
        Classify task difficulty.

        Based on arXiv:2509.11079 (Difficulty-Aware Agent Orchestration)

        Factors:
        - Task length (word count)
        - Multi-step indicators
        - Technical complexity
        - Requirements specificity
        - Dependencies
        """
        score = 0

        # Factor 1: Length (0-20 points)
        description = task.get("description", "")
        word_count = len(description.split())
        score += min(word_count / 10, 20)

        # Factor 2: Multi-step (0-25 points)
        multi_step_keywords = [
            "then", "after", "before", "followed by",
            "multiple", "several", "sequence", "chain",
            "iterate", "refine", "improve"
        ]
        multi_step_count = sum(
            1 for kw in multi_step_keywords
            if kw in description.lower()
        )
        score += min(multi_step_count * 5, 25)

        # Factor 3: Technical complexity (0-30 points)
        technical_keywords = [
            "implement", "integrate", "optimize", "architecture",
            "system", "api", "database", "authentication", "deployment",
            "algorithm", "performance", "security", "scalability"
        ]
        tech_count = sum(
            1 for kw in technical_keywords
            if kw in description.lower()
        )
        score += min(tech_count * 3, 30)

        # Factor 4: Requirements (0-15 points)
        if task.get("requirements"):
            score += 10
        if task.get("context"):
            score += 5

        # Factor 5: Dependencies (0-10 points)
        dependency_keywords = ["depends", "requires", "needs", "after"]
        if any(kw in description.lower() for kw in dependency_keywords):
            score += 10

        # Map to difficulty level
        for level, range_obj in self.DIFFICULTY_LEVELS.items():
            if score in range_obj:
                return level

        return "MEDIUM"  # Default

    def route(
        self,
        task: Dict[str, Any],
        difficulty_override: Optional[str] = None
    ) -> Optional[BaseProvider]:
        """
        Route task to appropriate provider based on difficulty.

        Args:
            task: Task to route
            difficulty_override: Override automatic difficulty classification

        Returns:
            Selected provider or None
        """
        # Classify difficulty
        difficulty = difficulty_override or self.classify_difficulty(task)

        # Get preferred providers for this difficulty
        preferred_providers = self.PROVIDER_PREFERENCES.get(difficulty, [])

        # Find first healthy provider from preferences
        for provider_name in preferred_providers:
            provider = self.registry.get_provider(provider_name)
            if provider:
                health = provider.get_health()
                if health.status == "healthy":
                    return provider

        # Fallback: any healthy provider
        healthy_providers = self.registry.get_healthy_providers()
        if healthy_providers:
            return healthy_providers[0]

        return None

    async def execute_with_routing(
        self,
        task: Dict[str, Any],
        **kwargs
    ) -> ProviderResponse:
        """
        Execute task with intelligent routing.

        Routes to appropriate provider based on difficulty, then executes.
        """
        # Route to provider
        provider = self.route(task)

        if not provider:
            return ProviderResponse(
                success=False,
                content="",
                tokens_used=0,
                cost=0.0,
                latency_ms=0.0,
                model="unknown",
                provider="none",
                timestamp=datetime.now().isoformat(),
                metadata={},
                error="No healthy providers available"
            )

        # Execute with provider
        return await provider.execute_with_retry(
            task.get("description", ""),
            **kwargs
        )

    def explain_routing(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Explain routing decision for transparency.

        Returns detailed information about why a task was routed
        to a specific provider.
        """
        difficulty = self.classify_difficulty(task)
        preferred_providers = self.PROVIDER_PREFERENCES.get(difficulty, [])

        # Find selected provider
        provider = self.route(task)

        return {
            "task": task.get("description", "")[:100],
            "difficulty": difficulty,
            "preferred_providers": preferred_providers,
            "selected_provider": provider.config.name if provider else None,
            "selected_model": provider.config.model if provider else None,
            "reasoning": f"Task classified as '{difficulty}', routed to {provider.config.name if provider else 'none'}"
        }


class MultiProviderExecutor:
    """
    High-level executor using multi-provider system.

    Combines registry, health monitoring, and intelligent routing.
    """

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize multi-provider executor.

        Args:
            config_path: Path to provider configuration
        """
        self.registry = ProviderRegistry(config_path)
        self.router = IntelligentRouter(self.registry)

    async def start(self):
        """Start health monitoring"""
        await self.registry.start_health_monitoring()

    async def stop(self):
        """Stop health monitoring"""
        await self.registry.stop_health_monitoring()

    async def execute(
        self,
        task: Dict[str, Any],
        provider_override: Optional[str] = None,
        **kwargs
    ) -> ProviderResponse:
        """
        Execute task with optimal provider.

        Args:
            task: Task to execute
            provider_override: Force use of specific provider
            **kwargs: Additional execution parameters

        Returns:
            ProviderResponse
        """
        # Use specific provider if requested
        if provider_override:
            provider = self.registry.get_provider(provider_override)
            if not provider:
                return ProviderResponse(
                    success=False,
                    content="",
                    tokens_used=0,
                    cost=0.0,
                    latency_ms=0.0,
                    model="unknown",
                    provider="none",
                    timestamp=datetime.now().isoformat(),
                    metadata={},
                    error=f"Provider not found: {provider_override}"
                )

            return await provider.execute_with_retry(
                task.get("description", ""),
                **kwargs
            )

        # Use intelligent routing
        return await self.router.execute_with_routing(task, **kwargs)

    def get_status(self) -> Dict[str, Any]:
        """Get system status"""
        return {
            "registry": self.registry.get_registry_stats(),
            "health": {
                name: provider.get_health()
                for name, provider in self.registry.providers.items()
            }
        }
