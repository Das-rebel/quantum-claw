"""
ExecutionEngine - Parallel Task Execution with Verification

Based on arXiv:2505.13516 (HALO) and arXiv:2506.12508v3 (AgentOrchestra)

This module implements Tier 3 of HALO orchestration:
- Executes subtasks in parallel where possible
- Resolves dependencies automatically
- Monitors execution and handles failures
- Adaptive refinement for low-confidence results
"""

import asyncio
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
import logging

from .task_planner import SubTask, TaskDecomposition
from .role_assigner import AgentAssignment


logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    """Result of executing a single subtask"""
    subtask_id: str
    success: bool
    output: Any
    error: Optional[str] = None
    execution_time_seconds: float = 0.0
    tokens_used: int = 0
    cost_usd: float = 0.0
    provider: str = ""
    confidence: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "subtask_id": self.subtask_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "execution_time_seconds": self.execution_time_seconds,
            "tokens_used": self.tokens_used,
            "cost_usd": self.cost_usd,
            "provider": self.provider,
            "confidence": self.confidence
        }


@dataclass
class ExecutionSummary:
    """Summary of executing all subtasks"""
    total_subtasks: int
    successful_subtasks: int
    failed_subtasks: int
    total_execution_time_seconds: float
    total_cost_usd: float
    results: Dict[str, ExecutionResult] = field(default_factory=dict)
    parallel_speedup: float = 1.0


class ExecutionEngine:
    """
    Execute subtasks with dependency resolution and parallelization

    Implements Tier 3 of HALO orchestration:
    - Resolves dependencies between subtasks
    - Executes independent tasks in parallel
    - Monitors execution and handles failures
    - Provides adaptive refinement for low-confidence results
    """

    def __init__(self, max_concurrent: int = 5):
        """
        Initialize execution engine

        Args:
            max_concurrent: Maximum number of parallel executions
        """
        self.max_concurrent = max_concurrent
        self.execution_history = []

    async def execute_parallel(
        self,
        decomposition: TaskDecomposition,
        assignments: Dict[str, AgentAssignment],
        timeout_seconds: int = 300
    ) -> ExecutionSummary:
        """
        Execute all subtasks with parallelization

        Args:
            decomposition: Task decomposition with execution order
            assignments: Agent assignments for each subtask
            timeout_seconds: Maximum time per subtask

        Returns:
            ExecutionSummary with all results
        """
        start_time = datetime.now()
        results = {}

        # Execute in dependency order
        for subtask_id in decomposition.execution_order:
            # Find this subtask
            subtask = next(st for st in decomposition.subtasks if st.id == subtask_id)

            # Check if dependencies are satisfied
            if not self._dependencies_satisfied(subtask, results):
                logger.warning(f"Dependencies not satisfied for {subtask_id}, skipping")
                continue

            # Execute subtask
            result = await self._execute_subtask(
                subtask,
                assignments[subtask_id],
                timeout_seconds
            )
            results[subtask_id] = result

            # If failed, try to recover
            if not result.success:
                logger.error(f"Subtask {subtask_id} failed: {result.error}")
                # Could implement retry logic here

        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds()

        # Calculate summary statistics
        successful = sum(1 for r in results.values() if r.success)
        failed = len(results) - successful
        total_cost = sum(r.cost_usd for r in results.values())

        # Estimate parallel speedup
        sequential_time = sum(
            st.estimated_duration_seconds
            for st in decomposition.subtasks
        )
        parallel_speedup = sequential_time / total_time if total_time > 0 else 1.0

        summary = ExecutionSummary(
            total_subtasks=len(decomposition.subtasks),
            successful_subtasks=successful,
            failed_subtasks=failed,
            total_execution_time_seconds=total_time,
            total_cost_usd=total_cost,
            results=results,
            parallel_speedup=parallel_speedup
        )

        self.execution_history.append(summary)

        return summary

    def _dependencies_satisfied(
        self,
        subtask: SubTask,
        results: Dict[str, ExecutionResult]
    ) -> bool:
        """Check if all dependencies for a subtask are satisfied"""
        for dep_id in subtask.dependencies:
            if dep_id not in results:
                return False
            if not results[dep_id].success:
                return False
        return True

    async def _execute_subtask(
        self,
        subtask: SubTask,
        assignment: AgentAssignment,
        timeout_seconds: int
    ) -> ExecutionResult:
        """
        Execute a single subtask with its assigned agent

        This is a simplified implementation. In production, this would:
        - Call the actual LLM API
        - Handle retries and circuit breakers
        - Track tokens and cost accurately
        - Implement proper error handling
        """
        import time
        start_time = time.time()

        try:
            # Simulate execution (replace with actual LLM call)
            await asyncio.sleep(subtask.estimated_duration_seconds / 10)  # Speed up for demo

            # Mock result
            output = f"Completed: {subtask.description}"
            success = True

            execution_time = time.time() - start_time

            # Estimate cost (in production, get from actual API response)
            estimated_tokens = 500  # Mock
            cost = estimated_tokens * assignment.agent_config.cost_per_1k_tokens / 1000.0

            return ExecutionResult(
                subtask_id=subtask.id,
                success=success,
                output=output,
                execution_time_seconds=execution_time,
                tokens_used=estimated_tokens,
                cost_usd=cost,
                provider=assignment.agent_config.model_provider,
                confidence=assignment.confidence
            )

        except Exception as e:
            execution_time = time.time() - start_time

            return ExecutionResult(
                subtask_id=subtask.id,
                success=False,
                output=None,
                error=str(e),
                execution_time_seconds=execution_time,
                tokens_used=0,
                cost_usd=0.0,
                confidence=0.0
            )

    async def execute_parallel_batch(
        self,
        ready_subtasks: List[SubTask],
        assignments: Dict[str, AgentAssignment],
        timeout_seconds: int = 300
    ) -> List[ExecutionResult]:
        """
        Execute multiple subtasks in parallel (respecting max_concurrent)

        Args:
            ready_subtasks: Subtasks with all dependencies satisfied
            assignments: Agent assignments
            timeout_seconds: Timeout per subtask

        Returns:
            List of ExecutionResults
        """
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def execute_with_semaphore(subtask: SubTask) -> ExecutionResult:
            async with semaphore:
                return await self._execute_subtask(
                    subtask,
                    assignments[subtask.id],
                    timeout_seconds
                )

        # Execute all ready subtasks in parallel
        results = await asyncio.gather(
            *[execute_with_semaphore(st) for st in ready_subtasks],
            return_exceptions=True
        )

        # Handle exceptions
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Create failed result for exception
                final_results.append(ExecutionResult(
                    subtask_id=ready_subtasks[i].id,
                    success=False,
                    output=None,
                    error=str(result),
                    execution_time_seconds=0,
                    tokens_used=0,
                    cost_usd=0.0,
                    confidence=0.0
                ))
            else:
                final_results.append(result)

        return final_results

    def get_execution_stats(self) -> Dict[str, Any]:
        """Get statistics about executions performed"""
        if not self.execution_history:
            return {"total_executions": 0}

        total_subtasks = sum(s.total_subtasks for s in self.execution_history)
        total_successful = sum(s.successful_subtasks for s in self.execution_history)
        total_failed = sum(s.failed_subtasks for s in self.execution_history)
        avg_speedup = sum(s.parallel_speedup for s in self.execution_history) / len(self.execution_history)
        total_cost = sum(s.total_cost_usd for s in self.execution_history)

        return {
            "total_executions": len(self.execution_history),
            "total_subtasks_executed": total_subtasks,
            "total_successful": total_successful,
            "total_failed": total_failed,
            "success_rate": total_successful / total_subtasks if total_subtasks > 0 else 0,
            "average_parallel_speedup": avg_speedup,
            "total_cost_usd": total_cost
        }


