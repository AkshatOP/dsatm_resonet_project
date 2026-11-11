"""
Gini coefficient computation and resource allocation summary for DACRO.
Used by PolicyAgent and NegotiationOrchestrator to measure equity of resource distribution.
"""

import logging
from typing import Dict, List

import numpy as np

from messaging.message_types import AgentState

logger = logging.getLogger(__name__)


def compute_gini(allocations: List[float]) -> float:
    """
    Compute standard Gini coefficient for a list of non-negative resource values.
    Returns 0.0 (perfect equality) to 1.0 (maximum inequality).
    Returns 0.0 for empty or all-zero inputs.
    """
    if not allocations:
        return 0.0
    arr = np.array([max(0.0, v) for v in allocations], dtype=float)
    if arr.sum() == 0:
        return 0.0
    arr = np.sort(arr)
    n = len(arr)
    index = np.arange(1, n + 1)
    gini = (2 * np.sum(index * arr) - (n + 1) * arr.sum()) / (n * arr.sum())
    return float(np.clip(gini, 0.0, 1.0))


def resource_totals(agents: List[AgentState]) -> List[float]:
    """
    Total resources per agent, for the Gini calculation.
    Only agents that start with resources are counted: coordinators
    (sensing, policy, XAI, rescue coordinator) always hold nothing, and
    counting their zeros would make the city look unequal before any
    disaster even happens.
    """
    import config
    return [
        float(sum(a.resource_pool.values()))
        for a in agents
        if config.AGENT_INITIAL_RESOURCES.get(a.agent_type)
    ]


def get_allocation_summary(agents: List[AgentState]) -> Dict[str, Dict]:
    """
    Return per-agent resource utilization metrics.
    utilization = 1.0 - (sum_current / sum_initial) if initial > 0, else 0.0
    """
    import config
    summary: Dict[str, Dict] = {}
    for agent in agents:
        initial = config.AGENT_INITIAL_RESOURCES.get(agent.agent_type, {})
        total_initial = sum(initial.values()) if initial else 0
        total_current = sum(agent.resource_pool.values()) if agent.resource_pool else 0
        utilization = 0.0
        if total_initial > 0:
            utilization = 1.0 - (total_current / total_initial)
            utilization = max(0.0, min(1.0, utilization))
        summary[agent.agent_id] = {
            "agent_type": agent.agent_type,
            "total_current": total_current,
            "total_initial": total_initial,
            "utilization": round(utilization, 4),
            "status": agent.status,
        }
    return summary
