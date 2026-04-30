"""
TaskPlanner - High-Level Task Decomposition

Based on arXiv:2505.13516 (HALO) and arXiv:2506.12508v3 (AgentOrchestra)

This module implements the first tier of HALO orchestration:
- Decomposes complex tasks into subtasks
- Identifies dependencies between subtasks
- Estimates difficulty and resource requirements
- Creates execution DAG (Directed Acyclic Graph)
"""

import asyncio
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from enum import Enum
import json
from datetime import datetime


class TaskType(Enum):
    """Types of tasks for specialized routing"""
    PLANNING = "planning"          # High-level strategy
    CODING = "coding"              # Implementation/Writing
    ANALYSIS = "analysis"          # Data processing/reasoning
    RESEARCH = "research"          # Information gathering
    TESTING = "testing"            # Verification/Validation
    DEPLOYMENT = "deployment"      # Release/Infrastructure


@dataclass
class SubTask:
    """Individual subtask in the decomposition"""
    id: str
    description: str
    task_type: TaskType
    difficulty: float  # 0-100
    estimated_duration_seconds: int
    dependencies: List[str] = field(default_factory=list)
    required_capabilities: List[str] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "description": self.description,
            "task_type": self.task_type.value,
            "difficulty": self.difficulty,
            "estimated_duration_seconds": self.estimated_duration_seconds,
            "dependencies": self.dependencies,
            "required_capabilities": self.required_capabilities,
            "context": self.context
        }


@dataclass
class TaskDecomposition:
    """Result of task decomposition"""
    original_task: Dict[str, Any]
    subtasks: List[SubTask]
    dependency_graph: Dict[str, List[str]]  # task_id -> dependent task_ids
    execution_order: List[str]  # Topological sort
    estimated_total_duration: int
    metadata: Dict[str, Any] = field(default_factory=dict)


