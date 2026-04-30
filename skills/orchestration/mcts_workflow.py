"""
MCTS Workflow Search - Optimize HALO orchestration strategies

Based on:
- arXiv:2505.13516 (HALO - MCTS-based workflow search)
- NeurIPS 2023 (MCTS for LLM agent planning)
- ICLR 2024 (Tree of Thoughts + MCTS)

Key Innovation: Uses Monte Carlo Tree Search to explore different
execution strategies and learn the best workflow for each task type.

Features:
- Explores different agent assignment strategies
- Learns from execution outcomes
- Balances exploration vs exploitation
- Adapts workflow to task complexity
"""

import asyncio
import random
import math
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from collections import defaultdict
import logging

from .task_planner import SubTask, TaskDecomposition
from .role_assigner import RoleAssigner, AgentAssignment, AgentRole
from .execution_engine import ExecutionEngine, ExecutionSummary


logger = logging.getLogger(__name__)


@dataclass
class WorkflowNode:
    """Node in MCTS search tree representing a workflow state"""
    state_id: str  # Unique identifier for this state
    subtasks_remaining: List[SubTask]
    completed_subtasks: List[str]
    current_strategy: Dict[str, str]  # subtask_id -> model_id assignments
    results_so_far: Dict[str, Any] = field(default_factory=dict)

    # MCTS statistics
    visits: int = 0
    total_reward: float = 0.0
    parent: Optional["WorkflowNode"] = None
    children: List["WorkflowNode"] = field(default_factory=list)

    @property
    def average_reward(self) -> float:
        """Average reward per visit"""
        return self.total_reward / self.visits if self.visits > 0 else 0.0

    @property
    def is_fully_expanded(self) -> bool:
        """Whether all possible actions have been tried"""
        return len(self.children) > 0

    @property
    def is_terminal(self) -> bool:
        """Whether this is a terminal state (all subtasks complete)"""
        return len(self.subtasks_remaining) == 0


@dataclass
class WorkflowStrategy:
    """Complete workflow strategy (agent assignments for all subtasks)"""
    subtask_assignments: Dict[str, str]  # subtask_id -> model_id
    expected_quality: float
    expected_cost: float
    execution_order: List[str]

    # Execution statistics (if executed)
    actual_quality: Optional[float] = None
    actual_cost: Optional[float] = None
    execution_time_seconds: Optional[float] = None

    def to_dict(self) -> Dict:
        return {
            "subtask_assignments": self.subtask_assignments,
            "expected_quality": self.expected_quality,
            "expected_cost": self.expected_cost,
            "execution_order": self.execution_order,
            "actual_quality": self.actual_quality,
            "actual_cost": self.actual_cost,
            "execution_time_seconds": self.execution_time_seconds
        }