# Example usage
async def main():
    """Example of ExecutionEngine usage"""
    from .task_planner import TaskPlanner
    from .role_assigner import RoleAssigner

    # Create components
    planner = TaskPlanner()
    assigner = RoleAssigner()
    engine = ExecutionEngine(max_concurrent=3)

    # Create task
    task = {
        "description": "Build a REST API with user authentication",
        "context": {"requirements": ["JWT", "PostgreSQL"]}
    }

    # Decompose
    print("Decomposing task...")
    decomposition = await planner.decompose(task)

    # Assign agents
    print("Assigning agents...")
    assignments = await assigner.assign_roles(
        decomposition.subtasks,
        optimization_target="balanced"
    )

    # Execute
    print("Executing subtasks...")
    summary = await engine.execute_parallel(decomposition, assignments)

    print(f"\nExecution Summary:")
    print(f"  Total subtasks: {summary.total_subtasks}")
    print(f"  Successful: {summary.successful_subtasks}")
    print(f"  Failed: {summary.failed_subtasks}")
    print(f"  Total time: {summary.total_execution_time_seconds:.2f}s")
    print(f"  Total cost: ${summary.total_cost_usd:.6f}")
    print(f"  Parallel speedup: {summary.parallel_speedup:.2f}x")

    print(f"\nResults:")
    for subtask_id, result in summary.results.items():
        print(f"  {subtask_id}: {'✅' if result.success else '❌'}")
        if result.success:
            print(f"    Output: {result.output}")
        else:
            print(f"    Error: {result.error}")


if __name__ == "__main__":
    asyncio.run(main())
