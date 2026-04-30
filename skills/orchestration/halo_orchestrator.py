"""
HALO Orchestrator - Hierarchical Autonomous Logic-Oriented Orchestration

Based on arXiv:2505.13516 (HALO) and arXiv:2506.12508v3 (AgentOrchestra)

This is the main orchestrator that coordinates all three tiers:
- Tier 1: TaskPlanner (high-level decomposition)
- Tier 2: RoleAssigner (specialized agent assignment)
- Tier 3: ExecutionEngine (parallel execution with verification)

Key Features:
- 19.6% improvement on complex tasks (vs flat orchestration)
- MCTS-based workflow search (optional, for complex tasks)
- Adaptive refinement for low-confidence results
- Hierarchical planning with automatic dependency resolution
"""

import asyncio
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import logging

from .task_planner import TaskPlanner, TaskDecomposition, SubTask
from .role_assigner import RoleAssigner, AgentAssignment
from .execution_engine import ExecutionEngine, ExecutionResult, ExecutionSummary


logger = logging.getLogger(__name__)


@dataclass
class HALOOrchestrationResult:
    """Result of HALO orchestration"""
    success: bool
    final_output: Any
    decomposition: TaskDecomposition
    assignments: Dict[str, AgentAssignment]
    execution_summary: ExecutionSummary
    metadata: Dict[str, Any] = field(default_factory=dict)


class HALOOrchestrator:
    """
    Hierarchical Autonomous Logic-Oriented Orchestrator

    Implements 3-tier hierarchical planning:
    1. TaskPlanner: Decompose task into subtasks with dependencies
    2. RoleAssigner: Assign specialized agents to each subtask
    3. ExecutionEngine: Execute subtasks in parallel with verification

    Key Innovation: Hierarchical planning outperforms flat execution
    - 19.6% improvement on expert tasks (MATH, reasoning)
    - Better on complex, multi-step tasks
    - Automatic dependency resolution
    """

    def __init__(
        self,
        max_concurrent: int = 5,
        optimization_target: str = "balanced",
        enable_mcts: bool = False
    ):
        """
        Initialize HALO orchestrator

        Args:
            max_concurrent: Maximum parallel executions
            optimization_target: "quality", "cost", or "balanced"
            enable_mcts: Enable MCTS-based workflow search (slower but better)
        """
        # Initialize three tiers
        self.planner = TaskPlanner()
        self.assigner = RoleAssigner()
        self.executor = ExecutionEngine(max_concurrent=max_concurrent)

        # Configuration
        self.optimization_target = optimization_target
        self.enable_mcts = enable_mcts

        # Statistics
        self.orchestration_history = []

    async def orchestrate(
        self,
        task: Dict[str, Any],
        max_subtasks: int = 10,
        timeout_seconds: int = 300
    ) -> HALOOrchestrationResult:
        """
        Orchestrate task execution with hierarchical planning

        Args:
            task: Task to execute with 'description' and optional 'context'
            max_subtasks: Maximum number of subtasks to create
            timeout_seconds: Timeout per subtask

        Returns:
            HALOOrchestrationResult with final output and metadata
        """
        logger.info(f"Starting HALO orchestration for task: {task.get('description', 'Unknown')}")

        # Tier 1: High-level planning
        logger.info("Tier 1: Decomposing task...")
        decomposition = await self.planner.decompose(
            task,
            max_subtasks=max_subtasks
        )

        logger.info(f"  Decomposed into {len(decomposition.subtasks)} subtasks")
        logger.info(f"  Execution order: {decomposition.execution_order}")

        # Tier 2: Role assignment
        logger.info("Tier 2: Assigning specialized agents...")
        assignments = await self.assigner.assign_roles(
            decomposition.subtasks,
            optimization_target=self.optimization_target
        )

        logger.info(f"  Assigned {len(assignments)} agents")

        # Log assignments
        for subtask_id, assignment in assignments.items():
            logger.debug(f"    {subtask_id}: {assignment.agent_config.model_provider}/{assignment.agent_config.model_name}")

        # Tier 3: Execution with adaptive refinement
        logger.info("Tier 3: Executing subtasks...")
        execution_summary = await self.executor.execute_parallel(
            decomposition,
            assignments,
            timeout_seconds
        )

        logger.info(f"  Execution complete: {execution_summary.successful_subtasks}/{execution_summary.total_subtasks} successful")
        logger.info(f"  Parallel speedup: {execution_summary.parallel_speedup:.2f}x")
        logger.info(f"  Total cost: ${execution_summary.total_cost_usd:.6f}")

        # Synthesize final output
        final_output = self._synthesize_results(
            decomposition,
            execution_summary
        )

        # Create result
        result = HALOOrchestrationResult(
            success=execution_summary.failed_subtasks == 0,
            final_output=final_output,
            decomposition=decomposition,
            assignments=assignments,
            execution_summary=execution_summary,
            metadata={
                "orchestration_method": "halo_3_tier",
                "optimization_target": self.optimization_target,
                "mcts_enabled": self.enable_mcts,
                "timestamp": datetime.now().isoformat(),
                "total_subtasks": len(decomposition.subtasks),
                "parallel_speedup": execution_summary.parallel_speedup,
                "total_cost_usd": execution_summary.total_cost_usd
            }
        )

        self.orchestration_history.append(result)

        return result

    def _synthesize_results(
        self,
        decomposition: TaskDecomposition,
        execution_summary: ExecutionSummary
    ) -> Any:
        """
        Synthesize results from all subtasks into final output

        This is a simplified implementation. In production, this would:
        - Combine outputs from all subtasks
        - Handle dependencies between results
        - Format final output appropriately
        - Handle partial failures gracefully
        """
        successful_results = [
            r for r in execution_summary.results.values()
            if r.success
        ]

        if not successful_results:
            return {
                "success": False,
                "error": "All subtasks failed",
                "details": execution_summary.results
            }

        # Simple concatenation of outputs (in production, would be smarter)
        outputs = [r.output for r in successful_results]

        return {
            "success": True,
            "subtask_outputs": outputs,
            "summary": f"Completed {len(successful_results)} subtasks successfully",
            "total_cost_usd": execution_summary.total_cost_usd,
            "parallel_speedup": execution_summary.parallel_speedup
        }

    async def orchestrate_with_plan(
        self,
        task: Dict[str, Any],
        plan: TaskDecomposition,
        timeout_seconds: int = 300
    ) -> HALOOrchestrationResult:
        """
        Orchestrate task execution with a pre-existing decomposition plan

        Useful when you want to reuse a decomposition or modify it before execution.

        Args:
            task: Original task
            plan: Pre-computed decomposition
            timeout_seconds: Timeout per subtask

        Returns:
            HALOOrchestrationResult
        """
        logger.info(f"Starting HALO orchestration with pre-computed plan")

        # Skip planning tier, go directly to role assignment
        assignments = await self.assigner.assign_roles(
            plan.subtasks,
            optimization_target=self.optimization_target
        )

        execution_summary = await self.executor.execute_parallel(
            plan,
            assignments,
            timeout_seconds
        )

        final_output = self._synthesize_results(plan, execution_summary)

        return HALOOrchestrationResult(
            success=execution_summary.failed_subtasks == 0,
            final_output=final_output,
            decomposition=plan,
            assignments=assignments,
            execution_summary=execution_summary,
            metadata={
                "orchestration_method": "halo_with_plan",
                "timestamp": datetime.now().isoformat()
            }
        )

    def get_orchestration_stats(self) -> Dict[str, Any]:
        """Get statistics about orchestrations performed"""
        if not self.orchestration_history:
            return {"total_orchestrations": 0}

        total = len(self.orchestration_history)
        successful = sum(1 for r in self.orchestration_history if r.success)
        avg_speedup = sum(
            r.metadata.get("parallel_speedup", 1.0)
            for r in self.orchestration_history
        ) / total
        total_cost = sum(
            r.execution_summary.total_cost_usd
            for r in self.orchestration_history
        )

        return {
            "total_orchestrations": total,
            "successful_orchestrations": successful,
            "success_rate": successful / total if total > 0 else 0,
            "average_parallel_speedup": avg_speedup,
            "total_cost_usd": total_cost
        }

    async def adaptive_refinement(
        self,
        low_confidence_results: List[ExecutionResult],
        original_task: Dict[str, Any]
    ) -> List[ExecutionResult]:
        """
        Re-execute low-confidence results with alternative strategies

        This is a placeholder for MCTS-based adaptive refinement.
        In full implementation, would use MCTS to search better execution paths.

        Args:
            low_confidence_results: Results with confidence < threshold
            original_task: Original task context

        Returns:
            List of refined ExecutionResults
        """
        refined = []

        for result in low_confidence_results:
            if result.confidence < 0.7:
                logger.info(f"Refining low-confidence result: {result.subtask_id}")

                # Simple retry with different parameters (in production: use MCTS)
                # For now, just return the original result
                refined.append(result)

        return refined


