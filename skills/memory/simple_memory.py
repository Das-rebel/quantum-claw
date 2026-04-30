"""
Simple Project Memory - Workflow Phase 3

Implements lightweight JSON-based memory for learning successful patterns.
No complex vector databases or embeddings - just simple pattern matching.

Philosophy:
- Keep it simple and transparent
- Learn from successful executions
- Recall similar patterns by keyword matching
- Easy to inspect and debug (plain JSON)
"""

from typing import Dict, List, Any, Optional
from pathlib import Path
import json
from datetime import datetime
from collections import Counter
import re


class SimpleProjectMemory:
    """
    Simple JSON-based memory for learning and recalling patterns.

    Stores:
    - Successful task patterns
    - Agent/skill combinations that worked
    - Performance metrics (time, cost, tokens)
    - User preferences

    Retrieves by:
    - Keyword matching
    - Task similarity
    - Frequency/recency scoring
    """

    def __init__(self, memory_file: str = ".taskmaster/memory.json"):
        """
        Initialize Simple Project Memory

        Args:
            memory_file: Path to JSON memory file
        """
        self.memory_file = Path(memory_file)
        self.memory_file.parent.mkdir(parents=True, exist_ok=True)

        self.memory: Dict[str, Any] = self._load_memory()

        self.stats = {
            "patterns_stored": 0,
            "patterns_recalled": 0,
            "hits": 0,
            "misses": 0
        }

    def _load_memory(self) -> Dict[str, Any]:
        """Load memory from JSON file"""
        if self.memory_file.exists():
            try:
                with open(self.memory_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Warning: Failed to load memory: {e}")
                return self._empty_memory()

        return self._empty_memory()

    def _empty_memory(self) -> Dict[str, Any]:
        """Create empty memory structure"""
        return {
            "version": "1.0",
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "patterns": [],
            "preferences": {},
            "stats": {
                "total_patterns": 0,
                "successful_patterns": 0,
                "failed_patterns": 0
            }
        }

    def _save_memory(self):
        """Save memory to JSON file"""
        self.memory["last_updated"] = datetime.now().isoformat()
        self.memory["stats"]["total_patterns"] = len(self.memory["patterns"])

        with open(self.memory_file, 'w') as f:
            json.dump(self.memory, f, indent=2)

    def remember_pattern(
        self,
        task: Dict[str, Any],
        result: Dict[str, Any],
        agent_id: str,
        skills_used: List[str],
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a successful execution pattern.

        Args:
            task: Task that was executed
            result: Execution result
            agent_id: Agent that performed the task
            skills_used: List of skills used
            metadata: Optional additional metadata

        Returns:
            Pattern ID
        """
        pattern_id = f"pattern_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Extract keywords from task description
        description = task.get("description", "")
        keywords = self._extract_keywords(description)

        pattern = {
            "id": pattern_id,
            "created_at": datetime.now().isoformat(),
            "task": {
                "description": description,
                "keywords": keywords,
                "requirements": task.get("requirements", ""),
                "context": task.get("context", "")
            },
            "execution": {
                "agent_id": agent_id,
                "skills_used": skills_used,
                "model": result.get("model", "unknown"),
                "provider": result.get("provider", "unknown")
            },
            "performance": {
                "success": result.get("success", False),
                "tokens_used": result.get("tokens_used", 0),
                "cost": result.get("cost", 0.0),
                "execution_time": result.get("execution_time", 0.0)
            },
            "metadata": metadata or {},
            "usage_count": 0
        }

        self.memory["patterns"].append(pattern)

        if result.get("success"):
            self.memory["stats"]["successful_patterns"] += 1
        else:
            self.memory["stats"]["failed_patterns"] += 1

        self._save_memory()
        self.stats["patterns_stored"] += 1

        return pattern_id

    def recall_patterns(
        self,
        task: Dict[str, Any],
        top_k: int = 3,
        min_success_rate: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Recall similar successful patterns.

        Args:
            task: Current task to find patterns for
            top_k: Maximum number of patterns to return
            min_success_rate: Minimum success rate threshold

        Returns:
            List of relevant patterns with similarity scores
        """
        description = task.get("description", "")
        current_keywords = self._extract_keywords(description)

        # Score each pattern
        scored_patterns = []

        for pattern in self.memory["patterns"]:
            # Skip unsuccessful patterns
            if not pattern["performance"]["success"]:
                continue

            # Calculate keyword overlap similarity
            pattern_keywords = set(pattern["task"]["keywords"])
            overlap = len(current_keywords & pattern_keywords)
            union = len(current_keywords | pattern_keywords)

            if union == 0:
                similarity = 0.0
            else:
                similarity = overlap / union

            # Boost by frequency (previously successful patterns)
            frequency_boost = pattern["usage_count"] * 0.1

            # Boost by recency (patterns from last 7 days)
            created_at = datetime.fromisoformat(pattern["created_at"])
            days_old = (datetime.now() - created_at).days
            recency_boost = max(0, (7 - days_old) * 0.05)

            total_score = similarity + frequency_boost + recency_boost

            if total_score > 0:
                scored_patterns.append({
                    "pattern": pattern,
                    "similarity": similarity,
                    "total_score": total_score
                })

        # Sort by total score
        scored_patterns.sort(key=lambda x: x["total_score"], reverse=True)

        # Update stats
        if scored_patterns:
            self.stats["patterns_recalled"] += len(scored_patterns[:top_k])
            self.stats["hits"] += 1
        else:
            self.stats["misses"] += 1

        # Return top patterns
        return scored_patterns[:top_k]

    def get_best_agent_for_task(
        self,
        task: Dict[str, Any],
        min_success_rate: float = 0.7
    ) -> Optional[Dict[str, Any]]:
        """
        Get the best agent configuration for a task based on history.

        Args:
            task: Task to find agent for
            min_success_rate: Minimum success rate threshold

        Returns:
            Agent configuration dict or None
        """
        patterns = self.recall_patterns(task, top_k=10)

        if not patterns:
            return None

        # Find most common successful agent/skill combination
        agent_combinations = []

        for scored_pattern in patterns:
            pattern = scored_pattern["pattern"]
            execution = pattern["execution"]

            # Create combination key
            combo_key = (
                execution["agent_id"],
                tuple(sorted(execution["skills_used"]))
            )

            agent_combinations.append(combo_key)

        # Count occurrences
        counter = Counter(agent_combinations)

        if not counter:
            return None

        # Get most common combination
        best_combo = counter.most_common(1)[0][0]

        return {
            "agent_id": best_combo[0],
            "skills": list(best_combo[1]),
            "confidence": counter[best_combo] / len(agent_combinations)
        }

    def set_preference(self, key: str, value: Any):
        """
        Store a user preference.

        Args:
            key: Preference key
            value: Preference value
        """
        self.memory["preferences"][key] = {
            "value": value,
            "updated_at": datetime.now().isoformat()
        }

        self._save_memory()

    def get_preference(self, key: str, default: Any = None) -> Any:
        """
        Get a user preference.

        Args:
            key: Preference key
            default: Default value if not found

        Returns:
            Preference value or default
        """
        pref = self.memory["preferences"].get(key)
        return pref["value"] if pref else default

    def get_insights(self) -> Dict[str, Any]:
        """
        Get insights about patterns and performance.

        Returns:
            Dictionary with insights
        """
        patterns = self.memory["patterns"]

        if not patterns:
            return {
                "total_patterns": 0,
                "message": "No patterns stored yet"
            }

        # Calculate statistics
        successful = [p for p in patterns if p["performance"]["success"]]
        failed = [p for p in patterns if not p["performance"]["success"]]

        avg_tokens = sum(p["performance"]["tokens_used"] for p in successful) / len(successful) if successful else 0
        avg_cost = sum(p["performance"]["cost"] for p in successful) / len(successful) if successful else 0
        avg_time = sum(p["performance"]["execution_time"] for p in successful) / len(successful) if successful else 0

        # Most common keywords
        all_keywords = []
        for pattern in patterns:
            all_keywords.extend(pattern["task"]["keywords"])

        keyword_counter = Counter(all_keywords)

        # Most used skills
        all_skills = []
        for pattern in patterns:
            all_skills.extend(pattern["execution"]["skills_used"])

        skill_counter = Counter(all_skills)

        return {
            "total_patterns": len(patterns),
            "successful_patterns": len(successful),
            "failed_patterns": len(failed),
            "success_rate": len(successful) / len(patterns) if patterns else 0,
            "avg_tokens_per_task": avg_tokens,
            "avg_cost_per_task": avg_cost,
            "avg_execution_time": avg_time,
            "top_keywords": keyword_counter.most_common(10),
            "top_skills": skill_counter.most_common(10),
            "memory_stats": self.stats
        }

    def _extract_keywords(self, text: str) -> set:
        """
        Extract keywords from text.

        Args:
            text: Text to extract from

        Returns:
            Set of keywords
        """
        # Remove common words
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
            "for", "of", "with", "by", "from", "as", "is", "was", "are",
            "been", "be", "have", "has", "had", "do", "does", "did", "will",
            "would", "should", "could", "may", "might", "can", "this", "that"
        }

        # Extract words
        words = re.findall(r'\w+', text.lower())

        # Filter stop words and short words
        keywords = {w for w in words if w not in stop_words and len(w) > 2}

        return keywords

    def export_memory(self, export_path: str):
        """
        Export memory to a file.

        Args:
            export_path: Path to export to
        """
        export_path = Path(export_path)
        export_path.parent.mkdir(parents=True, exist_ok=True)

        with open(export_path, 'w') as f:
            json.dump(self.memory, f, indent=2)

        print(f"Memory exported to {export_path}")

    def import_memory(self, import_path: str):
        """
        Import memory from a file.

        Args:
            import_path: Path to import from
        """
        import_path = Path(import_path)

        if not import_path.exists():
            raise FileNotFoundError(f"Import file not found: {import_path}")

        with open(import_path, 'r') as f:
            imported_memory = json.load(f)

        # Merge patterns
        self.memory["patterns"].extend(imported_memory.get("patterns", []))

        # Merge preferences
        self.memory["preferences"].update(imported_memory.get("preferences", {}))

        self._save_memory()

        print(f"Memory imported from {import_path}")

    def clear_old_patterns(self, days_old: int = 30):
        """
        Clear patterns older than specified days.

        Args:
            days_old: Age threshold in days
        """
        cutoff_date = datetime.now().timestamp() - (days_old * 24 * 60 * 60)

        old_patterns = []
        for pattern in self.memory["patterns"]:
            created_at = datetime.fromisoformat(pattern["created_at"]).timestamp()

            if created_at < cutoff_date:
                old_patterns.append(pattern)

        for pattern in old_patterns:
            self.memory["patterns"].remove(pattern)

        self._save_memory()

        print(f"Cleared {len(old_patterns)} patterns older than {days_old} days")


# Convenience function for quick pattern storage

def remember_success(
    task: Dict[str, Any],
    result: Dict[str, Any],
    agent_id: str,
    skills_used: List[str],
    memory_file: str = ".taskmaster/memory.json"
) -> str:
    """
    Quick function to remember a successful pattern.

    Args:
        task: Task that was executed
        result: Execution result
        agent_id: Agent ID
        skills_used: Skills used
        memory_file: Path to memory file

    Returns:
        Pattern ID
    """
    memory = SimpleProjectMemory(memory_file)
    return memory.remember_pattern(task, result, agent_id, skills_used)