class MCTSWorkflowSearch:
    """
    Monte Carlo Tree Search for workflow optimization

    Explores different agent assignment strategies to find optimal workflow.

    Key Innovation:
    - Treats workflow optimization as a search problem
    - Uses MCTS to balance exploration/exploitation
    - Learns from execution outcomes
    - Adapts to task complexity
    """

    def __init__(
        self,
        role_assigner: RoleAssigner,
        execution_engine: ExecutionEngine,
        exploration_weight: float = 1.414,  # sqrt(2) for UCB1
        max_simulations: int = 100,
        max_depth: int = 10
    ):
        """
        Initialize MCTS workflow search

        Args:
            role_assigner: RoleAssigner for getting candidate agents
            execution_engine: ExecutionEngine for simulating workflows
            exploration_weight: UCB1 exploration parameter (higher = more exploration)
            max_simulations: Maximum MCTS simulations per search
            max_depth: Maximum search depth
        """
        self.role_assigner = role_assigner
        self.execution_engine = execution_engine
        self.exploration_weight = exploration_weight
        self.max_simulations = max_simulations
        self.max_depth = max_depth

        # Strategy history for learning
        self.strategy_history: List[WorkflowStrategy] = []
        self.performance_cache: Dict[str, float] = {}  # strategy_hash -> reward

    async def search(
        self,
        decomposition: TaskDecomposition,
        optimization_target: str = "balanced"
    ) -> WorkflowStrategy:
        """
        Search for optimal workflow strategy using MCTS

        Args:
            decomposition: Task decomposition with subtasks
            optimization_target: "quality", "cost", or "balanced"

        Returns:
            Best WorkflowStrategy found
        """
        logger.info(f"Starting MCTS workflow search for {len(decomposition.subtasks)} subtasks")
        start_time = datetime.now()

        # Initialize root node
        root = WorkflowNode(
            state_id="root",
            subtasks_remaining=decomposition.subtasks.copy(),
            completed_subtasks=[],
            current_strategy={}
        )

        # Run MCTS simulations
        for simulation in range(self.max_simulations):
            if simulation % 20 == 0:
                logger.debug(f"MCTS simulation {simulation}/{self.max_simulations}")

            # Selection: Traverse tree to find promising node
            node = self._select(root)

            # Expansion: Add child nodes if not terminal
            if not node.is_terminal and node.visits > 0:
                node = self._expand(node, decomposition, optimization_target)  # Changed from await

            # Simulation: Execute workflow and get reward
            reward = await self._simulate(node, decomposition, optimization_target)

            # Backpropagation: Update statistics
            self._backpropagate(node, reward)

        # Select best strategy from root
        best_child = max(root.children, key=lambda c: c.average_reward)
        best_strategy = self._node_to_strategy(best_child, decomposition)

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"MCTS search complete in {elapsed:.2f}s")
        logger.info(f"  Simulations: {self.max_simulations}")
        logger.info(f"  Tree depth: {self._tree_depth(root)}")
        logger.info(f"  Best strategy reward: {best_child.average_reward:.3f}")

        # Cache and store
        self.strategy_history.append(best_strategy)

        return best_strategy

    def _select(self, node: WorkflowNode) -> WorkflowNode:
        """
        Selection phase: UCB1 policy to balance exploration/exploitation

        UCB1 = average_reward + exploration_weight * sqrt(ln(parent_visits) / visits)
        """
        current = node

        while current.is_fully_expanded and not current.is_terminal:
            # Select child with highest UCB1 score
            current = max(
                current.children,
                key=lambda child: self._ucb1(child, current)
            )

        return current

    def _ucb1(self, child: WorkflowNode, parent: WorkflowNode) -> float:
        """UCB1 formula for node selection"""
        if child.visits == 0:
            return float('inf')  # Prioritize unvisited nodes

        exploitation = child.average_reward
        exploration = self.exploration_weight * math.sqrt(
            math.log(parent.visits) / child.visits
        )

        return exploitation + exploration

    def _expand(
        self,
        node: WorkflowNode,
        decomposition: TaskDecomposition,
        optimization_target: str
    ) -> WorkflowNode:
        """
        Expansion phase: Add new child node with different action

        Action = assign a different model to next subtask
        """
        # Get next subtask to execute
        if not node.subtasks_remaining:
            return node  # Terminal

        next_subtask = node.subtasks_remaining[0]

        # Try different model assignments for this subtask
        # Get candidates from role assigner
        candidates = self._get_model_candidates(next_subtask, optimization_target)

        # Try unexplored assignments
        for candidate_model in candidates:
            # Check if this assignment already tried
            assignment_key = f"{next_subtask.id}->{candidate_model}"
            if any(assignment_key in child.current_strategy.values() for child in node.children):
                continue  # Already explored

            # Create new child node
            new_strategy = node.current_strategy.copy()
            new_strategy[next_subtask.id] = candidate_model

            new_remaining = node.subtasks_remaining[1:]  # Remove this subtask
            new_completed = node.completed_subtasks + [next_subtask.id]

            child = WorkflowNode(
                state_id=f"{node.state_id}_{len(node.children)}",
                subtasks_remaining=new_remaining,
                completed_subtasks=new_completed,
                current_strategy=new_strategy,
                parent=node
            )

            node.children.append(child)
            return child  # Return first newly expanded child

        # If all candidates explored, return existing child
        return node.children[0] if node.children else node

    def _get_model_candidates(
        self,
        subtask: SubTask,
        optimization_target: str
    ) -> List[str]:
        """Get candidate models for a subtask"""
        # Use role assigner's model registry
        role = self.role_assigner._map_task_type_to_role(subtask.task_type)
        candidates = self.role_assigner.model_registry.get(role, [])

        # Return top 3 models by optimization target
        if optimization_target == "quality":
            scored = sorted(candidates, key=lambda m: m["quality_score"], reverse=True)
        elif optimization_target == "cost":
            scored = sorted(candidates, key=lambda m: m["cost_per_1k_tokens"])
        else:  # balanced
            scored = sorted(
                candidates,
                key=lambda m: m["quality_score"] / (m["cost_per_1k_tokens"] + 0.0001),
                reverse=True
            )

        return [f"{c['provider']}/{c['model']}" for c in scored[:3]]

    async def _simulate(
        self,
        node: WorkflowNode,
        decomposition: TaskDecomposition,
        optimization_target: str
    ) -> float:
        """
        Simulation phase: Execute workflow and estimate reward

        Reward = weighted combination of quality, cost, speed
        """
        if node.is_terminal:
            # Fully executed workflow - use actual results
            return self._calculate_reward(
                node.results_so_far.get("quality", 0.5),
                node.results_so_far.get("cost", 1.0),
                node.results_so_far.get("time", 1.0),
                optimization_target
            )

        # Partial workflow - estimate reward using heuristics
        total_quality = 0.0
        total_cost = 0.0
        total_time = 0.0

        for subtask_id, model_id in node.current_strategy.items():
            # Estimate quality based on model and subtask
            subtask = next(st for st in decomposition.subtasks if st.id == subtask_id)

            # Simple heuristic: match quality score to subtask difficulty
            base_quality = 0.8  # Default

            # Get model profile
            if "/" in model_id:
                provider, model = model_id.split("/", 1)
                role = self.role_assigner._map_task_type_to_role(subtask.task_type)
                candidates = self.role_assigner.model_registry.get(role, [])
                for c in candidates:
                    if c["provider"] == provider and c["model"] in model:
                        base_quality = c["quality_score"]
                        total_cost += c["cost_per_1k_tokens"]
                        break

            # Adjust for subtask difficulty
            difficulty_factor = 1.0
            if subtask.difficulty > 70:
                difficulty_factor = 1.2  # Harder tasks reduce quality
            elif subtask.difficulty < 30:
                difficulty_factor = 0.9  # Easier tasks boost quality

            adjusted_quality = base_quality / difficulty_factor
            total_quality += adjusted_quality

            # Estimate time (faster models = less time)
            total_time += subtask.estimated_duration_seconds

        # Average quality across subtasks
        avg_quality = total_quality / len(node.current_strategy) if node.current_strategy else 0.5

        return self._calculate_reward(
            avg_quality,
            total_cost,
            total_time,
            optimization_target
        )

    def _calculate_reward(
        self,
        quality: float,
        cost: float,
        time: float,
        optimization_target: str
    ) -> float:
        """Calculate reward based on optimization target"""
        if optimization_target == "quality":
            # Maximize quality, ignore cost/time
            return quality

        elif optimization_target == "cost":
            # Minimize cost (invert for reward)
            return 1.0 / (cost + 0.001)

        else:  # balanced
            # Weighted combination
            quality_weight = 0.6
            cost_weight = 0.3
            time_weight = 0.1

            normalized_quality = quality
            normalized_cost = 1.0 / (cost + 0.001)
            normalized_time = 1.0 / (time + 0.1)

            return (
                quality_weight * normalized_quality +
                cost_weight * normalized_cost +
                time_weight * normalized_time
            )

    def _backpropagate(self, node: WorkflowNode, reward: float):
        """Backpropagation phase: Update statistics up the tree"""
        current = node
        while current is not None:
            current.visits += 1
            current.total_reward += reward
            current = current.parent

    def _node_to_strategy(
        self,
        node: WorkflowNode,
        decomposition: TaskDecomposition
    ) -> WorkflowStrategy:
        """Convert node to WorkflowStrategy"""
        # Extract execution order
        execution_order = node.completed_subtasks + [st.id for st in node.subtasks_remaining]

        # Estimate quality and cost
        avg_quality = sum(
            self.role_assigner.model_registry
                .get(self.role_assigner._map_task_type_to_role(next(st for st in decomposition.subtasks if st.id == st_id).task_type), [])
                [0]["quality_score"] if self.role_assigner.model_registry.get(
                    self.role_assigner._map_task_type_to_role(next(st for st in decomposition.subtasks if st.id == st_id).task_type)
                ) else 0.8
            for st_id in execution_order
        ) / len(execution_order) if execution_order else 0.5

        total_cost = sum(
            self.role_assigner.model_registry
                .get(self.role_assigner._map_task_type_to_role(next(st for st in decomposition.subtasks if st.id == st_id).task_type), [])
                [0]["cost_per_1k_tokens"]
            for st_id in node.current_strategy.keys()
        )

        return WorkflowStrategy(
            subtask_assignments=node.current_strategy,
            expected_quality=avg_quality,
            expected_cost=total_cost,
            execution_order=execution_order
        )

    def _tree_depth(self, node: WorkflowNode) -> int:
        """Calculate maximum depth of tree from node"""
        if not node.children:
            return 0
        return 1 + max(self._tree_depth(child) for child in node.children)

    def get_search_stats(self) -> Dict[str, Any]:
        """Get statistics about searches performed"""
        if not self.strategy_history:
            return {"total_searches": 0}

        return {
            "total_searches": len(self.strategy_history),
            "cache_size": len(self.performance_cache),
            "avg_strategy_quality": sum(s.expected_quality for s in self.strategy_history) / len(self.strategy_history),
            "avg_strategy_cost": sum(s.expected_cost for s in self.strategy_history) / len(self.strategy_history)
        }


