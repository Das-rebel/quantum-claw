"""
TML Enhanced Agent - Agent with Skill capabilities

Integrates SkillManager to provide agents with domain-specific expertise
following Anthropic's Agent Skills specification.
"""

from typing import Dict, List, Optional, Any
from pathlib import Path
import json
from datetime import datetime

from .skill_manager import SkillManager, Skill


class TMLEnhancedAgent:
    """
    Agent enhanced with Skill capabilities.

    Uses progressive disclosure to load relevant skills only when needed,
    following Anthropic's specification for Agent Skills.
    """

    def __init__(
        self,
        agent_id: str,
        provider: str,
        model: str,
        skills_dir: str = "tmlpd-skills",
        assigned_skills: Optional[List[str]] = None
    ):
        """
        Initialize TML Enhanced Agent

        Args:
            agent_id: Unique identifier for this agent
            provider: LLM provider (e.g., 'anthropic', 'openai')
            model: Model name (e.g., 'claude-sonnet-4', 'gpt-4-turbo')
            skills_dir: Directory containing skill definitions
            assigned_skills: List of skill names assigned to this agent
        """
        self.agent_id = agent_id
        self.provider = provider
        self.model = model
        self.assigned_skills = assigned_skills or []

        # Initialize skill manager
        self.skill_manager = SkillManager(skills_dir)

        # Load metadata for assigned skills
        for skill_name in self.assigned_skills:
            if skill_name in self.skill_manager.skills:
                # Metadata already loaded by SkillManager
                pass

    def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a task using relevant skills for context.

        Args:
            task: Task dictionary with 'description' and other metadata

        Returns:
            Result dictionary with task output
        """
        task_description = task.get("description", "")

        # Step 1: Find relevant skills
        relevant_skills = self._get_relevant_skills(task_description)

        # Step 2: Build enhanced prompt with skill context
        enhanced_prompt = self._build_prompt_with_skills(
            task_description,
            relevant_skills,
            task
        )

        # Step 3: Execute LLM call with enhanced context
        result = self._execute_llm_call(enhanced_prompt)

        # Step 4: Store successful pattern in memory (if enabled)
        if result.get("success"):
            self._remember_success_pattern(task, result)

        return result

    def _get_relevant_skills(
        self,
        task_description: str,
        top_k: int = 3
    ) -> List[Skill]:
        """
        Get relevant skills for this task.

        Args:
            task_description: Task to find skills for
            top_k: Maximum number of skills to load

        Returns:
            List of loaded Skill objects
        """
        # If agent has assigned skills, only consider those
        if self.assigned_skills:
            skill_names = self.assigned_skills[:top_k]
        else:
            # Otherwise, use skill discovery
            skill_names = self.skill_manager.get_relevant_skills(
                task_description,
                top_k=top_k
            )

        # Load full skill content (Level 2: SKILL.md)
        loaded_skills = []

        for skill_name in skill_names:
            try:
                skill = self.skill_manager.load_skill(skill_name)
                loaded_skills.append(skill)
            except Exception as e:
                print(f"Warning: Failed to load skill '{skill_name}': {e}")
                continue

        return loaded_skills

    def _build_prompt_with_skills(
        self,
        task_description: str,
        skills: List[Skill],
        task: Dict[str, Any]
    ) -> str:
        """
        Build enhanced prompt with skill context.

        Args:
            task_description: Original task description
            skills: List of relevant loaded skills
            task: Original task metadata

        Returns:
            Enhanced prompt with skill context
        """
        parts = []

        # Add task context
        parts.append(f"# Task\n{task_description}\n")

        # Add additional task metadata
        if "context" in task:
            parts.append(f"## Context\n{task['context']}\n")

        if "requirements" in task:
            parts.append(f"## Requirements\n{task['requirements']}\n")

        # Add skill contexts
        if skills:
            parts.append("## Relevant Skills\n")
            parts.append(f"The following skills provide expert guidance for this task:\n")

            for skill in skills:
                parts.append(f"\n### {skill.name}\n")
                parts.append(f"{skill.content}\n")

        # Add agent information
        parts.append(f"\n## Agent Configuration\n")
        parts.append(f"- Agent: {self.agent_id}\n")
        parts.append(f"- Provider: {self.provider}\n")
        parts.append(f"- Model: {self.model}\n")

        # Add execution instruction
        parts.append("\n## Instructions\n")
        parts.append("Please complete the task following the guidance from the relevant skills above. ")
        parts.append("Use best practices and patterns recommended by the skills.")

        return "\n".join(parts)

    def _execute_llm_call(self, prompt: str) -> Dict[str, Any]:
        """
        Execute LLM call with the enhanced prompt.

        Args:
            prompt: Enhanced prompt with skill context

        Returns:
            Result dictionary with response, tokens, cost, etc.
        """
        # This is a placeholder - in production, you would call
        # the actual LLM API based on self.provider and self.model

        # Simulated response
        return {
            "success": True,
            "output": f"Simulated response from {self.provider}:{self.model}",
            "tokens_used": 100,
            "cost": 0.01,
            "execution_time": 2.5,
            "timestamp": datetime.now().isoformat()
        }

    def _remember_success_pattern(self, task: Dict, result: Dict):
        """
        Remember a successful execution pattern.

        In production, this would save to:
        - SimpleProjectMemory for project-level learning
        - Or episodic memory for pattern discovery

        Args:
            task: Task that was executed
            result: Successful result
        """
        pattern = {
            "task_description": task.get("description"),
            "agent_id": self.agent_id,
            "model": self.model,
            "tokens": result.get("tokens_used"),
            "cost": result.get("cost"),
            "execution_time": result.get("execution_time"),
            "timestamp": datetime.now().isoformat()
        }

        # Store pattern (implementation depends on memory system)
        # For now, just log it
        print(f"Pattern learned: {task.get('description')[:50]}...")

    def get_assigned_skills(self) -> List[str]:
        """Get list of skills assigned to this agent"""
        return self.assigned_skills.copy()

    def add_skill(self, skill_name: str):
        """
        Assign a skill to this agent.

        Args:
            skill_name: Name of the skill to assign
        """
        if skill_name not in self.assigned_skills:
            self.assigned_skills.append(skill_name)

    def remove_skill(self, skill_name: str):
        """
        Remove a skill from this agent.

        Args:
            skill_name: Name of the skill to remove
        """
        if skill_name in self.assigned_skills:
            self.assigned_skills.remove(skill_name)

    def list_available_skills(self) -> List[str]:
        """List all available skills from skill manager"""
        return self.skill_manager.list_skills()

    def get_skill_info(self, skill_name: str) -> Optional[Dict]:
        """Get information about a specific skill"""
        return self.skill_manager.get_skill_info(skill_name)

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert agent to dictionary representation.

        Returns:
            Dictionary with agent configuration
        """
        return {
            "agent_id": self.agent_id,
            "provider": self.provider,
            "model": self.model,
            "assigned_skills": self.assigned_skills,
            "available_skills": self.list_available_skills()
        }


class TMLEnhancedAgentFactory:
    """
    Factory for creating TML Enhanced Agents with proper configuration.
    """

    @staticmethod
    def create_from_config(config: Dict[str, Any]) -> TMLEnhancedAgent:
        """
        Create agent from configuration dictionary.

        Args:
            config: Configuration dictionary with keys:
                - id: Agent ID
                - provider: LLM provider
                - model: Model name
                - skills_dir: Skills directory
                - skills: List of assigned skill names

        Returns:
            Configured TMLEnhancedAgent instance
        """
        return TMLEnhancedAgent(
            agent_id=config["id"],
            provider=config["provider"],
            model=config["model"],
            skills_dir=config.get("skills_dir", "tmlpd-skills"),
            assigned_skills=config.get("skills", [])
        )

    @staticmethod
    def create_multiple_from_config(
        agents_config: List[Dict[str, Any]]
    ) -> List[TMLEnhancedAgent]:
        """
        Create multiple agents from configuration list.

        Args:
            agents_config: List of agent configuration dictionaries

        Returns:
            List of configured TMLEnhancedAgent instances
        """
        return [
            TMLEnhancedAgentFactory.create_from_config(agent_config)
            for agent_config in agents_config
        ]
