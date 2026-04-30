"""
Phase 4a: Chaining Executor

Sequential task execution with context passing.
Based on agent orchestration patterns from arXiv:2506.12508.
"""

import asyncio
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime
from ..providers.registry import MultiProviderExecutor
from ..skills.skill_manager import SkillManager


class ChainingExecutor:
    """
    Execute tasks sequentially with context passing between steps.

    Based on agent orchestration patterns (arXiv:2506.12508)

    Features:
    - Sequential step execution
    - Context passing between steps
    - Conditional branching
    - Error handling and rollback
    - Progress tracking
    """

    def __init__(
        self,
        provider_executor: Optional[MultiProviderExecutor] = None,
        skill_manager: Optional[SkillManager] = None
    ):
        """
        Initialize chaining executor.

        Args:
            provider_executor: Multi-provider executor for LLM calls
            skill_manager: Skill manager for loading skills
        """
        self.provider_executor = provider_executor
        self.skill_manager = skill_manager

    async def execute_chain(
        self,
        steps: List[Dict[str, Any]],
        initial_context: Optional[Dict[str, Any]] = None,
        continue_on_error: bool = False
    ) -> Dict[str, Any]:
        """
        Execute a chain of tasks sequentially.

        Args:
            steps: List of step definitions
            initial_context: Initial context to pass to first step
            continue_on_error: Whether to continue if a step fails

        Returns:
            Execution result with final context and step results
        """
        context = initial_context or {}
        step_results = []

        start_time = datetime.now()

        for i, step in enumerate(steps):
            step_number = i + 1
            step_start = datetime.now()

            print(f"\n🔗 Executing Step {step_number}/{len(steps)}: {step.get('name', 'Unnamed')}")

            # Check if step should execute (condition)
            if "condition" in step:
                if not self._evaluate_condition(step["condition"], context):
                    print(f"   ⏭️  Skipped (condition not met)")
                    step_results.append({
                        "step": step_number,
                        "name": step.get("name", "Unnamed"),
                        "status": "skipped",
                        "condition": step["condition"]
                    })
                    continue

            # Execute step
            try:
                step_result = await self._execute_step(step, context)

                step_end = datetime.now()
                execution_time = (step_end - step_start).total_seconds()

                # Update context with step output
                if "output_key" in step:
                    context[step["output_key"]] = step_result.get("result")

                # Add to context with step name
                if "name" in step:
                    context[f"step_{step.get('name')}"] = step_result.get("result")

                result_entry = {
                    "step": step_number,
                    "name": step.get("name", "Unnamed"),
                    "status": "success",
                    "result": step_result.get("result"),
                    "execution_time": execution_time,
                    "timestamp": step_end.isoformat()
                }

                step_results.append(result_entry)

                print(f"   ✅ Success ({execution_time:.2f}s)")

            except Exception as e:
                step_end = datetime.now()
                execution_time = (step_end - step_start).total_seconds()

                error_result = {
                    "step": step_number,
                    "name": step.get("name", "Unnamed"),
                    "status": "error",
                    "error": str(e),
                    "execution_time": execution_time,
                    "timestamp": step_end.isoformat()
                }

                step_results.append(error_result)

                print(f"   ❌ Error: {e}")

                # Decide whether to continue
                if not continue_on_error:
                    print(f"\n🛑 Stopping chain execution due to error")
                    break
                else:
                    print(f"   ⚠️  Continuing despite error")

        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds()

        # Calculate success rate
        successful_steps = sum(
            1 for r in step_results if r["status"] == "success"
        )

        return {
            "success": all(r["status"] in ["success", "skipped"] for r in step_results),
            "total_steps": len(steps),
            "successful_steps": successful_steps,
            "failed_steps": len(steps) - successful_steps,
            "step_results": step_results,
            "final_context": context,
            "total_time": total_time,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat()
        }

    async def _execute_step(
        self,
        step: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a single step.

        Args:
            step: Step definition
            context: Current context

        Returns:
            Step result
        """
        step_type = step.get("type", "llm")

        if step_type == "llm":
            return await self._execute_llm_step(step, context)

        elif step_type == "function":
            return await self._execute_function_step(step, context)

        elif step_type == "parallel":
            return await self._execute_parallel_step(step, context)

        elif step_type == "conditional":
            return await self._execute_conditional_step(step, context)

        else:
            raise ValueError(f"Unknown step type: {step_type}")

    async def _execute_llm_step(
        self,
        step: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute LLM-based step"""
        if not self.provider_executor:
            raise ValueError("provider_executor required for LLM steps")

        # Build prompt with context
        prompt = self._build_prompt_with_context(step["prompt"], context)

        # Execute with provider
        response = await self.provider_executor.execute({
            "description": prompt,
            **step.get("execution_params", {})
        })

        return {
            "result": response.content if response.success else response.error,
            "success": response.success,
            "tokens_used": response.tokens_used,
            "cost": response.cost
        }

    async def _execute_function_step(
        self,
        step: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute function step"""
        if "function" not in step:
            raise ValueError("function step requires 'function' key")

        func = step["function"]

        # Prepare arguments
        args = step.get("args", [])
        kwargs = step.get("kwargs", {})

        # Replace context variables in kwargs
        kwargs = self._replace_context_variables(kwargs, context)

        # Execute function
        if asyncio.iscoroutinefunction(func):
            result = await func(*args, **kwargs)
        else:
            result = func(*args, **kwargs)

        return {
            "result": result,
            "success": True
        }

    async def _execute_parallel_step(
        self,
        step: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute parallel step (sub-chains)"""
        if "sub_steps" not in step:
            raise ValueError("parallel step requires 'sub_steps' key")

        # Create tasks for all sub-steps
        tasks = []
        for sub_step in step["sub_steps"]:
            task = self._execute_step(sub_step, context)
            tasks.append(task)

        # Execute in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    "sub_step": i + 1,
                    "status": "error",
                    "error": str(result)
                })
            else:
                processed_results.append({
                    "sub_step": i + 1,
                    "status": "success",
                    **result
                })

        return {
            "result": processed_results,
            "success": all(r["status"] == "success" for r in processed_results)
        }

    async def _execute_conditional_step(
        self,
        step: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute conditional step (if-else logic)"""
        if "branches" not in step:
            raise ValueError("conditional step requires 'branches' key")

        # Evaluate conditions
        for branch in step["branches"]:
            if "condition" not in branch or self._evaluate_condition(
                branch["condition"],
                context
            ):
                # Execute this branch
                return await self._execute_step(branch["step"], context)

        # No condition matched, execute default if present
        if "default" in step:
            return await self._execute_step(step["default"], context)

        return {
            "result": None,
            "success": True,
            "message": "No condition matched"
        }

    def _build_prompt_with_context(
        self,
        prompt_template: str,
        context: Dict[str, Any]
    ) -> str:
        """Build prompt by replacing context variables in template"""
        prompt = prompt_template

        # Replace {variable} with context values
        for key, value in context.items():
            placeholder = f"{{{key}}}"
            if placeholder in prompt:
                prompt = prompt.replace(placeholder, str(value))

        return prompt

    def _replace_context_variables(
        self,
        obj: Any,
        context: Dict[str, Any]
    ) -> Any:
        """Replace context variables in object"""
        if isinstance(obj, str):
            return self._build_prompt_with_context(obj, context)

        elif isinstance(obj, dict):
            return {
                k: self._replace_context_variables(v, context)
                for k, v in obj.items()
            }

        elif isinstance(obj, list):
            return [
                self._replace_context_variables(item, context)
                for item in obj
            ]

        else:
            return obj

    def _evaluate_condition(
        self,
        condition: Any,
        context: Dict[str, Any]
    ) -> bool:
        """
        Evaluate condition against context.

        Supports:
        - Boolean values
        - String comparisons
        - Lambda functions
        """
        if isinstance(condition, bool):
            return condition

        elif isinstance(condition, str):
            # Check if context variable exists and is truthy
            return context.get(condition, False)

        elif callable(condition):
            # Evaluate lambda function
            return condition(context)

        else:
            return bool(condition)

    def explain_chain(self, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Explain execution plan for a chain.

        Returns detailed information about how the chain will execute.
        """
        step_explanations = []

        for i, step in enumerate(steps):
            explanation = {
                "step": i + 1,
                "name": step.get("name", "Unnamed"),
                "type": step.get("type", "llm"),
                "description": step.get("description", ""),
                "conditional": "condition" in step,
                "output_key": step.get("output_key"),
                "estimated_difficulty": step.get("difficulty", "unknown")
            }

            step_explanations.append(explanation)

        return {
            "total_steps": len(steps),
            "steps": step_explanations,
            "requires_provider": any(
                s.get("type") == "llm" for s in steps
            ),
            "estimated_complexity": self._estimate_chain_complexity(steps)
        }

    def _estimate_chain_complexity(self, steps: List[Dict[str, Any]]) -> str:
        """Estimate overall chain complexity"""
        llm_steps = sum(1 for s in steps if s.get("type") == "llm")
        parallel_steps = sum(1 for s in steps if s.get("type") == "parallel")
        conditional_steps = sum(1 for s in steps if s.get("type") == "conditional")

        if llm_steps >= 5 or parallel_steps >= 2:
            return "complex"
        elif llm_steps >= 3 or conditional_steps >= 2:
            return "medium"
        else:
            return "simple"
