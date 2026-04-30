"""
HALO Orchestration Module

Hierarchical Autonomous Logic-Oriented Orchestration for TMLPD v2.2

Based on:
- arXiv:2505.13516 (HALO - 3-tier hierarchical planning)
- arXiv:2506.12508v3 (AgentOrchestra)

Components:
- TaskPlanner: High-level task decomposition
- RoleAssigner: Specialized agent assignment
- ExecutionEngine: Parallel execution with verification
- HALOOrchestrator: Main coordinator (3-tier system)
- MCTSWorkflowSearch: MCTS-based workflow optimization
"""

from .task_planner import TaskPlanner, TaskDecomposition, SubTask, TaskType
from .role_assigner import RoleAssigner, AgentAssignment, AgentConfig, AgentRole
from .execution_engine import ExecutionEngine, ExecutionResult, ExecutionSummary
from .halo_orchestrator import HALOOrchestrator, HALOOrchestrationResult
from .mcts_workflow import MCTSWorkflowSearch, WorkflowNode, WorkflowStrategy

__all__ = [
    # Task Planning
    "TaskPlanner",
    "TaskDecomposition",
    "SubTask",
    "TaskType",

    # Role Assignment
    "RoleAssigner",
    "AgentAssignment",
    "AgentConfig",
    "AgentRole",

    # Execution
    "ExecutionEngine",
    "ExecutionResult",
    "ExecutionSummary",

    # Main Orchestrator
    "HALOOrchestrator",
    "HALOOrchestrationResult",

    # Workflow Optimization
    "MCTSWorkflowSearch",
    "WorkflowNode",
    "WorkflowStrategy"
]

__version__ = "2.2.0-alpha"