# Example usage
async def main():
    """Example of MCTS workflow search"""
    from .task_planner import TaskPlanner
    from .role_assigner import RoleAssigner
    from .execution_engine import ExecutionEngine

    # Create components
    planner = TaskPlanner()
    assigner = RoleAssigner()
    engine = ExecutionEngine(max_concurrent=3)
    mcts = MCTSWorkflowSearch(assigner, engine, max_simulations=50)

    # Create task
    task = {
        "description": "Build a REST API with authentication, database integration, and automated testing",
        "context": {"requirements": ["JWT", "PostgreSQL", "Jest"]}
    }

    # Decompose
    print("Decomposing task...")
    decomposition = await planner.decompose(task)

    print(f"\nDecomposed into {len(decomposition.subtasks)} subtasks:")
    for st in decomposition.subtasks:
        print(f"  {st.id}: {st.description} (difficulty: {st.difficulty})")

    # Search for optimal workflow
    print("\nRunning MCTS workflow search...")
    best_strategy = await mcts.search(decomposition, optimization_target="balanced")

    print(f"\nBest Workflow Strategy:")
    print(f"  Assignments: {best_strategy.subtask_assignments}")
    print(f"  Expected Quality: {best_strategy.expected_quality:.2f}")
    print(f"  Expected Cost: ${best_strategy.expected_cost:.4f}")
    print(f"  Execution Order: {best_strategy.execution_order}")

    # Stats
    stats = mcts.get_search_stats()
    print(f"\nMCTS Stats:")
    print(f"  Total searches: {stats['total_searches']}")
    print(f"  Cache size: {stats['cache_size']}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
