"""
TMLPD Workflows Module

This module provides workflow patterns following Anthropic's specification:
- Routing: Classify and route to appropriate handlers
- Orchestrator-Workers: Dynamic task breakdown and delegation
"""

from .router import TaskRouter, route_and_execute
from .orchestrator import OrchestratorWorkflow, OrchestratorAgent, orchestrate_task

__all__ = [
    "TaskRouter",
    "route_and_execute",
    "OrchestratorWorkflow",
    "OrchestratorAgent",
    "orchestrate_task"
]
