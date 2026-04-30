"""
Phase 4b: Parallelization Executor

Concurrent execution of independent tasks.
Based on agent orchestration patterns from arXiv:2506.12508.
"""

import asyncio
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from ..providers.registry import MultiProviderExecutor
from ..skills.skill_manager import SkillManager


class ParallelizationExecutor:
    """
    Execute independent tasks concurrently for improved performance.

    Based on agent orchestration patterns (arXiv:2506.12508)

    Features:
    - Concurrent task execution
    - Dependency resolution
    - Progress tracking
    - Error isolation (one failure doesn't stop others)
    - Resource limits
    """

    def __init__(
        self,
        provider_executor: Optional[MultiProviderExecutor] = None,
        skill_manager: Optional[SkillManager] = None,
        max_concurrent: int = 10
    ):
        """
        Initialize parallelization executor.

        Args:
            provider_executor: Multi-provider executor for LLM calls
            skill_manager: Skill manager for loading skills
            max_concurrent: Maximum concurrent tasks
        """
        self.provider_executor = provider_executor
        self.skill_manager = skill_manager
        self.max_concurrent = max_concurrent

    async def execute_parallel(
        self,
        tasks: List[Dict[str, Any]],
        fail_on_error: bool = False,
        return_exceptions: bool = True
    ) -> Dict[str, Any]:
        """
        Execute multiple tasks concurrently.

        Args:
            tasks: List of task definitions
            fail_on_error: Whether to stop on first error
            return_exceptions: Whether to return exceptions instead of raising

        Returns:
            Execution result with task results and statistics
        """
        start_time = datetime.now()

        print(f"\n🚀 Executing {len(tasks)} tasks in parallel (max {self.max_concurrent} concurrent)")

        # Create semaphore to limit concurrency
        semaphore = asyncio.Semaphore(self.max_concurrent)

        # Create tasks
        async_tasks = []
        for i, task in enumerate(tasks):
            task_id = task.get("id", f"task_{i+1}")
            async_task = self._execute_with_semaphore(
                task_id,
                task,
                semaphore
            )
            async_tasks.append(async_task)

        # Execute all tasks
        if return_exceptions:
            results = await asyncio.gather(*async_tasks, return_exceptions=True)
        else:
            results = await asyncio.gather(*async_tasks)

        # Process results
        task_results = []
        successful = 0
        failed = 0

        for i, result in enumerate(results):
            task_id = tasks[i].get("id", f"task_{i+1}")

            if isinstance(result, Exception):
                task_results.append({
                    "task_id": task_id,
                    "status": "error",
                    "error": str(result),
                    "result": None
                })
                failed += 1
            else:
                task_results.append({
                    "task_id": task_id,
                    "status": "success" if result.get("success") else "error",
                    **result
                })

                if result.get("success"):
                    successful += 1
                else:
                    failed += 1

        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds()

        # Calculate speedup
        sequential_time = sum(
            t.get("estimated_time", 1.0) for t in tasks
        )
        speedup = sequential_time / total_time if total_time > 0 else 1.0

        print(f"\n✅ Completed: {successful} successful, {failed} failed")
        print(f"⏱️  Total time: {total_time:.2f}s (estimated sequential: {sequential_time:.2f}s)")
        print(f"🚀 Speedup: {speedup:.2f}x")

        return {
            "success": failed == 0 or not fail_on_error,
            "total_tasks": len(tasks),
            "successful_tasks": successful,
            "failed_tasks": failed,
            "task_results": task_results,
            "total_time": total_time,
            "sequential_time_estimate": sequential_time,
            "speedup": speedup,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat()
        }

    async def _execute_with_semaphore(
        self,
        task_id: str,
        task: Dict[str, Any],
        semaphore: asyncio.Semaphore
    ) -> Dict[str, Any]:
        """Execute task with semaphore (concurrency limit)"""
        async with semaphore:
            return await self._execute_task(task_id, task)

    async def _execute_task(
        self,
        task_id: str,
        task: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a single task"""
        task_start = datetime.now()
        task_type = task.get("type", "llm")

        print(f"   ⚙️  {task_id}: Starting ({task_type})")

        try:
            if task_type == "llm":
                result = await self._execute_llm_task(task)
            elif task_type == "function":
                result = await self._execute_function_task(task)
            elif task_type == "chain":
                result = await self._execute_chain_task(task)
            else:
                raise ValueError(f"Unknown task type: {task_type}")

            task_end = datetime.now()
            execution_time = (task_end - task_start).total_seconds()

            result["execution_time"] = execution_time
            result["timestamp"] = task_end.isoformat()

            status = "✅" if result.get("success") else "❌"
            print(f"   {status} {task_id}: Complete ({execution_time:.2f}s)")

            return result

        except Exception as e:
            task_end = datetime.now()
            execution_time = (task_end - task_start).total_seconds()

            print(f"   ❌ {task_id}: Failed - {e}")

            return {
                "success": False,
                "error": str(e),
                "execution_time": execution_time,
                "timestamp": task_end.isoformat()
            }

    async def _execute_llm_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute LLM task"""
        if not self.provider_executor:
            raise ValueError("provider_executor required for LLM tasks")

        response = await self.provider_executor.execute({
            "description": task["prompt"],
            **task.get("execution_params", {})
        })

        return {
            "result": response.content if response.success else response.error,
            "success": response.success,
            "tokens_used": response.tokens_used,
            "cost": response.cost
        }

    async def _execute_function_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute function task"""
        if "function" not in task:
            raise ValueError("function task requires 'function' key")

        func = task["function"]
        args = task.get("args", [])
        kwargs = task.get("kwargs", {})

        if asyncio.iscoroutinefunction(func):
            result = await func(*args, **kwargs)
        else:
            # Run synchronous function in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: func(*args, **kwargs)
            )

        return {
            "result": result,
            "success": True
        }

    async def _execute_chain_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute chain task (sequential sub-tasks)"""
        from .chaining_executor import ChainingExecutor

        if "steps" not in task:
            raise ValueError("chain task requires 'steps' key")

        chaining_executor = ChainingExecutor(
            self.provider_executor,
            self.skill_manager
        )

        return await chaining_executor.execute_chain(
            task["steps"],
            initial_context=task.get("context"),
            continue_on_error=task.get("continue_on_error", False)
        )

    async def execute_with_dependencies(
        self,
        tasks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Execute tasks with dependency resolution.

        Tasks will execute as soon as their dependencies are satisfied.

        Args:
            tasks: List of task definitions with 'depends_on' field

        Returns:
            Execution result
        """
        print("\n🔗 Executing tasks with dependency resolution")

        # Build dependency graph
        task_map = {task.get("id", f"task_{i+1}"): task for i, task in enumerate(tasks)}

        # Track completed tasks
        completed = set()
        results = {}

        start_time = datetime.now()

        while len(completed) < len(tasks):
            # Find tasks whose dependencies are satisfied
            ready_tasks = []

            for task_id, task in task_map.items():
                if task_id in completed:
                    continue

                dependencies = task.get("depends_on", [])

                if all(dep in completed for dep in dependencies):
                    ready_tasks.append((task_id, task))

            if not ready_tasks:
                # Circular dependency or missing dependency
                raise ValueError("No ready tasks - possible circular dependency")

            # Execute ready tasks in parallel
            print(f"\n🚀 Executing batch of {len(ready_tasks)} tasks")

            batch_results = await self.execute_parallel(
                [task for _, task in ready_tasks],
                return_exceptions=True
            )

            # Mark as completed
            for i, (task_id, task) in enumerate(ready_tasks):
                completed.add(task_id)
                results[task_id] = batch_results["task_results"][i]

        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds()

        successful = sum(
            1 for r in results.values() if r.get("status") == "success"
        )

        return {
            "success": successful == len(tasks),
            "total_tasks": len(tasks),
            "successful_tasks": successful,
            "task_results": results,
            "total_time": total_time,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat()
        }

    def explain_execution(
        self,
        tasks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Explain execution plan for parallel tasks.

        Returns information about how tasks will execute.
        """
        task_explanations = []

        for i, task in enumerate(tasks):
            task_id = task.get("id", f"task_{i+1}")

            explanation = {
                "task_id": task_id,
                "type": task.get("type", "llm"),
                "description": task.get("description", ""),
                "dependencies": task.get("depends_on", []),
                "estimated_time": task.get("estimated_time", 1.0),
                "can_parallelize": len(task.get("depends_on", [])) == 0
            }

            task_explanations.append(explanation)

        # Calculate parallelization potential
        independent_tasks = sum(
            1 for e in task_explanations if e["can_parallelize"]
        )

        sequential_estimate = sum(e["estimated_time"] for e in task_explanations)

        # Estimate parallel time (rough approximation)
        if independent_tasks > 1:
            parallel_estimate = (
                max(e["estimated_time"] for e in task_explanations if e["can_parallelize"]) +
                sum(e["estimated_time"] for e in task_explanations if not e["can_parallelize"])
            )
        else:
            parallel_estimate = sequential_estimate

        potential_speedup = sequential_estimate / parallel_estimate if parallel_estimate > 0 else 1.0

        return {
            "total_tasks": len(tasks),
            "independent_tasks": independent_tasks,
            "tasks_with_dependencies": len(tasks) - independent_tasks,
            "tasks": task_explanations,
            "sequential_time_estimate": sequential_estimate,
            "parallel_time_estimate": parallel_estimate,
            "potential_speedup": potential_speedup,
            "max_concurrent": self.max_concurrent
        }
