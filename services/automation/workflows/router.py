"""
Task Router - Workflow Phase 2

Routes incoming tasks to appropriate skills or workflows based on classification.
Follows the Routing workflow pattern from Anthropic's Agent specification.

Decision Framework:
- 80%: Single LLM call + Skills (direct routing)
- 15%: Workflows (chaining, routing, parallelization)
- 5%: True autonomous agents
"""

from typing import Dict, List, Any, Optional
from pathlib import Path
import re
import json

from ..skills.skill_manager import SkillManager, Skill
from ..agents.skill_enhanced_agent import TMLEnhancedAgent


class TaskRouter:
    """
    Routes tasks to appropriate handlers based on classification.

    Implements the Routing workflow pattern:
    1. Classify incoming task
    2. Route to relevant skill(s)
    3. Execute with appropriate agent
    4. Return result
    """

    def __init__(
        self,
        skills_dir: str = "tmlpd-skills",
        config_path: Optional[str] = None
    ):
        """
        Initialize Task Router

        Args:
            skills_dir: Directory containing skill definitions
            config_path: Optional path to routing configuration
        """
        self.skill_manager = SkillManager(skills_dir)
        self.config = self._load_config(config_path)
        self.routing_stats = {
            "total_tasks": 0,
            "skill_routes": 0,
            "workflow_routes": 0,
            "agent_routes": 0,
            "fallback_routes": 0
        }

    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        """Load routing configuration"""
        if config_path and Path(config_path).exists():
            with open(config_path, 'r') as f:
                return json.load(f)

        # Default routing rules
        return {
            "keyword_mappings": {
                "react": ["frontend", "react", "component", "jsx", "tsx"],
                "node": ["backend", "api", "express", "server"],
                "jest": ["test", "testing", "spec", "mock"],
                "docs": ["documentation", "readme", "guide", "docs"]
            },
            "complexity_threshold": 0.7,
            "enable_llm_classification": False,
            "default_skill": None
        }

    def classify_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classify task to determine routing strategy.

        Args:
            task: Task dictionary with description and metadata

        Returns:
            Classification dictionary with:
                - complexity: float (0-1)
                - task_type: str ("simple", "workflow", "agent")
                - suggested_skills: List[str]
                - reasoning: str
        """
        description = task.get("description", "")
        task_words = set(re.findall(r'\w+', description.lower()))

        # Calculate complexity based on multiple factors
        complexity_score = self._calculate_complexity(task, task_words)

        # Determine task type based on complexity
        if complexity_score < 0.4:
            task_type = "simple"  # Direct LLM + Skills
            reasoning = "Low complexity: Single LLM call with relevant skills sufficient"
        elif complexity_score < 0.7:
            task_type = "workflow"  # May need chaining/routing
            reasoning = "Medium complexity: May benefit from workflow patterns"
        else:
            task_type = "agent"  # Complex multi-step task
            reasoning = "High complexity: Requires agent-like orchestration"

        # Find relevant skills
        suggested_skills = self.skill_manager.get_relevant_skills(
            description,
            top_k=3,
            threshold=0.1
        )

        return {
            "complexity": complexity_score,
            "task_type": task_type,
            "suggested_skills": suggested_skills,
            "reasoning": reasoning
        }

    def _calculate_complexity(self, task: Dict[str, Any], task_words: set) -> float:
        """
        Calculate task complexity score (0-1).

        Factors:
        - Task length (longer = more complex)
        - Number of distinct requirements
        - Presence of multi-step keywords
        - Dependencies or constraints
        """
        score = 0.0

        # Factor 1: Task length (0-0.3)
        description = task.get("description", "")
        word_count = len(description.split())
        score += min(word_count / 100, 0.3)

        # Factor 2: Multi-step indicators (0-0.4)
        multi_step_keywords = [
            "then", "after", "before", "followed by",
            "multiple", "several", "sequence", "chain"
        ]
        multi_step_count = sum(1 for keyword in multi_step_keywords if keyword in task_words)
        score += min(multi_step_count * 0.1, 0.4)

        # Factor 3: Requirements/constraints (0-0.2)
        requirements = task.get("requirements", "")
        context = task.get("context", "")
        if requirements or context:
            score += 0.2

        # Factor 4: Dependency indicators (0-0.1)
        dependency_keywords = ["depends", "requires", "needs", "after"]
        if any(keyword in task_words for keyword in dependency_keywords):
            score += 0.1

        return min(score, 1.0)

    def route(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Route task to appropriate handler.

        Args:
            task: Task to route

        Returns:
            Routing result with execution strategy
        """
        # Update stats
        self.routing_stats["total_tasks"] += 1

        # Classify task
        classification = self.classify_task(task)

        # Determine routing strategy
        if classification["task_type"] == "simple":
            return self._route_to_skill(task, classification)
        elif classification["task_type"] == "workflow":
            return self._route_to_workflow(task, classification)
        else:
            return self._route_to_agent(task, classification)

    def _route_to_skill(
        self,
        task: Dict[str, Any],
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Route to single skill (80% case)"""
        self.routing_stats["skill_routes"] += 1

        return {
            "strategy": "direct_skill",
            "classification": classification,
            "execution_plan": {
                "type": "single_llm_with_skills",
                "skills": classification["suggested_skills"],
                "agent": TMLEnhancedAgent(
                    agent_id="task-router",
                    provider="anthropic",  # Default provider
                    model="claude-sonnet-4",
                    assigned_skills=classification["suggested_skills"]
                )
            }
        }

    def _route_to_workflow(
        self,
        task: Dict[str, Any],
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Route to workflow pattern (15% case)"""
        self.routing_stats["workflow_routes"] += 1

        # Determine workflow type
        description = task.get("description", "").lower()

        if any(word in description for word in ["parallel", "simultaneous", "concurrent"]):
            workflow_type = "parallelization"
        elif any(word in description for word in ["then", "after", "followed"]):
            workflow_type = "chaining"
        else:
            workflow_type = "routing"

        return {
            "strategy": "workflow",
            "workflow_type": workflow_type,
            "classification": classification,
            "execution_plan": {
                "type": "workflow_pattern",
                "pattern": workflow_type,
                "skills": classification["suggested_skills"]
            }
        }

    def _route_to_agent(
        self,
        task: Dict[str, Any],
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Route to full agent (5% case)"""
        self.routing_stats["agent_routes"] += 1

        return {
            "strategy": "agent",
            "classification": classification,
            "execution_plan": {
                "type": "autonomous_agent",
                "skills": classification["suggested_skills"],
                "agent": TMLEnhancedAgent(
                    agent_id="orchestrator",
                    provider="anthropic",
                    model="claude-sonnet-4",
                    assigned_skills=classification["suggested_skills"]
                ),
                "enable_memory": True,
                "enable_checkpointing": True
            }
        }

    def get_routing_stats(self) -> Dict[str, Any]:
        """Get routing statistics"""
        total = self.routing_stats["total_tasks"]

        if total == 0:
            return self.routing_stats

        # Calculate percentages
        return {
            **self.routing_stats,
            "skill_route_percentage": (self.routing_stats["skill_routes"] / total) * 100,
            "workflow_route_percentage": (self.routing_stats["workflow_routes"] / total) * 100,
            "agent_route_percentage": (self.routing_stats["agent_routes"] / total) * 100
        }

    def reset_stats(self):
        """Reset routing statistics"""
        self.routing_stats = {
            "total_tasks": 0,
            "skill_routes": 0,
            "workflow_routes": 0,
            "agent_routes": 0,
            "fallback_routes": 0
        }


# Convenience functions for common routing patterns

def route_and_execute(task: Dict[str, Any], router: TaskRouter) -> Dict[str, Any]:
    """
    Route task and execute using determined strategy.

    Args:
        task: Task to execute
        router: TaskRouter instance

    Returns:
        Execution result
    """
    routing_result = router.route(task)

    if routing_result["strategy"] == "direct_skill":
        agent = routing_result["execution_plan"]["agent"]
        return agent.execute_task(task)
    elif routing_result["strategy"] == "workflow":
        # Return workflow plan for execution
        return {
            "success": True,
            "workflow_plan": routing_result,
            "message": "Workflow pattern identified - use workflow executor"
        }
    else:  # agent
        agent = routing_result["execution_plan"]["agent"]
        return agent.execute_task(task)