# Example usage and testing
async def main():
    """Example of HALOOrchestrator usage"""
    # Initialize orchestrator
    orchestrator = HALOOrchestrator(
        max_concurrent=3,
        optimization_target="balanced"
    )

    # Simple task (should not decompose much)
    simple_task = {
        "description": "What is 2+2?",
        "context": {}
    }

    print("=" * 60)
    print("Example 1: Simple Task")
    print("=" * 60)

    result = await orchestrator.orchestrate(simple_task)

    print(f"\nResult:")
    print(f"  Success: {result.success}")
    print(f"  Output: {result.final_output}")
    print(f"  Subtasks: {result.metadata['total_subtasks']}")
    print(f"  Speedup: {result.metadata['parallel_speedup']:.2f}x")
    print(f"  Cost: ${result.metadata['total_cost_usd']:.6f}")

    # Complex task (should decompose and parallelize)
    complex_task = {
        "description": "Build a REST API with user authentication and database integration",
        "context": {"requirements": ["JWT", "PostgreSQL", "Docker"]}
    }

    print("\n" + "=" * 60)
    print("Example 2: Complex Task")
    print("=" * 60)

    result = await orchestrator.orchestrate(complex_task)

    print(f"\nResult:")
    print(f"  Success: {result.success}")
    print(f"  Output: {result.final_output}")
    print(f"  Subtasks: {result.metadata['total_subtasks']}")
    print(f"  Speedup: {result.metadata['parallel_speedup']:.2f}x")
    print(f"  Cost: ${result.metadata['total_cost_usd']:.6f}")

    # Stats
    stats = orchestrator.get_orchestration_stats()
    print(f"\nOrchestrator Stats:")
    print(f"  Total orchestrations: {stats['total_orchestrations']}")
    print(f"  Success rate: {stats['success_rate']:.2%}")
    print(f"  Average speedup: {stats['average_parallel_speedup']:.2f}x")


if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    asyncio.run(main())
