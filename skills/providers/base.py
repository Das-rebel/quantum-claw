"""
Base Provider Interface - Agent 1 Output

Abstract base class for all LLM providers.
Provides unified interface for multi-provider system.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass
import asyncio


@dataclass
class ProviderConfig:
    """Configuration for a provider"""
    name: str
    model: str
    api_key_env: str
    priority: int = 1
    max_retries: int = 3
    timeout: int = 30
    enabled: bool = True


@dataclass
class ProviderHealth:
    """Health status of a provider"""
    status: str  # "healthy", "degraded", "unhealthy"
    last_check: str
    consecutive_failures: int
    last_error: Optional[str] = None
    latency_ms: Optional[float] = None
    uptime_percentage: float = 100.0


@dataclass
class ProviderResponse:
    """Standardized response from any provider"""
    success: bool
    content: str
    tokens_used: int
    cost: float
    latency_ms: float
    model: str
    provider: str
    timestamp: str
    metadata: Dict[str, Any]
    error: Optional[str] = None


class BaseProvider(ABC):
    """
    Abstract base class for all LLM providers.

    All providers must implement these methods to ensure
    consistent interface across the multi-provider system.
    """

    def __init__(self, config: ProviderConfig):
        self.config = config
        self.health = ProviderHealth(
            status="healthy",
            last_check=datetime.now().isoformat(),
            consecutive_failures=0
        )
        self._request_count = 0
        self._success_count = 0
        self._total_tokens = 0
        self._total_cost = 0.0

    @abstractmethod
    async def execute(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.7,
        **kwargs
    ) -> ProviderResponse:
        """
        Execute a prompt with this provider.

        Args:
            prompt: The prompt to execute
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            **kwargs: Provider-specific parameters

        Returns:
            ProviderResponse with standardized format
        """
        pass

    @abstractmethod
    def calculate_cost(self, tokens: int) -> float:
        """
        Calculate cost for token usage.

        Args:
            tokens: Number of tokens used

        Returns:
            Cost in USD
        """
        pass

    @abstractmethod
    async def health_check(self) -> ProviderHealth:
        """
        Check if provider is healthy and accessible.

        Returns:
            ProviderHealth status
        """
        pass

    async def execute_with_retry(
        self,
        prompt: str,
        max_retries: Optional[int] = None,
        **kwargs
    ) -> ProviderResponse:
        """
        Execute with automatic retry on failure.

        Implements exponential backoff and circuit breaker pattern.
        """
        max_retries = max_retries or self.config.max_retries
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                # Check if circuit is open (too many failures)
                if self._is_circuit_open():
                    await self._wait_for_circuit_close()
                    continue

                # Execute request
                response = await self.execute(prompt, **kwargs)

                # Update health on success
                if response.success:
                    self._record_success()
                    self.health.consecutive_failures = 0
                else:
                    self._record_failure(response.error)
                    raise Exception(response.error)

                return response

            except Exception as e:
                last_error = str(e)
                self._record_failure(last_error)

                if attempt < max_retries:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue

        # All retries failed
        return ProviderResponse(
            success=False,
            content="",
            tokens_used=0,
            cost=0.0,
            latency_ms=0.0,
            model=self.config.model,
            provider=self.config.name,
            timestamp=datetime.now().isoformat(),
            metadata={},
            error=f"Failed after {max_retries} retries: {last_error}"
        )

    def get_health(self) -> ProviderHealth:
        """Get current health status"""
        return self.health

    def get_stats(self) -> Dict[str, Any]:
        """Get provider statistics"""
        success_rate = (
            (self._success_count / self._request_count * 100)
            if self._request_count > 0
            else 0
        )

        return {
            "provider": self.config.name,
            "model": self.config.model,
            "requests": self._request_count,
            "successes": self._success_count,
            "success_rate": success_rate,
            "total_tokens": self._total_tokens,
            "total_cost": self._total_cost,
            "avg_cost_per_1k_tokens": (
                (self._total_cost / self._total_tokens * 1000)
                if self._total_tokens > 0
                else 0
            ),
            "health_status": self.health.status,
            "uptime": self.health.uptime_percentage
        }

    def _record_success(self):
        """Record successful request"""
        self._request_count += 1
        self._success_count += 1
        self.health.last_check = datetime.now().isoformat()

    def _record_failure(self, error: str):
        """Record failed request"""
        self._request_count += 1
        self.health.consecutive_failures += 1
        self.health.last_error = error
        self.health.last_check = datetime.now().isoformat()

        # Update status based on failures
        if self.health.consecutive_failures >= 5:
            self.health.status = "unhealthy"
        elif self.health.consecutive_failures >= 2:
            self.health.status = "degraded"

    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open (too many failures)"""
        return (
            self.health.consecutive_failures >= 3 and
            self.health.status == "unhealthy"
        )

    async def _wait_for_circuit_close(self):
        """Wait before retrying when circuit is open"""
        await asyncio.sleep(5)  # Wait 5 seconds

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.config.name}, "
            f"model={self.config.model}, "
            f"status={self.health.status})"
        )
