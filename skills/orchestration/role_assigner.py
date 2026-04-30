"""
RoleAssigner - Specialized Agent Assignment

Based on arXiv:2505.13516 (HALO) and arXiv:2506.12508v3 (AgentOrchestra)

This module implements Tier 2 of HALO orchestration:
- Analyzes subtask requirements
- Assigns specialized agents with appropriate capabilities
- Creates agent configurations for each subtask
- Optimizes agent selection for cost and quality
"""

import asyncio
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

from .task_planner import SubTask, TaskType


class AgentRole(Enum):
    """Specialized agent roles"""
    PLANNER = "planner"              # Strategic thinking, decomposition
    CODER = "coder"                  # Code generation, implementation
    ANALYST = "analyst"              # Data analysis, reasoning
    RESEARCHER = "researcher"        # Information gathering
    TESTER = "tester"                # Verification, validation
    DEPLOYER = "deployer"            # Infrastructure, deployment
    GENERALIST = "generalist"        # Jack-of-all-trades


class ModelCapability(Enum):
    """Model capabilities for routing"""
    CODE_GENERATION = "code_generation"
    TEXT_GENERATION = "text_generation"
    DATA_ANALYSIS = "data_analysis"
    REASONING = "reasoning"
    SPEED = "speed"
    COST_EFFICIENCY = "cost_efficiency"


@dataclass
class AgentConfig:
    """Configuration for an assigned agent"""
    agent_id: str
    role: AgentRole
    model_provider: str  # "anthropic", "openai", "cerebras", etc.
    model_name: str
    capabilities: List[str]
    cost_per_1k_tokens: float
    quality_score: float  # 0-1
    temperature: float = 0.7
    max_tokens: int = 4096

    def to_dict(self) -> Dict:
        return {
            "agent_id": self.agent_id,
            "role": self.role.value,
            "model_provider": self.model_provider,
            "model_name": self.model_name,
            "capabilities": self.capabilities,
            "cost_per_1k_tokens": self.cost_per_1k_tokens,
            "quality_score": self.quality_score,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens
        }


@dataclass
class AgentAssignment:
    """Result of agent assignment for a subtask"""
    subtask_id: str
    agent_config: AgentConfig
    confidence: float  # 0-1, how well-suited the agent is
    reasoning: str


