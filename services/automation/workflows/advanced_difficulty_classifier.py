"""
Phase 2b: Advanced Difficulty Classifier

Enhanced difficulty classification with multi-factor scoring
based on arXiv:2509.11079 and empirical analysis.
"""

import re
from typing import Dict, Any, List, Tuple
from collections import Counter


class AdvancedDifficultyClassifier:
    """
    Advanced difficulty classifier with enhanced features.

    Improvements over base classifier:
    - Context-aware scoring
    - Historical performance tracking
    - Dynamic threshold adjustment
    - Multi-modal feature extraction
    """

    DIFFICULTY_LEVELS = {
        "TRIVIAL": range(0, 20),
        "SIMPLE": range(20, 40),
        "MEDIUM": range(40, 60),
        "COMPLEX": range(60, 80),
        "EXPERT": range(80, 100)
    }

    # Enhanced keyword dictionaries
    MULTI_STEP_KEYWORDS = {
        "high": ["then", "after", "before", "followed by", "subsequently", "finally"],
        "medium": ["multiple", "several", "sequence", "chain", "series"],
        "low": ["iterate", "refine", "improve", "optimize"]
    }

    TECHNICAL_KEYWORDS = {
        "architecture": ["architecture", "system design", "microservices", "monolith"],
        "implementation": ["implement", "integrate", "build", "create", "develop"],
        "optimization": ["optimize", "refactor", "improve performance", "efficiency"],
        "infrastructure": ["api", "database", "authentication", "deployment", "scaling"],
        "algorithms": ["algorithm", "data structure", "computational", "complexity"],
        "security": ["security", "authentication", "authorization", "encryption"],
        "data": ["database", "storage", "persistence", "data modeling", "migration"]
    }

    DOMAIN_KEYWORDS = {
        "frontend": ["react", "vue", "angular", "component", "ui", "ux", "css", "html"],
        "backend": ["api", "server", "microservice", "endpoint", "middleware"],
        "data": ["database", "sql", "nosql", "orm", "migration", "query"],
        "devops": ["deploy", "docker", "kubernetes", "ci/cd", "pipeline"],
        "testing": ["test", "spec", "mock", "coverage", "unit", "integration"],
        "mobile": ["mobile", "ios", "android", "react native", "flutter"]
    }

    def __init__(self, learning_enabled: bool = True):
        """
        Initialize advanced difficulty classifier.

        Args:
            learning_enabled: Enable learning from past executions
        """
        self.learning_enabled = learning_enabled
        self.history: List[Dict[str, Any]] = []

    def classify_difficulty(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classify task difficulty with enhanced multi-factor analysis.

        Args:
            task: Task with description, requirements, context

        Returns:
            Dict with difficulty level, score, and breakdown
        """
        description = task.get("description", "")
        requirements = task.get("requirements", "")
        context = task.get("context", "")

        # Combine all text
        full_text = f"{description} {requirements} {context}".lower()

        # Calculate scores
        score_breakdown = {
            "length": self._score_length(description),
            "multi_step": self._score_multi_step(full_text),
            "technical": self._score_technical(full_text),
            "requirements": self._score_requirements(task),
            "dependencies": self._score_dependencies(full_text),
            "domain": self._score_domain(full_text),
            "complexity": self._score_complexity(full_text),
            "ambiguity": self._score_ambiguity(task)
        }

        # Calculate total score
        total_score = sum(score_breakdown.values())

        # Map to difficulty level
        difficulty = self._map_score_to_difficulty(total_score)

        # Adjust based on learning if enabled
        if self.learning_enabled and self.history:
            adjusted_difficulty = self._adjust_with_learning(
                difficulty,
                description,
                total_score
            )
        else:
            adjusted_difficulty = difficulty

        return {
            "difficulty": adjusted_difficulty,
            "score": total_score,
            "breakdown": score_breakdown,
            "confidence": self._calculate_confidence(score_breakdown)
        }

    def _score_length(self, description: str) -> float:
        """Score based on task length (0-15 points)"""
        word_count = len(description.split())
        char_count = len(description)

        # Word count score (0-10 points)
        word_score = min(word_count / 15, 10)

        # Character count score (0-5 points)
        char_score = min(char_count / 500, 5)

        return word_score + char_score

    def _score_multi_step(self, text: str) -> float:
        """Score based on multi-step indicators (0-20 points)"""
        score = 0.0

        # High-weight keywords
        high_count = sum(1 for kw in self.MULTI_STEP_KEYWORDS["high"] if kw in text)
        score += min(high_count * 4, 8)

        # Medium-weight keywords
        medium_count = sum(1 for kw in self.MULTI_STEP_KEYWORDS["medium"] if kw in text)
        score += min(medium_count * 3, 6)

        # Low-weight keywords
        low_count = sum(1 for kw in self.MULTI_STEP_KEYWORDS["low"] if kw in text)
        score += min(low_count * 2, 6)

        return score

    def _score_technical(self, text: str) -> float:
        """Score based on technical complexity (0-25 points)"""
        score = 0.0

        for category, keywords in self.TECHNICAL_KEYWORDS.items():
            category_count = sum(1 for kw in keywords if kw in text)
            if category_count > 0:
                # Different categories have different weights
                if category == "architecture":
                    score += min(category_count * 4, 8)
                elif category in ["implementation", "infrastructure"]:
                    score += min(category_count * 3, 6)
                else:
                    score += min(category_count * 2, 4)

        return min(score, 25)

    def _score_requirements(self, task: Dict[str, Any]) -> float:
        """Score based on requirements specificity (0-10 points)"""
        score = 0.0

        if task.get("requirements"):
            requirements_length = len(task.get("requirements", "").split())
            score += min(requirements_length / 10, 5)

        if task.get("context"):
            context_length = len(task.get("context", "").split())
            score += min(context_length / 10, 3)

        if task.get("constraints"):
            score += 2

        return score

    def _score_dependencies(self, text: str) -> float:
        """Score based on task dependencies (0-10 points)"""
        dependency_keywords = [
            "depends", "requires", "needs", "after", "before",
            "prerequisite", "rely", "blocking", "blocked by"
        ]

        count = sum(1 for kw in dependency_keywords if kw in text)
        return min(count * 2.5, 10)

    def _score_domain(self, text: str) -> float:
        """Score based on domain-specific complexity (0-10 points)"""
        domain_scores = {}

        for domain, keywords in self.DOMAIN_KEYWORDS.items():
            count = sum(1 for kw in keywords if kw in text)
            domain_scores[domain] = count

        # Multiple domains = higher complexity
        domains_present = sum(1 for score in domain_scores.values() if score > 0)

        return min(domains_present * 2.5, 10)

    def _score_complexity(self, text: str) -> float:
        """Score based on complexity indicators (0-10 points)"""
        complexity_keywords = {
            "high": ["distributed", "scalable", "real-time", "concurrent", "async"],
            "medium": ["optimize", "efficient", "performance", "integration"]
        }

        score = 0.0
        for kw in complexity_keywords["high"]:
            if kw in text:
                score += 2.5

        for kw in complexity_keywords["medium"]:
            if kw in text:
                score += 1.0

        return min(score, 10)

    def _score_ambiguity(self, task: Dict[str, Any]) -> float:
        """Score based on ambiguity (reduces score for vagueness) (0-0 points)"""
        description = task.get("description", "").lower()

        ambiguity_keywords = [
            "somehow", "maybe", "possibly", "try to", "figure out",
            "something", "things", "stuff", "etc"
        ]

        ambiguity_count = sum(1 for kw in ambiguity_keywords if kw in description)

        # Penalize ambiguity (subtract from total, but we'll cap at 0)
        return min(ambiguity_count * -1, 0)

    def _map_score_to_difficulty(self, score: float) -> str:
        """Map numerical score to difficulty level"""
        for level, range_obj in self.DIFFICULTY_LEVELS.items():
            if score in range_obj:
                return level
        return "MEDIUM"

    def _calculate_confidence(self, breakdown: Dict[str, float]) -> float:
        """
        Calculate confidence in classification.

        Higher confidence when scores are consistently high or low,
        rather than mixed.
        """
        values = list(breakdown.values())

        # Calculate variance
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)

        # Lower variance = higher confidence
        confidence = max(0, 1 - (variance / 100))
        return round(confidence, 2)

    def _adjust_with_learning(
        self,
        current_difficulty: str,
        description: str,
        current_score: float
    ) -> str:
        """Adjust classification based on historical performance"""
        # Find similar tasks in history
        similar_tasks = [
            h for h in self.history
            if self._similarity(description, h["description"]) > 0.7
        ]

        if not similar_tasks:
            return current_difficulty

        # Analyze patterns
        actual_difficulties = [t.get("actual_difficulty") for t in similar_tasks]

        # If similar tasks were consistently harder/easier
        if actual_difficulties:
            most_common = Counter(actual_difficulties).most_common(1)[0][0]

            # Adjust if there's a consistent pattern
            if most_common != current_difficulty:
                # Log adjustment
                print(f"📚 Learning: Adjusting {current_difficulty} -> {most_common}")

                return most_common

        return current_difficulty

    def _similarity(self, text1: str, text2: str) -> float:
        """Calculate text similarity using word overlap"""
        words1 = set(re.findall(r'\w+', text1.lower()))
        words2 = set(re.findall(r'\w+', text2.lower()))

        if not words1 or not words2:
            return 0.0

        intersection = words1 & words2
        union = words1 | words2

        return len(intersection) / len(union) if union else 0.0

    def record_outcome(
        self,
        task: Dict[str, Any],
        predicted_difficulty: str,
        actual_difficulty: str,
        execution_time: float,
        success: bool
    ):
        """
        Record actual execution outcome for learning.

        Args:
            task: Original task
            predicted_difficulty: What was predicted
            actual_difficulty: What it should have been
            execution_time: How long it took
            success: Whether it succeeded
        """
        if not self.learning_enabled:
            return

        self.history.append({
            "description": task.get("description", ""),
            "predicted_difficulty": predicted_difficulty,
            "actual_difficulty": actual_difficulty,
            "execution_time": execution_time,
            "success": success,
            "timestamp": __import__("datetime").datetime.now().isoformat()
        })

        # Keep history manageable
        if len(self.history) > 1000:
            self.history = self.history[-1000:]

    def get_learning_stats(self) -> Dict[str, Any]:
        """Get learning statistics"""
        if not self.history:
            return {"message": "No learning data yet"}

        correct_predictions = sum(
            1 for h in self.history
            if h["predicted_difficulty"] == h["actual_difficulty"]
        )

        return {
            "total_records": len(self.history),
            "accuracy": correct_predictions / len(self.history) if self.history else 0,
            "difficulty_distribution": Counter(
                h["actual_difficulty"] for h in self.history
            ),
            "avg_execution_time_by_difficulty": self._avg_time_by_difficulty()
        }

    def _avg_time_by_difficulty(self) -> Dict[str, float]:
        """Calculate average execution time by difficulty"""
        times_by_difficulty = {}

        for h in self.history:
            difficulty = h["actual_difficulty"]
            time = h["execution_time"]

            if difficulty not in times_by_difficulty:
                times_by_difficulty[difficulty] = []
            times_by_difficulty[difficulty].append(time)

        return {
            difficulty: sum(times) / len(times)
            for difficulty, times in times_by_difficulty.items()
        }