class TaskPlanner:
    """
    High-level task decomposition planner

    Implements Tier 1 of HALO orchestration:
    - Analyzes task complexity
    - Decomposes into manageable subtasks
    - Identifies dependencies and constraints
    - Creates optimal execution order
    """

    def __init__(self, llm_client=None):
        """
        Initialize task planner

        Args:
            llm_client: LLM client for decomposition (if None, uses mock)
        """
        self.llm_client = llm_client
        self.decomposition_history = []

    async def decompose(
        self,
        task: Dict[str, Any],
        max_subtasks: int = 10,
        max_depth: int = 3
    ) -> TaskDecomposition:
        """
        Decompose a complex task into subtasks

        Args:
            task: Original task with 'description' and optional context
            max_subtasks: Maximum number of subtasks to create
            max_depth: Maximum decomposition depth (for recursion)

        Returns:
            TaskDecomposition with subtasks and execution plan
        """
        description = task.get("description", "")
        context = task.get("context", {})

        # Step 1: Analyze task complexity
        complexity_analysis = await self._analyze_complexity(description, context)

        # Step 2: Determine if decomposition is needed
        if complexity_analysis["difficulty_score"] < 40:
            # Simple task - no decomposition needed
            return self._create_simple_decomposition(task, complexity_analysis)

        # Step 3: Decompose into subtasks
        subtasks = await self._generate_subtasks(
            description,
            context,
            complexity_analysis,
            max_subtasks
        )

        # Step 4: Identify dependencies
        dependency_graph = await self._identify_dependencies(subtasks)

        # Step 5: Create execution order (topological sort)
        execution_order = self._topological_sort(subtasks, dependency_graph)

        # Step 6: Estimate total duration
        total_duration = sum(st.estimated_duration_seconds for st in subtasks)

        decomposition = TaskDecomposition(
            original_task=task,
            subtasks=subtasks,
            dependency_graph=dependency_graph,
            execution_order=execution_order,
            estimated_total_duration=total_duration,
            metadata={
                "decomposition_method": "halo_planner",
                "complexity_analysis": complexity_analysis,
                "decomposition_depth": 1,
                "timestamp": datetime.now().isoformat()
            }
        )

        # Log for learning
        self.decomposition_history.append(decomposition)

        return decomposition

    async def _analyze_complexity(
        self,
        description: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze task complexity to determine decomposition strategy

        Returns:
            Dict with complexity metrics:
            - difficulty_score: 0-100 overall difficulty
            - num_steps: Estimated number of steps
            - requires_research: Whether external info needed
            - requires_coding: Whether implementation needed
            - domains: List of domains involved
        """
        # Heuristic-based analysis (can be enhanced with LLM)
        text = description.lower()

        # Complexity factors
        factors = {
            "length": len(description.split()),
            "multi_step": any(word in text for word in [
                "then", "after", "next", "finally", "followed by"
            ]),
            "technical": any(word in text for word in [
                "api", "database", "algorithm", "architecture", "system"
            ]),
            "requirements": any(word in text for word in [
                "requirement", "constraint", "must", "should", "specification"
            ]),
            "dependencies": any(word in text for word in [
                "using", "with", "from", "based on", "integrating"
            ]),
            "domain_specific": any(word in text for word in [
                "machine learning", "data science", "web development",
                "mobile", "backend", "frontend"
            ]),
            "ambiguous": any(word in text for word in [
                "maybe", "possibly", "might", "could", "consider"
            ])
        }

        # Calculate difficulty score
        difficulty = 0
        if factors["length"] > 50:
            difficulty += 15
        if factors["multi_step"]:
            difficulty += 15
        if factors["technical"]:
            difficulty += 15
        if factors["requirements"]:
            difficulty += 10
        if factors["dependencies"]:
            difficulty += 10
        if factors["domain_specific"]:
            difficulty += 10
        if factors["ambiguous"]:
            difficulty += 15

        difficulty = min(100, difficulty)

        # Determine characteristics
        num_steps = max(1, difficulty // 20)
        requires_research = any(word in text for word in [
            "research", "find", "investigate", "explore", "lookup"
        ])
        requires_coding = any(word in text for word in [
            "implement", "code", "build", "create", "develop"
        ])

        # Identify domains
        domains = []
        domain_keywords = {
            "web": ["web", "frontend", "backend", "api", "http"],
            "data": ["data", "database", "sql", "query", "analytics"],
            "ml": ["machine learning", "model", "training", "inference"],
            "mobile": ["mobile", "ios", "android", "app"],
            "devops": ["deploy", "infrastructure", "ci/cd", "docker"]
        }

        for domain, keywords in domain_keywords.items():
            if any(keyword in text for keyword in keywords):
                domains.append(domain)

        return {
            "difficulty_score": difficulty,
            "num_steps": num_steps,
            "requires_research": requires_research,
            "requires_coding": requires_coding,
            "domains": domains,
            "factors": factors
        }

    def _create_simple_decomposition(
        self,
        task: Dict[str, Any],
        complexity: Dict[str, Any]
    ) -> TaskDecomposition:
        """Create decomposition for simple tasks (no subtasks)"""
        subtask = SubTask(
            id="task_1",
            description=task.get("description", ""),
            task_type=TaskType.ANALYSIS,
            difficulty=complexity["difficulty_score"],
            estimated_duration_seconds=60,
            dependencies=[],
            required_capabilities=[],
            context=task.get("context", {})
        )

        return TaskDecomposition(
            original_task=task,
            subtasks=[subtask],
            dependency_graph={"task_1": []},
            execution_order=["task_1"],
            estimated_total_duration=60,
            metadata={
                "decomposition_method": "simple",
                "complexity_analysis": complexity,
                "timestamp": datetime.now().isoformat()
            }
        )

    async def _generate_subtasks(
        self,
        description: str,
        context: Dict[str, Any],
        complexity: Dict[str, Any],
        max_subtasks: int
    ) -> List[SubTask]:
        """
        Generate subtasks based on task analysis

        This is a simplified implementation. In production, use LLM to generate
        more sophisticated subtask decompositions.
        """
        subtasks = []

        # Determine task type and create appropriate subtasks
        if complexity["requires_coding"]:
            subtasks = self._create_coding_subtasks(description, context, complexity)
        elif complexity["requires_research"]:
            subtasks = self._create_research_subtasks(description, context, complexity)
        else:
            subtasks = self._create_analysis_subtasks(description, context, complexity)

        # Limit to max_subtasks
        return subtasks[:max_subtasks]

    def _create_coding_subtasks(
        self,
        description: str,
        context: Dict[str, Any],
        complexity: Dict[str, Any]
    ) -> List[SubTask]:
        """Create subtasks for coding tasks"""
        subtasks = []

        # Subtask 1: Planning/Design
        subtasks.append(SubTask(
            id="task_1",
            description=f"Plan architecture for: {description}",
            task_type=TaskType.PLANNING,
            difficulty=complexity["difficulty_score"] * 0.7,
            estimated_duration_seconds=300,
            dependencies=[],
            required_capabilities=["planning", "architecture"],
            context=context
        ))

        # Subtask 2: Implementation
        subtasks.append(SubTask(
            id="task_2",
            description=f"Implement: {description}",
            task_type=TaskType.CODING,
            difficulty=complexity["difficulty_score"],
            estimated_duration_seconds=600,
            dependencies=["task_1"],
            required_capabilities=["coding", "implementation"],
            context=context
        ))

        # Subtask 3: Testing
        subtasks.append(SubTask(
            id="task_3",
            description=f"Test implementation of: {description}",
            task_type=TaskType.TESTING,
            difficulty=complexity["difficulty_score"] * 0.6,
            estimated_duration_seconds=300,
            dependencies=["task_2"],
            required_capabilities=["testing", "validation"],
            context=context
        ))

        return subtasks

    def _create_research_subtasks(
        self,
        description: str,
        context: Dict[str, Any],
        complexity: Dict[str, Any]
    ) -> List[SubTask]:
        """Create subtasks for research tasks"""
        subtasks = []

        # Subtask 1: Initial research
        subtasks.append(SubTask(
            id="task_1",
            description=f"Research: {description}",
            task_type=TaskType.RESEARCH,
            difficulty=complexity["difficulty_score"] * 0.8,
            estimated_duration_seconds=400,
            dependencies=[],
            required_capabilities=["research", "information_gathering"],
            context=context
        ))

        # Subtask 2: Analysis
        subtasks.append(SubTask(
            id="task_2",
            description=f"Analyze research findings for: {description}",
            task_type=TaskType.ANALYSIS,
            difficulty=complexity["difficulty_score"],
            estimated_duration_seconds=300,
            dependencies=["task_1"],
            required_capabilities=["analysis", "synthesis"],
            context=context
        ))

        return subtasks

    def _create_analysis_subtasks(
        self,
        description: str,
        context: Dict[str, Any],
        complexity: Dict[str, Any]
    ) -> List[SubTask]:
        """Create subtasks for analysis tasks"""
        subtasks = []

        # Subtask 1: Understand requirements
        subtasks.append(SubTask(
            id="task_1",
            description=f"Understand requirements for: {description}",
            task_type=TaskType.ANALYSIS,
            difficulty=complexity["difficulty_score"] * 0.5,
            estimated_duration_seconds=200,
            dependencies=[],
            required_capabilities=["analysis"],
            context=context
        ))

        # Subtask 2: Execute analysis
        subtasks.append(SubTask(
            id="task_2",
            description=f"Perform analysis: {description}",
            task_type=TaskType.ANALYSIS,
            difficulty=complexity["difficulty_score"],
            estimated_duration_seconds=400,
            dependencies=["task_1"],
            required_capabilities=["analysis", "reasoning"],
            context=context
        ))

        return subtasks

    async def _identify_dependencies(
        self,
        subtasks: List[SubTask]
    ) -> Dict[str, List[str]]:
        """
        Identify dependencies between subtasks

        Returns:
            Dict mapping task_id -> list of task_ids that depend on it
        """
        dependency_graph = {}

        # Build dependency graph from subtask dependencies
        for subtask in subtasks:
            dependency_graph[subtask.id] = []

        for subtask in subtasks:
            for dep_id in subtask.dependencies:
                if dep_id in dependency_graph:
                    dependency_graph[dep_id].append(subtask.id)

        return dependency_graph

    def _topological_sort(
        self,
        subtasks: List[SubTask],
        dependency_graph: Dict[str, List[str]]
    ) -> List[str]:
        """
        Create topological sort of subtasks for execution order

        Returns:
            List of task IDs in execution order
        """
        # Kahn's algorithm for topological sorting
        in_degree = {task.id: len(task.dependencies) for task in subtasks}
        queue = [task_id for task_id, degree in in_degree.items() if degree == 0]
        execution_order = []

        while queue:
            # Sort queue by difficulty (execute easier tasks first)
            queue.sort(key=lambda tid: next(
                st.difficulty for st in subtasks if st.id == tid
            ))

            task_id = queue.pop(0)
            execution_order.append(task_id)

            # Reduce in-degree for dependent tasks
            for dependent_id in dependency_graph.get(task_id, []):
                in_degree[dependent_id] -= 1
                if in_degree[dependent_id] == 0:
                    queue.append(dependent_id)

        return execution_order

    def get_decomposition_stats(self) -> Dict[str, Any]:
        """Get statistics about decompositions performed"""
        if not self.decomposition_history:
            return {"total_decompositions": 0}

        total_subtasks = sum(len(d.subtasks) for d in self.decomposition_history)
        avg_subtasks = total_subtasks / len(self.decomposition_history)

        return {
            "total_decompositions": len(self.decomposition_history),
            "total_subtasks_created": total_subtasks,
            "average_subtasks_per_decomposition": avg_subtasks,
            "latest_decomposition": self.decomposition_history[-1].metadata
        }


# Example usage
async def main():
    """Example of TaskPlanner usage"""
    planner = TaskPlanner()

    # Simple task
    simple_task = {
        "description": "What is 2+2?",
        "context": {}
    }

    result = await planner.decompose(simple_task)
    print(f"Simple task: {len(result.subtasks)} subtasks")
    print(f"Execution order: {result.execution_order}")

    # Complex task
    complex_task = {
        "description": "Build a REST API with user authentication and database integration",
        "context": {"requirements": ["JWT", "PostgreSQL"]}
    }

    result = await planner.decompose(complex_task)
    print(f"\nComplex task: {len(result.subtasks)} subtasks")
    print(f"Execution order: {result.execution_order}")
    print(f"Total duration: {result.estimated_total_duration}s")

    for subtask in result.subtasks:
        print(f"  - {subtask.id}: {subtask.description} (difficulty: {subtask.difficulty})")


if __name__ == "__main__":
    asyncio.run(main())
