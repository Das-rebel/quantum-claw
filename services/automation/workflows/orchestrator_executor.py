"""
Phase 4c: Orchestrator Executor

Hierarchical task breakdown and delegation.
Based on agent orchestration patterns from arXiv:2506.12508 and arXiv:2509.11079.
"""

import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime
from ..providers.registry import MultiProviderExecutor
from ..skills.skill_manager import SkillManager
from .chaining_executor import ChainingExecutor
from .parallelization_executor import ParallelizationExecutor
from .advanced_difficulty_classifier import AdvancedDifficultyClassifier


class OrchestratorExecutor:
    """
    Hierarchical task breakdown and intelligent delegation.

    Based on agent orchestration patterns (arXiv:2506.12508)
    and difficulty-aware routing (arXiv:2509.11079)

    Features:
    - Automatic task decomposition
    - Intelligent delegation (chain vs parallel)
    - Sub-task coordination
    - Progress tracking
    - Adaptive execution strategy
    """

    def __init__(
        self,
        provider_executor: Optional[MultiProviderExecutor] = None,
        skill_manager: Optional[SkillManager] = None
    ):
        """
        Initialize orchestrator executor.

        Args:
            provider_executor: Multi-provider executor for LLM calls
            skill_manager: Skill manager for loading skills
        """
        self.provider_executor = provider_executor
        self.skill_manager = skill_manager
        self.difficulty_classifier = AdvancedDifficultyClassifier()

        # Create sub-executors
        self.chaining_executor = ChainingExecutor(provider_executor, skill_manager)
        self.parallel_executor = ParallelizationExecutor(provider_executor, skill_manager)

    async def execute(
        self,
        task: Dict[str, Any],
        strategy: str = "auto",
        max_depth: int = 3
    ) -> Dict[str, Any]:
        """
        Execute task with hierarchical breakdown and delegation.

        Args:
            task: Task to execute
            strategy: Execution strategy ("auto", "decompose", "direct", "parallel", "chain")
            max_depth: Maximum decomposition depth

        Returns:
            Execution result
        """
        start_time = datetime.now()

        print(f"\n🎯 Orchestrator: Executing task")
        print(f"   Description: {task.get('description', 'No description')[:100]}...")

        # Step 1: Classify task
        classification = self.difficulty_classifier.classify_difficulty(task)

        print(f"   Difficulty: {classification['difficulty']} (score: {classification['score']:.1f})")
        print(f"   Confidence: {classification['confidence']*100:.0f}%")

        # Step 2: Determine execution strategy
        if strategy == "auto":
            strategy = self._determine_strategy(classification, task)

        print(f"   Strategy: {strategy}")

        # Step 3: Execute based on strategy
        if strategy == "direct":
            result = await self._execute_direct(task)

        elif strategy == "decompose":
            result = await self._execute_with_decomposition(task, max_depth)

        elif strategy == "chain":
            result = await self._execute_chain(task)

        elif strategy == "parallel":
            result = await self._execute_parallel(task)

        else:
            raise ValueError(f"Unknown strategy: {strategy}")

        end_time = datetime.now()
        execution_time = (end_time - start_time).total_seconds()

        # Add metadata
        result["orchestrator_metadata"] = {
            "difficulty": classification["difficulty"],
            "difficulty_score": classification["score"],
            "strategy": strategy,
            "execution_time": execution_time,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat()
        }

        return result

    def _determine_strategy(
        self,
        classification: Dict[str, Any],
        task: Dict[str, Any]
    ) -> str:
        """
        Determine optimal execution strategy.

        Based on difficulty, task type, and requirements.
        """
        difficulty = classification["difficulty"]

        # TRIVIAL tasks: direct execution
        if difficulty == "TRIVIAL":
            return "direct"

        # SIMPLE tasks: direct or chain if multi-step
        elif difficulty == "SIMPLE":
            # Check if multi-step
            if classification["breakdown"]["multi_step"] > 5:
                return "chain"
            return "direct"

        # MEDIUM tasks: decompose or chain
        elif difficulty == "MEDIUM":
            # Check for explicit dependencies
            if "depends_on" in task or "dependencies" in task:
                return "chain"
            return "decompose"

        # COMPLEX tasks: decompose
        elif difficulty == "COMPLEX":
            # Check for parallelizable sub-tasks
            description = task.get("description", "").lower()
            parallel_keywords = ["simultaneously", "concurrent", "parallel", "multiple"]
            if any(kw in description for kw in parallel_keywords):
                return "parallel"
            return "decompose"

        # EXPERT tasks: always decompose
        else:
            return "decompose"

    async def _execute_direct(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task directly without decomposition"""
        print("   ⚡ Direct execution (no decomposition)")

        if not self.provider_executor:
            raise ValueError("provider_executor required for direct execution")

        response = await self.provider_executor.execute(task)

        return {
            "success": response.success,
            "result": response.content if response.success else response.error,
            "tokens_used": response.tokens_used,
            "cost": response.cost,
            "provider": response.provider,
            "model": response.model,
            "decomposition": "none"
        }

    async def _execute_with_decomposition(
        self,
        task: Dict[str, Any],
        max_depth: int
    ) -> Dict[str, Any]:
        """Execute task with hierarchical decomposition"""
        print(f"   🧩 Decomposing task (max depth: {max_depth})")

        # Use LLM to decompose task
        sub_tasks = await self._decompose_task(task, max_depth)

        if not sub_tasks:
            # Fall back to direct execution
            print("   ⚠️  No sub-tasks generated, falling back to direct execution")
            return await self._execute_direct(task)

        print(f"   ✅ Generated {len(sub_tasks)} sub-tasks")

        # Determine if sub-tasks can run in parallel
        can_parallelize = self._can_parallelize(sub_tasks)

        if can_parallelize:
            print("   🚀 Executing sub-tasks in parallel")
            result = await self.parallel_executor.execute_parallel(sub_tasks)
        else:
            print("   🔗 Executing sub-tasks in chain")
            # Convert sub-tasks to chain steps
            steps = [
                {
                    "name": t.get("id", f"step_{i+1}"),
                    "type": "llm",
                    "prompt": t["description"],
                    "execution_params": t
                }
                for i, t in enumerate(sub_tasks)
            ]
            result = await self.chaining_executor.execute_chain(steps)

        result["decomposition"] = "hierarchical"
        result["sub_tasks_count"] = len(sub_tasks)
        result["parallelized": can_parallelize] = can_parallelize

        return result

    async def _decompose_task(
        self,
        task: Dict[str, Any],
        max_depth: int
    ) -> List[Dict[str, Any]]:
        """
        Decompose task into sub-tasks using LLM.

        Args:
            task: Task to decompose
            max_depth: Maximum decomposition depth

        Returns:
            List of sub-tasks
        """
        if not self.provider_executor:
            raise ValueError("provider_executor required for decomposition")

        # Build decomposition prompt
        prompt = f"""Decompose the following task into 3-7 sub-tasks.

Task: {task.get('description', '')}

Requirements:
{task.get('requirements', 'N/A')}

Context:
{task.get('context', 'N/A')}

Please break this down into specific, actionable sub-tasks. Format your response as a JSON array:

[
  {{
    "id": "subtask_1",
    "description": "Brief description of what to do",
    "estimated_difficulty": "TRIVIAL|SIMPLE|MEDIUM|COMPLEX|EXPERT",
    "depends_on": []  // IDs of sub-tasks this depends on
  }}
]

Ensure sub-tasks are:
- Specific and actionable
- Ordered logically (dependencies in 'depends_on')
- Roughly equal in complexity
- Independent where possible (few dependencies)
"""

        response = await self.provider_executor.execute({
            "description": prompt
        })

        if not response.success:
            print(f"   ❌ Decomposition failed: {response.error}")
            return []

        # Parse sub-tasks from response
        import json
        try:
            # Extract JSON from response
            content = response.content.strip()

            # Try to find JSON array
            if "```json" in content:
                json_start = content.find("```json") + 7
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()
            elif "```" in content:
                json_start = content.find("```") + 3
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()

            sub_tasks = json.loads(content)

            # Validate and enhance
            valid_sub_tasks = []
            for i, sub_task in enumerate(sub_tasks):
                if "description" not in sub_task:
                    continue

                # Add defaults
                sub_task.setdefault("id", f"subtask_{i+1}")
                sub_task.setdefault("depends_on", [])
                sub_task.setdefault("estimated_difficulty", "MEDIUM")

                valid_sub_tasks.append(sub_task)

            return valid_sub_tasks

        except Exception as e:
            print(f"   ❌ Failed to parse sub-tasks: {e}")
            return []

    async def _execute_chain(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task as a chain"""
        print("   🔗 Chain execution")

        # Decompose into chain steps
        sub_tasks = await self._decompose_task(task, max_depth=1)

        if not sub_tasks:
            return await self._execute_direct(task)

        # Convert to chain steps
        steps = [
            {
                "name": t.get("id", f"step_{i+1}"),
                "type": "llm",
                "prompt": t["description"],
                "output_key": t.get("id"),
                "execution_params": t
            }
            for i, t in enumerate(sub_tasks)
        ]

        result = await self.chaining_executor.execute_chain(steps)

        result["decomposition"] = "chain"
        result["sub_tasks_count"] = len(sub_tasks)

        return result

    async def _execute_parallel(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task as parallel sub-tasks"""
        print("   🚀 Parallel execution")

        # Decompose into parallel tasks
        sub_tasks = await self._decompose_task(task, max_depth=1)

        if not sub_tasks:
            return await self._execute_direct(task)

        # Add type and convert format
        for sub_task in sub_tasks:
            sub_task["type"] = "llm"
            sub_task["prompt"] = sub_task["description"]
            sub_task.setdefault("id", f"task_{sub_tasks.index(sub_task)+1}")

        result = await self.parallel_executor.execute_parallel(sub_tasks)

        result["decomposition"] = "parallel"
        result["sub_tasks_count"] = len(sub_tasks)

        return result

    def _can_parallelize(self, sub_tasks: List[Dict[str, Any]]) -> bool:
        """
        Determine if sub-tasks can run in parallel.

        Checks for dependencies between sub-tasks.
        """
        # If any sub-task has dependencies, can't parallelize
        for sub_task in sub_tasks:
            if sub_task.get("depends_on"):
                return False

        # If no dependencies, can parallelize
        return len(sub_tasks) > 1

    def explain_plan(
        self,
        task: Dict[str, Any],
        strategy: str = "auto"
    ) -> Dict[str, Any]:
        """
        Explain execution plan without running.

        Returns detailed information about how the task will be executed.
        """
        # Classify task
        classification = self.difficulty_classifier.classify_difficulty(task)

        # Determine strategy
        if strategy == "auto":
            strategy = self._determine_strategy(classification, task)

        # Build explanation
        explanation = {
            "task": task.get("description", "")[:200],
            "classification": {
                "difficulty": classification["difficulty"],
                "score": classification["score"],
                "confidence": classification["confidence"],
                "breakdown": classification["breakdown"]
            },
            "strategy": strategy,
            "reasoning": self._explain_strategy_choice(strategy, classification),
            "expected_execution": {
                "decomposition": "none" if strategy == "direct" else "hierarchical",
                "parallelization_possible": strategy in ["parallel", "decompose"],
                "estimated_subtasks": self._estimate_subtasks(classification)
            }
        }

        return explanation

    def _explain_strategy_choice(
        self,
        strategy: str,
        classification: Dict[str, Any]
    ) -> str:
        """Explain why a strategy was chosen"""
        difficulty = classification["difficulty"]

        reasoning = f"Task is '{difficulty}' difficulty (score: {classification['score']:.1f}). "

        if strategy == "direct":
            reasoning += "Simple enough for direct execution without decomposition."

        elif strategy == "chain":
            reasoning += "Multi-step task requiring sequential execution."

        elif strategy == "parallel":
            reasoning += "Can be broken into independent sub-tasks for parallel execution."

        elif strategy == "decompose":
            reasoning += "Complex task requiring hierarchical breakdown and delegation."

        return reasoning

    def _estimate_subtasks(self, classification: Dict[str, Any]) -> int:
        """Estimate number of sub-tasks based on difficulty"""
        difficulty = classification["difficulty"]

        if difficulty == "TRIVIAL":
            return 1
        elif difficulty == "SIMPLE":
            return 2
        elif difficulty == "MEDIUM":
            return 3
        elif difficulty == "COMPLEX":
            return 5
        else:  # EXPERT
            return 7
