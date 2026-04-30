"""
TMLPD v2.2 - Backward-Compatible Integration Layer

This module provides a unified API that exposes both v2.1 and v2.2 features
in a backward-compatible way, ensuring existing v2.1 code continues to work.

Key Features:
- Backward-compatible with v2.1 API
- Exposes v2.2 features (HALO, Universal Router, MCTS)
- Smart defaults for automatic feature selection
- Progressive enhancement model
"""

from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
import logging

# Import v2.1 components (assuming they exist)
try:
    from .difficulty_classifier import DifficultyClassifier, TaskDifficulty
    from .enhanced_agent import TMLEnhancedAgent
    V21_AVAILABLE = True
except ImportError:
    V21_AVAILABLE = False
    logging.warning("v2.1 components not found, running in v2.2-only mode")

# Import v2.2 components
from .orchestration import (
    TaskPlanner, RoleAssigner, ExecutionEngine, HALOOrchestrator,
    MCTSWorkflowSearch, TaskDecomposition, HALOOrchestrationResult
)
from .routing import UniversalModelRouter, ModelProfile, RoutingDecision


logger = logging.getLogger(__name__)


@dataclass
class TMLPDConfig:
    """Configuration for TMLPD v2.2"""
    # v2.1 settings
    use_difficulty_classifier: bool = True
    use_enhanced_agent: bool = True

    # v2.2 settings
    use_halo_orchestration: bool = False  # Disabled by default for backward compatibility
    use_universal_router: bool = False
    use_mcts_optimization: bool = False

    # HALO settings
    max_concurrent_subtasks: int = 5
    halo_optimization_target: str = "balanced"  # "quality", "cost", "balanced"

    # Universal Router settings
    router_quality_target: float = 0.95
    router_cost_weight: float = 0.5

    # MCTS settings
    mcts_simulations: int = 50
    mcts_exploration_weight: float = 1.414

    # Fallback settings
    enable_fallback: bool = True
    fallback_on_error: bool = True


