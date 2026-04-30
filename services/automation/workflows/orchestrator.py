"""
Orchestrator-Workers Workflow - Workflow Phase 5 (Optional)

Implements dynamic task breakdown and delegation for complex multi-step tasks.
Only for the 5% case where simple workflows aren't sufficient.

When to use:
- Truly unpredictable tasks
- Tasks requiring dynamic subtask creation
- Complex multi-step reasoning
- Tasks with unknown dependencies

Philosophy:
- Use sparingly (only 5% of cases)
- Dynamic task breakdown via LLM
- Skill delegation for subtasks
- Result synthesis
"""

from typing import Dict, List, Any, Optional
from pathlib import Path
import json
from datetime import datetime
import asyncio

from ..skills.skill_manager import SkillManager
from ..agents.skill_enhanced_agent import TMLEnhancedAgent
from ..memory.simple_memory import SimpleProjectMemory
from ..state.simple_checkpoint import SimpleCheckpoint


class OrchestratorWorkflow:
    """
    Orchestrator-Workers workflow for complex tasks.

    Process:
    1. Receive complex task
    2. Use LLM to break down into subtasks
    3. Delegate subtasks to specialized agents
    4. Synthesize results
    5. Return final result
    """

    def __init__(
        self,
        skills_dir: str = "tmlpd-skills",
        memory_file: str = ".taskmaster/memory.json",
        checkpoint_dir: str = ".taskmaster/checkpoints"
    ):
        """
        Initialize Orchestrator Workflow

        Args:
            skills_dir: Directory containing skill definitions
            memory_file: Path to memory file
            checkpoint_dir: Path to checkpoint directory
        """
        self.skill_manager = SkillManager(skills_dir)
        self.memory = SimpleProjectMemory(memory_file)
        self.checkpoint = SimpleCheckpoint(checkpoint_dir)

        self.stats = {
            "tasks_orchestrated": 0,
            "subtasks_created": 0,
            "subtasks_completed": 0,
            "subtasks_failed": 0
        }

    async def execute_task(
        self,
        task: Dict[str, Any],
        max_iterations: int = 10,
        enable_checkpointing: bool = True
    ) -> Dict[str, Any]:
        """
        Execute a complex task using orchestrator-workers pattern.

        Args:
            task: Complex task to execute
            max_iterations: Maximum subtask iterations
            enable_checkpointing: Whether to save checkpoints

        Returns:
            Final execution result
        """
        task_id = f"orchestrator_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.stats["tasks_orchestrated"] += 1

        # Initial checkpoint
        if enable_checkpointing:
            self.checkpoint.create_checkpoint(
                state={"task": task, "status": "started"},
                name=f"{task_id}_initial"
            )

        try:
            # Step 1: Break down task into subtasks
            subtasks = await self._break_down_task(task)

            # Checkpoint after breakdown
            if enable_checkpointing:
                self.checkpoint.create_checkpoint(
                    state={"subtasks": subtasks, "status": "broken_down"},
                    name=f"{task_id}_broken_down"
                )

            # Step 2: Execute subtasks
            results = []
            for i, subtask in enumerate(subtasks[:max_iterations]):
                self.stats["subtasks_created"] += 1

                # Checkpoint before subtask
                if enable_checkpointing:
                    self.checkpoint.create_checkpoint(
                        state={
                            "current_subtask": i,
                            "subtask": subtask,
                            "results_so_far": results
                        },
                        name=f"{task_id}_before_subtask_{i}"
                    )

                # Execute subtask
                try:
                    result = await self._execute_subtask(subtask)
                    results.append({
                        "subtask": subtask,
                        "result": result,
                        "status": "completed"
                    })
                    self.stats["subtasks_completed"] += 1

                except Exception as e:
                    results.append({
                        "subtask": subtask,
                        "error": str(e),
                        "status": "failed"
                    })
                    self.stats["subtasks_failed"] += 1

            # Checkpoint after all subtasks
            if enable_checkpointing:
                self.checkpoint.create_checkpoint(
                    state={"results": results, "status": "subtasks_complete"},
                    name=f"{task_id}_subtasks_complete"
                )

            # Step 3: Synthesize results
            final_result = await self._synthesize_results(task, results)

            # Final checkpoint
            if enable_checkpointing:
                self.checkpoint.create_checkpoint(
                    state={"final_result": final_result, "status": "complete"},
                    name=f"{task_id}_final"
                )

            return final_result

        except Exception as e:
            # Error checkpoint
            if enable_checkpointing:
                self.checkpoint.create_checkpoint(
                    state={"error": str(e), "status": "failed"},
                    name=f"{task_id}_error"
                )

            raise

    async def _break_down_task(
        self,
        task: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Break down complex task into subtasks using LLM.

        Args:
            task: Complex task

        Returns:
            List of subtasks
        """
        # This would normally use an LLM to break down the task
        # For now, return a simple structure

        description = task.get("description", "")

        # Use a simple heuristic-based breakdown
        # In production, this would call an LLM

        subtasks = []

        # Check for multi-step keywords
        if " then " in description.lower():
            parts = description.split(" then ")
            for i, part in enumerate(parts):
                subtasks.append({
                    "id": f"subtask_{i}",
                    "description": part.strip(),
                    "requirements": task.get("requirements", ""),
                    "context": task.get("context", "")
                })
        else:
            # Single task
            subtasks.append({
                "id": "subtask_0",
                "description": description,
                "requirements": task.get("requirements", ""),
                "context": task.get("context", "")
            })

        return subtasks

    async def _execute_subtask(
        self,
        subtask: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a single subtask.

        Args:
            subtask: Subtask to execute

        Returns:
            Subtask result
        """
        # Find relevant skills
        relevant_skills = self.skill_manager.get_relevant_skills(
            subtask["description"],
            top_k=3
        )

        # Check memory for similar patterns
        best_agent = self.memory.get_best_agent_for_task(subtask)

        if best_agent:
            # Use best agent from memory
            agent = TMLEnhancedAgent(
                agent_id=best_agent["agent_id"],
                provider="anthropic",
                model="claude-sonnet-4",
                assigned_skills=best_agent["skills"]
            )
        else:
            # Create agent with relevant skills
            agent = TMLEnhancedAgent(
                agent_id="orchestrator-worker",
                provider="anthropic",
                model="claude-sonnet-4",
                assigned_skills=relevant_skills
            )

        # Execute subtask
        result = agent.execute_task(subtask)

        # Remember successful pattern
        if result.get("success"):
            self.memory.remember_pattern(
                task=subtask,
                result=result,
                agent_id=agent.agent_id,
                skills_used=relevant_skills
            )

        return result

    async def _synthesize_results(
        self,
        original_task: Dict[str, Any],
        subtask_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Synthesize subtask results into final result.

        Args:
            original_task: Original complex task
            subtask_results: Results from subtasks

        Returns:
            Synthesized final result
        """
        # Check if any subtasks failed
        failed = [r for r in subtask_results if r["status"] == "failed"]

        if failed:
            return {
                "success": False,
                "error": f"{len(failed)} subtasks failed",
                "failed_subtasks": failed,
                "completed_subtasks": len(subtask_results) - len(failed)
            }

        # Combine results
        all_successful = all(r["result"].get("success", False) for r in subtask_results)

        if not all_successful:
            return {
                "success": False,
                "error": "Some subtasks did not complete successfully",
                "subtask_results": subtask_results
            }

        # Combine outputs
        outputs = [r["result"].get("output", "") for r in subtask_results]

        return {
            "success": True,
            "output": "\n\n".join(outputs),
            "subtask_count": len(subtask_results),
            "original_task": original_task.get("description"),
            "subtask_results": subtask_results
        }

    def get_stats(self) -> Dict[str, Any]:
        """
        Get orchestrator statistics.

        Returns:
            Statistics dictionary
        """
        total_subtasks = (
            self.stats["subtasks_completed"] +
            self.stats["subtasks_failed"]
        )

        success_rate = (
            self.stats["subtasks_completed"] / total_subtasks
            if total_subtasks > 0
            else 0
        )

        return {
            **self.stats,
            "total_subtasks": total_subtasks,
            "success_rate": success_rate
        }


class OrchestratorAgent:
    """
    Convenience class for creating an orchestrator-enhanced agent.

    Combines orchestrator workflow with memory and checkpointing.
    """

    def __init__(
        self,
        agent_id: str,
        provider: str,
        model: str,
        skills_dir: str = "tmlpd-skills",
        enable_orchestrator: bool = True,
        enable_memory: bool = True,
        enable_checkpointing: bool = True
    ):
        """
        Initialize Orchestrator Agent

        Args:
            agent_id: Unique agent identifier
            provider: LLM provider
            model: Model name
            skills_dir: Skills directory
            enable_orchestrator: Enable orchestrator workflow
            enable_memory: Enable memory system
            enable_checkpointing: Enable checkpointing
        """
        self.agent_id = agent_id
        self.provider = provider
        self.model = model

        self.skill_manager = SkillManager(skills_dir)

        self.base_agent = TMLEnhancedAgent(
            agent_id=agent_id,
            provider=provider,
            model=model,
            skills_dir=skills_dir
        )

        self.orchestrator = None
        if enable_orchestrator:
            self.orchestrator = OrchestratorWorkflow(
                skills_dir=skills_dir,
                memory_file=".taskmaster/memory.json",
                checkpoint_dir=".taskmaster/checkpoints"
            )

        self.enable_memory = enable_memory
        self.enable_checkpointing = enable_checkpointing

    async def execute_task(
        self,
        task: Dict[str, Any],
        force_orchestrator: bool = False
    ) -> Dict[str, Any]:
        """
        Execute task, using orchestrator if complex.

        Args:
            task: Task to execute
            force_orchestrator: Force use of orchestrator

        Returns:
            Execution result
        """
        # Decide whether to use orchestrator
        use_orchestrator = force_orchestrator

        if not use_orchestrator and self.orchestrator:
            # Simple heuristic: use orchestrator for long tasks
            description = task.get("description", "")
            use_orchestrator = len(description.split()) > 50

        if use_orchestrator and self.orchestrator:
            # Use orchestrator workflow
            return await self.orchestrator.execute_task(
                task,
                enable_checkpointing=self.enable_checkpointing
            )
        else:
            # Use base agent
            result = self.base_agent.execute_task(task)

            # Remember pattern if memory enabled
            if self.enable_memory and result.get("success"):
                skills = self.base_agent.get_assigned_skills()
                self.orchestrator.memory.remember_pattern(
                    task=task,
                    result=result,
                    agent_id=self.agent_id,
                    skills_used=skills
                )

            return result

    def get_stats(self) -> Dict[str, Any]:
        """Get agent statistics"""
        stats = {
            "agent_id": self.agent_id,
            "provider": self.provider,
            "model": self.model,
            "assigned_skills": self.base_agent.get_assigned_skills()
        }

        if self.orchestrator:
            stats["orchestrator_stats"] = self.orchestrator.get_stats()

        return stats


# Convenience function for quick orchestrator execution

async def orchestrate_task(
    task: Dict[str, Any],
    skills_dir: str = "tmlpd-skills"
) -> Dict[str, Any]:
    """
    Quick function to orchestrate a complex task.

    Args:
        task: Complex task to orchestrate
        skills_dir: Skills directory

    Returns:
        Final result
    """
    orchestrator = OrchestratorWorkflow(skills_dir=skills_dir)
    return await orchestrator.execute_task(task)