class RoleAssigner:
    """
    Assign specialized agents to subtasks

    Implements Tier 2 of HALO orchestration:
    - Analyzes subtask requirements
    - Selects optimal agent for each subtask
    - Balances cost and quality
    - Creates agent configurations
    """

    def __init__(self):
        """Initialize role assigner with model registry"""
        self.model_registry = self._build_model_registry()
        self.agent_pool = []

    async def assign_roles(
        self,
        subtasks: List[SubTask],
        optimization_target: str = "quality"  # "quality", "cost", "balanced"
    ) -> Dict[str, AgentAssignment]:
        """
        Assign agents to all subtasks

        Args:
            subtasks: List of subtasks requiring agents
            optimization_target: "quality" (best model), "cost" (cheapest), "balanced"

        Returns:
            Dict mapping subtask_id -> AgentAssignment
        """
        assignments = {}

        for subtask in subtasks:
            assignment = await self._assign_agent(subtask, optimization_target)
            assignments[subtask.id] = assignment

        return assignments

    async def _assign_agent(
        self,
        subtask: SubTask,
        optimization_target: str
    ) -> AgentAssignment:
        """
        Assign optimal agent for a single subtask
        """
        # Step 1: Determine required role based on task type
        required_role = self._map_task_type_to_role(subtask.task_type)

        # Step 2: Get candidate models for this role
        candidates = self._get_candidates_for_role(
            required_role,
            subtask.required_capabilities
        )

        # Step 3: Score candidates based on optimization target
        scored_candidates = []
        for candidate in candidates:
            score = self._score_candidate(
                candidate,
                subtask,
                optimization_target
            )
            scored_candidates.append((candidate, score))

        # Step 4: Select best candidate
        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        best_model, best_score = scored_candidates[0]

        # Step 5: Create agent config
        agent_config = AgentConfig(
            agent_id=f"{required_role.value}_{subtask.id}",
            role=required_role,
            model_provider=best_model["provider"],
            model_name=best_model["model"],
            capabilities=best_model["capabilities"],
            cost_per_1k_tokens=best_model["cost_per_1k_tokens"],
            quality_score=best_model["quality_score"],
            temperature=self._determine_temperature(subtask),
            max_tokens=self._determine_max_tokens(subtask)
        )

        # Step 6: Calculate confidence
        confidence = min(1.0, best_score / 100.0)

        # Step 7: Generate reasoning
        reasoning = self._generate_reasoning(agent_config, subtask, best_score)

        return AgentAssignment(
            subtask_id=subtask.id,
            agent_config=agent_config,
            confidence=confidence,
            reasoning=reasoning
        )

    def _build_model_registry(self) -> Dict[str, List[Dict]]:
        """
        Build registry of available models with their capabilities

        Returns:
            Dict mapping role -> list of model configs
        """
        return {
            AgentRole.PLANNER: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["reasoning", "planning", "architecture"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.98
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["reasoning", "planning"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.95
                }
            ],
            AgentRole.CODER: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["code_generation", "reasoning"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.97
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["code_generation"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.94
                },
                {
                    "provider": "cerebras",
                    "model": "llama-3.3-70b",
                    "capabilities": ["code_generation", "speed"],
                    "cost_per_1k_tokens": 0.0001,
                    "quality_score": 0.75
                }
            ],
            AgentRole.ANALYST: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["data_analysis", "reasoning"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.96
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["data_analysis"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.93
                }
            ],
            AgentRole.RESEARCHER: [
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["text_generation", "reasoning"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.94
                },
                {
                    "provider": "perplexity",
                    "model": "sonar-small-online",
                    "capabilities": ["text_generation", "speed", "online"],
                    "cost_per_1k_tokens": 0.0002,
                    "quality_score": 0.80
                }
            ],
            AgentRole.TESTER: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["reasoning", "testing"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.95
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "capabilities": ["testing", "speed"],
                    "cost_per_1k_tokens": 0.00015,
                    "quality_score": 0.85
                }
            ],
            AgentRole.DEPLOYER: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["reasoning", "deployment"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.94
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["deployment"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.92
                }
            ],
            AgentRole.GENERALIST: [
                {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "capabilities": ["text_generation", "reasoning", "code_generation"],
                    "cost_per_1k_tokens": 0.003,
                    "quality_score": 0.96
                },
                {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "capabilities": ["text_generation", "code_generation"],
                    "cost_per_1k_tokens": 0.0025,
                    "quality_score": 0.93
                },
                {
                    "provider": "cerebras",
                    "model": "llama-3.3-70b",
                    "capabilities": ["speed", "cost_efficiency"],
                    "cost_per_1k_tokens": 0.0001,
                    "quality_score": 0.70
                }
            ]
        }

    def _map_task_type_to_role(self, task_type: TaskType) -> AgentRole:
        """Map task type to agent role"""
        mapping = {
            TaskType.PLANNING: AgentRole.PLANNER,
            TaskType.CODING: AgentRole.CODER,
            TaskType.ANALYSIS: AgentRole.ANALYST,
            TaskType.RESEARCH: AgentRole.RESEARCHER,
            TaskType.TESTING: AgentRole.TESTER,
            TaskType.DEPLOYMENT: AgentRole.DEPLOYER
        }
        return mapping.get(task_type, AgentRole.GENERALIST)

    def _get_candidates_for_role(
        self,
        role: AgentRole,
        required_capabilities: List[str]
    ) -> List[Dict]:
        """Get candidate models for a given role"""
        candidates = self.model_registry.get(role, [])

        # Filter by required capabilities
        if required_capabilities:
            filtered = []
            for candidate in candidates:
                if all(cap in candidate["capabilities"] for cap in required_capabilities):
                    filtered.append(candidate)
            candidates = filtered or self.model_registry.get(AgentRole.GENERALIST, [])

        return candidates

    def _score_candidate(
        self,
        candidate: Dict,
        subtask: SubTask,
        optimization_target: str
    ) -> float:
        """
        Score a candidate model for a subtask

        Returns:
            Score 0-100
        """
        # Base score from quality
        score = candidate["quality_score"] * 50

        # Adjust based on optimization target
        if optimization_target == "quality":
            # Prioritize quality score
            score += candidate["quality_score"] * 50
        elif optimization_target == "cost":
            # Prioritize low cost (invert cost score)
            cost_score = (1.0 / (candidate["cost_per_1k_tokens"] + 0.0001)) * 10
            score += cost_score
        else:  # "balanced"
            # Balance quality and cost
            cost_score = (1.0 / (candidate["cost_per_1k_tokens"] + 0.0001)) * 5
            score += (candidate["quality_score"] * 25) + cost_score

        # Adjust for difficulty matching
        if subtask.difficulty > 70 and candidate["quality_score"] > 0.9:
            score += 10  # Bonus: high-quality model for hard task
        elif subtask.difficulty < 40 and candidate["cost_per_1k_tokens"] < 0.001:
            score += 10  # Bonus: cheap model for easy task

        return min(100, score)

    def _determine_temperature(self, subtask: SubTask) -> float:
        """Determine optimal temperature for subtask"""
        if subtask.task_type in [TaskType.CODING, TaskType.DEPLOYMENT]:
            return 0.3  # Lower temperature for precise tasks
        elif subtask.task_type in [TaskType.RESEARCH, TaskType.ANALYSIS]:
            return 0.7  # Medium temperature for exploration
        else:
            return 0.5  # Balanced default

    def _determine_max_tokens(self, subtask: SubTask) -> int:
        """Determine max tokens for subtask"""
        if subtask.task_type == TaskType.CODING:
            return 8192  # Code generation needs more tokens
        elif subtask.task_type == TaskType.RESEARCH:
            return 4096  # Moderate for research
        else:
            return 2048  # Default

    def _generate_reasoning(
        self,
        agent_config: AgentConfig,
        subtask: SubTask,
        score: float
    ) -> str:
        """Generate human-readable reasoning for assignment"""
        return (
            f"Assigned {agent_config.model_provider}/{agent_config.model_name} "
            f"({agent_config.role.value}) to {subtask.id}. "
            f"Match score: {score:.1f}/100. "
            f"Quality: {agent_config.quality_score:.2f}, "
            f"Cost: ${agent_config.cost_per_1k_tokens:.4f}/1K tokens"
        )

    def get_assignment_stats(
        self,
        assignments: Dict[str, AgentAssignment]
    ) -> Dict[str, Any]:
        """Get statistics about agent assignments"""
        role_counts = {}
        provider_costs = {}

        for assignment in assignments.values():
            role = assignment.agent_config.role.value
            role_counts[role] = role_counts.get(role, 0) + 1

            provider = assignment.agent_config.model_provider
            cost = assignment.agent_config.cost_per_1k_tokens
            provider_costs[provider] = provider_costs.get(provider, 0) + cost

        return {
            "total_assignments": len(assignments),
            "role_distribution": role_counts,
            "estimated_total_cost_per_1k_tokens": provider_costs,
            "average_confidence": sum(
                a.confidence for a in assignments.values()
            ) / len(assignments) if assignments else 0
        }


# Example usage
async def main():
    """Example of RoleAssigner usage"""
    from .task_planner import TaskPlanner, TaskType

    # Create planner and assigner
    planner = TaskPlanner()
    assigner = RoleAssigner()

    # Create a complex task
    task = {
        "description": "Build a REST API with user authentication",
        "context": {"requirements": ["JWT", "PostgreSQL"]}
    }

    # Decompose task
    decomposition = await planner.decompose(task)

    # Assign agents
    assignments = await assigner.assign_roles(
        decomposition.subtasks,
        optimization_target="balanced"
    )

    print(f"Assigned {len(assignments)} agents:")
    for subtask_id, assignment in assignments.items():
        print(f"\n{subtask_id}:")
        print(f"  Agent: {assignment.agent_config.model_provider}/{assignment.agent_config.model_name}")
        print(f"  Role: {assignment.agent_config.role.value}")
        print(f"  Reasoning: {assignment.reasoning}")
        print(f"  Confidence: {assignment.confidence:.2f}")

    # Stats
    stats = assigner.get_assignment_stats(assignments)
    print(f"\nStats: {stats}")


if __name__ == "__main__":
    asyncio.run(main())