class TMLPDOrchestrator:
    """
    Main TMLPD orchestrator with v2.1 + v2.2 support

    This is the primary API for TMLPD v2.2. It automatically selects
    the best orchestration strategy based on config and task complexity.

    Backward Compatibility:
    - Default behavior matches v2.1 (difficulty classification → enhanced agent)
    - Enable v2.2 features via config
    - All v2.1 API methods preserved
    """

    def __init__(self, config: Optional[TMLPDConfig] = None):
        """
        Initialize TMLPD orchestrator

        Args:
            config: Configuration for v2.1/v2.2 features
                    If None, uses defaults (v2.1 behavior)
        """
        self.config = config or TMLPDConfig()

        # Initialize v2.1 components
        if V21_AVAILABLE and self.config.use_difficulty_classifier:
            self.difficulty_classifier = DifficultyClassifier()
        else:
            self.difficulty_classifier = None

        if V21_AVAILABLE and self.config.use_enhanced_agent:
            self.enhanced_agent = TMLEnhancedAgent()
        else:
            self.enhanced_agent = None

        # Initialize v2.2 components
        if self.config.use_halo_orchestration:
            self.halo_orchestrator = HALOOrchestrator(
                max_concurrent=self.config.max_concurrent_subtasks,
                optimization_target=self.config.halo_optimization_target
            )
            self.mcts_search = MCTSWorkflowSearch(
                RoleAssigner(),
                ExecutionEngine(max_concurrent=self.config.max_concurrent_subtasks),
                max_simulations=self.config.mcts_simulations
            ) if self.config.use_mcts_optimization else None
        else:
            self.halo_orchestrator = None
            self.mcts_search = None

        if self.config.use_universal_router:
            self.universal_router = UniversalModelRouter(
                quality_target=self.config.router_quality_target,
                cost_weight=self.config.router_cost_weight
            )
        else:
            self.universal_router = None

        logger.info(f"Initialized TMLPD v2.2 with config: {self.config}")

    async def execute_task(
        self,
        task: Dict[str, Any],
        preferred_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute a task (main API method)

        This method automatically selects the best execution strategy:
        - If HALO enabled and task is complex → HALO orchestration
        - If Universal Router enabled → smart routing
        - Otherwise → v2.1 behavior (difficulty classification + enhanced agent)

        Args:
            task: Task with 'description' and optional 'context'
            preferred_model: Specific model to use (overrides routing)

        Returns:
            Dict with execution results
        """
        logger.info(f"Executing task: {task.get('description', 'Unknown')}")

        # Check if task is complex enough for HALO
        should_use_halo = (
            self.config.use_halo_orchestration and
            self._is_complex_task(task)
        )

        if should_use_halo:
            logger.info("Using HALO orchestration")
            return await self._execute_with_halo(task)

        # Use Universal Router if enabled
        if self.config.use_universal_router and not preferred_model:
            logger.info("Using Universal Router")
            return await self._execute_with_router(task)

        # Fall back to v2.1 behavior
        logger.info("Using v2.1 execution path")
        return await self._execute_v21(task, preferred_model)

    async def _execute_with_halo(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute using HALO orchestration (v2.2)"""
        try:
            result: HALOOrchestrationResult = await self.halo_orchestrator.orchestrate(task)

            return {
                "success": result.success,
                "output": result.final_output,
                "method": "halo_orchestration",
                "metadata": {
                    "total_subtasks": result.metadata.get("total_subtasks", 0),
                    "parallel_speedup": result.metadata.get("parallel_speedup", 1.0),
                    "total_cost_usd": result.metadata.get("total_cost_usd", 0.0),
                    "orchestration_method": result.metadata.get("orchestration_method", "halo")
                }
            }
        except Exception as e:
            logger.error(f"HALO execution failed: {e}")
            if self.config.fallback_on_error:
                logger.info("Falling back to v2.1 execution")
                return await self._execute_v21(task)

            raise

    async def _execute_with_router(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute using Universal Router (v2.2)"""
        try:
            available_models = [
                "anthropic/claude-3-5-sonnet-20241022",
                "openai/gpt-4o",
                "cerebras/llama-3.3-70b",
                "groq/llama-3.3-70b"
            ]

            decision: RoutingDecision = await self.universal_router.route(task, available_models)

            # Execute with selected model (simplified - would call actual LLM in production)
            return {
                "success": True,
                "output": f"Executed with {decision.selected_model}",
                "method": "universal_router",
                "metadata": {
                    "selected_model": decision.selected_model,
                    "predicted_quality": decision.predicted_quality,
                    "estimated_cost": decision.estimated_cost,
                    "reasoning": decision.reasoning
                }
            }
        except Exception as e:
            logger.error(f"Router execution failed: {e}")
            if self.config.fallback_on_error:
                logger.info("Falling back to v2.1 execution")
                return await self._execute_v21(task)

            raise

    async def _execute_v21(
        self,
        task: Dict[str, Any],
        preferred_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute using v2.1 path (backward compatible)"""
        if not V21_AVAILABLE:
            # If v2.1 not available, use simple execution
            return {
                "success": True,
                "output": f"Executed (simple mode): {task.get('description', '')}",
                "method": "simple_fallback"
            }

        try:
            # Difficulty classification
            if self.difficulty_classifier:
                difficulty = await self.difficulty_classifier.classify(task)
                logger.info(f"Task difficulty: {difficulty}")
            else:
                difficulty = None

            # Enhanced agent execution
            if self.enhanced_agent:
                result = await self.enhanced_agent.execute_task(task, preferred_model)
            else:
                result = {"success": True, "output": "Executed"}

            return {
                "success": result.get("success", True),
                "output": result.get("output", ""),
                "method": "v21_enhanced_agent",
                "metadata": {
                    "difficulty": str(difficulty) if difficulty else "unknown",
                    "preferred_model": preferred_model
                }
            }
        except Exception as e:
            logger.error(f"v2.1 execution failed: {e}")
            raise

    def _is_complex_task(self, task: Dict[str, Any]) -> bool:
        """
        Determine if task is complex enough for HALO orchestration

        Uses simple heuristics based on task description and context
        """
        description = task.get("description", "")
        context = task.get("context", {})

        # Complexity indicators
        complexity_score = 0

        # Length
        if len(description.split()) > 50:
            complexity_score += 1

        # Multi-step indicators
        multi_step_words = ["then", "after", "next", "finally", "additionally"]
        if any(word in description.lower() for word in multi_step_words):
            complexity_score += 1

        # Technical complexity
        technical_words = ["api", "database", "algorithm", "architecture", "system"]
        if any(word in description.lower() for word in technical_words):
            complexity_score += 1

        # Requirements/constraints
        if len(context.get("requirements", [])) > 2:
            complexity_score += 1

        # Task is complex if score >= 2
        return complexity_score >= 2

    # v2.1 Backward-compatible API methods
    async def classify_difficulty(self, task: Dict[str, Any]) -> Optional[str]:
        """Classify task difficulty (v2.1 API)"""
        if self.difficulty_classifier:
            result = await self.difficulty_classifier.classify(task)
            return str(result)
        return None

    async def route_to_model(
        self,
        task: Dict[str, Any],
        available_models: List[str]
    ) -> Optional[str]:
        """Route task to best model (v2.1 API + v2.2 enhancement)"""
        if self.universal_router:
            decision = await self.universal_router.route(task, available_models)
            return decision.selected_model
        return None

    def get_config(self) -> TMLPDConfig:
        """Get current configuration"""
        return self.config

    def update_config(self, **kwargs):
        """Update configuration"""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
            else:
                logger.warning(f"Unknown config key: {key}")

        logger.info(f"Updated config: {kwargs}")


# Convenience function for quick usage
async def execute_task_simple(
    description: str,
    context: Optional[Dict[str, Any]] = None,
    use_halo: bool = False,
    use_router: bool = False
) -> Dict[str, Any]:
    """
    Simple API for one-off task execution

    Args:
        description: Task description
        context: Optional task context
        use_halo: Enable HALO orchestration
        use_router: Enable Universal Router

    Returns:
        Execution result
    """
    config = TMLPDConfig(
        use_halo_orchestration=use_halo,
        use_universal_router=use_router
    )

    orchestrator = TMLPDOrchestrator(config)

    task = {
        "description": description,
        "context": context or {}
    }

    return await orchestrator.execute_task(task)


# Example usage
async def main():
    """Example of TMLPD v2.2 usage"""

    print("=" * 70)
    print("TMLPD v2.2 - Backward-Compatible API Demo")
    print("=" * 70)

    # Example 1: v2.1 behavior (default)
    print("\n1. Default (v2.1 behavior):")
    result = await execute_task_simple("What is 2+2?")
    print(f"   Method: {result['method']}")
    print(f"   Success: {result['success']}")

    # Example 2: Enable Universal Router
    print("\n2. With Universal Router (v2.2):")
    result = await execute_task_simple(
        "What is the capital of France?",
        use_router=True
    )
    print(f"   Method: {result['method']}")
    print(f"   Selected Model: {result['metadata'].get('selected_model', 'N/A')}")

    # Example 3: Enable HALO for complex task
    print("\n3. With HALO Orchestration (v2.2):")
    result = await execute_task_simple(
        "Build a REST API with authentication, database, and testing",
        use_halo=True
    )
    print(f"   Method: {result['method']}")
    print(f"   Success: {result['success']}")
    if "subtasks" in result.get("metadata", {}):
        print(f"   Subtasks: {result['metadata']['total_subtasks']}")

    # Example 4: Full v2.2 config
    print("\n4. Full v2.2 Configuration:")
    config = TMLPDConfig(
        use_halo_orchestration=True,
        use_universal_router=True,
        use_mcts_optimization=True,
        halo_optimization_target="balanced",
        mcts_simulations=30
    )

    orchestrator = TMLPDOrchestrator(config)

    task = {
        "description": "Design and implement a microservices architecture",
        "context": {"requirements": ["docker", "kubernetes", "api-gateway"]}
    }

    result = await orchestrator.execute_task(task)
    print(f"   Method: {result['method']}")
    print(f"   Success: {result['success']}")

    print("\n" + "=" * 70)
    print("Demo Complete")
    print("=" * 70)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
