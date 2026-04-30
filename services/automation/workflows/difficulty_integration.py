"""
Phase 2a: Difficulty-Aware Routing Integration

Integrates difficulty-aware routing with existing skill system.
Combines multi-provider selection with skill-based context.
"""

from typing import Dict, List, Any, Optional
from ..providers.registry import MultiProviderExecutor, IntelligentRouter
from ..skills.skill_manager import SkillManager
from ..agents.skill_enhanced_agent import TMLEnhancedAgent


class DifficultyAwareSkillAgent:
    """
    Agent that combines difficulty-aware routing with skills.

    Process:
    1. Classify task difficulty
    2. Route to optimal provider
    3. Load relevant skills
    4. Execute with enhanced context
    """

    DIFFICULTY_LEVELS = {
        "TRIVIAL": range(0, 20),
        "SIMPLE": range(20, 40),
        "MEDIUM": range(40, 60),
        "COMPLEX": range(60, 80),
        "EXPERT": range(80, 100)
    }

    def __init__(
        self,
        skills_dir: str = "tmlpd-skills",
        provider_config: Optional[str] = None
    ):
        self.skill_manager = SkillManager(skills_dir)
        self.provider_executor = MultiProviderExecutor(provider_config)
        self.router = IntelligentRouter(self.provider_executor.registry)

    async def execute(
        self,
        task: Dict[str, Any],
        difficulty_override: Optional[str] = None,
        provider_override: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute task with difficulty-aware routing and skills.

        Args:
            task: Task to execute
            difficulty_override: Force specific difficulty level
            provider_override: Force specific provider
            **kwargs: Additional execution parameters

        Returns:
            Execution result with metadata
        """
        # Step 1: Classify difficulty
        difficulty = difficulty_override or self.router.classify_difficulty(task)

        # Step 2: Get relevant skills
        relevant_skills = self.skill_manager.get_relevant_skills(
            task.get("description", ""),
            top_k=3
        )

        # Step 3: Get provider (with override support)
        if provider_override:
            provider = self.provider_executor.registry.get_provider(provider_override)
        else:
            provider = self.router.route(task, difficulty_override=difficulty)

        if not provider:
            return {
                "success": False,
                "error": "No healthy providers available",
                "difficulty": difficulty,
                "skills": relevant_skills
            }

        # Step 4: Build enhanced prompt with skills
        enhanced_prompt = self._build_prompt_with_skills(
            task,
            relevant_skills,
            difficulty
        )

        # Step 5: Execute with provider
        from datetime import datetime
        start_time = datetime.now()

        try:
            provider_response = await provider.execute_with_retry(
                enhanced_prompt,
                **kwargs
            )

            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()

            return {
                "success": provider_response.success,
                "content": provider_response.content,
                "tokens_used": provider_response.tokens_used,
                "cost": provider_response.cost,
                "latency_ms": provider_response.latency_ms,
                "execution_time": execution_time,
                "provider": provider_response.provider,
                "model": provider_response.model,
                "difficulty": difficulty,
                "skills_used": relevant_skills,
                "timestamp": provider_response.timestamp
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "difficulty": difficulty,
                "skills": relevant_skills
            }

    def _build_prompt_with_skills(
        self,
        task: Dict[str, Any],
        skills: List[str],
        difficulty: str
    ) -> str:
        """Build enhanced prompt with skill context"""
        parts = []

        # Add task context
        parts.append(f"# Task (Difficulty: {difficulty})")
        parts.append(f"{task.get('description', '')}\n")

        # Add context and requirements
        if "context" in task:
            parts.append(f"## Context\n{task['context']}\n")

        if "requirements" in task:
            parts.append(f"## Requirements\n{task['requirements']}\n")

        # Add skill contexts
        if skills:
            parts.append("## Relevant Skills\n")
            parts.append("The following skills provide expert guidance:\n")

            for skill_name in skills:
                try:
                    skill = self.skill_manager.load_skill(skill_name)
                    parts.append(f"\n### {skill.name}\n")
                    parts.append(f"{skill.content}\n")
                except Exception as e:
                    parts.append(f"\n### {skill_name}\n")
                    parts.append(f"(Error loading skill: {e})\n")

        # Add execution guidance
        parts.append(f"\n## Instructions\n")
        parts.append(
            f"Complete this {difficulty.lower()} task following the guidance "
            "from the relevant skills above. Use best practices and patterns "
            "recommended by the skills."
        )

        return "\n".join(parts)

    def explain_execution_plan(
        self,
        task: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Explain the execution plan for transparency.

        Returns detailed information about how a task will be executed.
        """
        # Classify difficulty
        difficulty = self.router.classify_difficulty(task)

        # Get routing info
        routing = self.router.explain_routing(task)

        # Get relevant skills
        skills = self.skill_manager.get_relevant_skills(
            task.get("description", ""),
            top_k=3
        )

        return {
            "task": task.get("description", ""),
            "difficulty": difficulty,
            "provider_selection": routing,
            "skills": skills,
            "reasoning": (
                f"Task classified as '{difficulty}' difficulty. "
                f"Will use {routing['selected_provider']} ({routing['selected_model']}) "
                f"with {len(skills)} relevant skills."
            )
        }

    async def start(self):
        """Start background services"""
        await self.provider_executor.start()

    async def stop(self):
        """Stop background services"""
        await self.provider_executor.stop()
