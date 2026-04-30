"""
Phase 3b: Semantic Memory Store

Vector-based semantic memory using optional ChromaDB integration.
Based on Memoria framework (arXiv:2512.12686).
"""

import json
from typing import Dict, List, Any, Optional
from pathlib import Path
from datetime import datetime
import uuid


class SemanticMemoryStore:
    """
    Semantic memory: stores generalized knowledge and patterns.

    Based on Memoria framework (arXiv:2512.12686)

    Features:
    - Vector-based similarity search (optional ChromaDB)
    - Pattern extraction and storage
    - Cross-task generalization
    - Fallback to keyword-based search
    """

    def __init__(
        self,
        base_dir: str = ".taskmaster/memory/semantic",
        use_chromadb: bool = False,
        collection_name: str = "tmlpd_semantic"
    ):
        """
        Initialize semantic memory store.

        Args:
            base_dir: Directory to store semantic memories
            use_chromadb: Whether to use ChromaDB for vector search
            collection_name: ChromaDB collection name
        """
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

        self.use_chromadb = use_chromadb
        self.collection_name = collection_name
        self.chroma_client = None
        self.collection = None

        # Initialize ChromaDB if requested
        if use_chromadb:
            self._init_chromadb()

        # Pattern index
        self.patterns_file = self.base_dir / "patterns.json"
        self.patterns = self._load_patterns()

    def _init_chromadb(self):
        """Initialize ChromaDB client and collection"""
        try:
            import chromadb

            # Initialize client
            self.chroma_client = chromadb.Client()

            # Get or create collection
            try:
                self.collection = self.chroma_client.get_collection(
                    name=self.collection_name
                )
                print(f"✓ Loaded existing ChromaDB collection: {self.collection_name}")
            except:
                self.collection = self.chroma_client.create_collection(
                    name=self.collection_name,
                    metadata={"hnsw:space": "cosine"}
                )
                print(f"✓ Created new ChromaDB collection: {self.collection_name}")

        except ImportError:
            print("⚠ ChromaDB not installed. Falling back to keyword-based search.")
            print("  Install with: pip install chromadb")
            self.use_chromadb = False

    def _load_patterns(self) -> Dict[str, Any]:
        """Load pattern index"""
        if self.patterns_file.exists():
            with open(self.patterns_file, 'r') as f:
                return json.load(f)
        return {"patterns": [], "categories": {}}

    def _save_patterns(self):
        """Save pattern index"""
        with open(self.patterns_file, 'w') as f:
            json.dump(self.patterns, f, indent=2)

    def store_pattern(
        self,
        pattern: str,
        category: str,
        source_task: str,
        success_rate: float = 1.0,
        embeddings: Optional[List[float]] = None,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Store a generalized pattern.

        Args:
            pattern: Pattern description (e.g., "REST API with JWT auth")
            category: Pattern category (e.g., "api", "auth", "database")
            source_task: Original task that generated this pattern
            success_rate: Historical success rate (0-1)
            embeddings: Vector embeddings (if using ChromaDB)
            metadata: Additional metadata

        Returns:
            Pattern ID
        """
        pattern_id = f"pattern_{uuid.uuid4().hex[:12]}"

        pattern_data = {
            "id": pattern_id,
            "pattern": pattern,
            "category": category,
            "source_task": source_task,
            "success_rate": success_rate,
            "usage_count": 0,
            "created_at": datetime.now().isoformat(),
            "last_used": None,
            "metadata": metadata or {}
        }

        # Store in ChromaDB if available
        if self.use_chromadb and self.collection and embeddings:
            self.collection.add(
                ids=[pattern_id],
                embeddings=[embeddings],
                documents=[pattern],
                metadatas=[{
                    "category": category,
                    "success_rate": str(success_rate),
                    "created_at": pattern_data["created_at"]
                }]
            )

        # Update pattern index
        self.patterns["patterns"].append(pattern_data)

        # Update category index
        if category not in self.patterns["categories"]:
            self.patterns["categories"][category] = []
        self.patterns["categories"][category].append(pattern_id)

        self._save_patterns()

        return pattern_id

    def recall_patterns(
        self,
        query: str,
        category: Optional[str] = None,
        top_k: int = 5,
        min_success_rate: float = 0.5,
        query_embeddings: Optional[List[float]] = None
    ) -> List[Dict[str, Any]]:
        """
        Recall relevant patterns.

        Args:
            query: Query description
            category: Filter by category
            top_k: Maximum patterns to return
            min_success_rate: Minimum success rate
            query_embeddings: Query embeddings (if using ChromaDB)

        Returns:
            List of relevant patterns with similarity scores
        """
        # Use ChromaDB if available
        if self.use_chromadb and self.collection and query_embeddings:
            return self._recall_with_chromadb(
                query_embeddings,
                category,
                top_k,
                min_success_rate
            )

        # Fallback to keyword-based search
        return self._recall_keywords(query, category, top_k, min_success_rate)

    def _recall_with_chromadb(
        self,
        query_embeddings: List[float],
        category: Optional[str],
        top_k: int,
        min_success_rate: float
    ) -> List[Dict[str, Any]]:
        """Recall patterns using ChromaDB vector search"""
        # Build filter
        where_clause = {}
        if category:
            where_clause["category"] = category

        # Query ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embeddings],
            n_results=top_k * 2,  # Get more, then filter
            where=where_clause if where_clause else None
        )

        # Process results
        patterns_with_scores = []
        for i, pattern_id in enumerate(results["ids"][0]):
            # Load full pattern data
            pattern = self._get_pattern_by_id(pattern_id)

            if not pattern:
                continue

            # Check success rate
            if pattern["success_rate"] < min_success_rate:
                continue

            patterns_with_scores.append({
                "pattern": pattern,
                "similarity": 1 - results["distances"][0][i],  # Convert distance to similarity
                "matched_via": "vector"
            })

        # Update usage counts
        for item in patterns_with_scores[:top_k]:
            pattern = item["pattern"]
            pattern["usage_count"] += 1
            pattern["last_used"] = datetime.now().isoformat()

        self._save_patterns()

        # Sort by similarity
        patterns_with_scores.sort(key=lambda x: x["similarity"], reverse=True)

        return patterns_with_scores[:top_k]

    def _recall_keywords(
        self,
        query: str,
        category: Optional[str],
        top_k: int,
        min_success_rate: float
    ) -> List[Dict[str, Any]]:
        """Recall patterns using keyword matching"""
        query_words = set(query.lower().split())

        scored_patterns = []

        for pattern_id in self.patterns["patterns"]:
            # Filter by category
            if category and pattern["category"] != category:
                continue

            # Filter by success rate
            if pattern["success_rate"] < min_success_rate:
                continue

            # Calculate keyword overlap
            pattern_words = set(pattern["pattern"].lower().split())
            overlap = len(query_words & pattern_words)

            if overlap > 0:
                scored_patterns.append({
                    "pattern": pattern,
                    "similarity": overlap / len(query_words),
                    "matched_via": "keywords"
                })

        # Sort by similarity
        scored_patterns.sort(key=lambda x: x["similarity"], reverse=True)

        # Update usage counts
        for item in scored_patterns[:top_k]:
            pattern = item["pattern"]
            pattern["usage_count"] += 1
            pattern["last_used"] = datetime.now().isoformat()

        self._save_patterns()

        return scored_patterns[:top_k]

    def _get_pattern_by_id(self, pattern_id: str) -> Optional[Dict[str, Any]]:
        """Get pattern by ID"""
        for pattern in self.patterns["patterns"]:
            if pattern["id"] == pattern_id:
                return pattern
        return None

    def extract_pattern_from_episode(
        self,
        episode: Dict[str, Any],
        category: str,
        pattern_template: str
    ) -> str:
        """
        Extract generalized pattern from specific episode.

        Args:
            episode: Episode dict from episodic memory
            category: Pattern category
            pattern_template: Template for pattern (e.g., "Create {X} with {Y}")

        Returns:
            Pattern ID
        """
        task_desc = episode["task"]["description"]

        # Simple pattern extraction (can be enhanced with LLM)
        # Remove specific details to create generalized pattern
        generalized = self._generalize_task(task_desc)

        return self.store_pattern(
            pattern=generalized,
            category=category,
            source_task=task_desc,
            success_rate=episode["result"]["success"],
            metadata={"episode_id": episode["id"]}
        )

    def _generalize_task(self, task_description: str) -> str:
        """
        Generalize task description by removing specific details.

        Example: "Create React component for user profile with name and email"
        -> "Create React component for displaying user information"
        """
        # Simple heuristic: remove quoted text and proper nouns
        # In production, use LLM for better generalization

        generalized = task_description

        # Remove quoted strings (specific values)
        generalized = re.sub(r'"[^"]*"', "'X'", generalized)
        generalized = re.sub(r"'[^']*'", "'X'", generalized)

        # Capitalize first letter
        generalized = generalized[0].upper() + generalized[1:]

        return generalized

    def get_patterns_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all patterns in a category"""
        pattern_ids = self.patterns["categories"].get(category, [])

        patterns = []
        for pattern_id in pattern_ids:
            pattern = self._get_pattern_by_id(pattern_id)
            if pattern:
                patterns.append(pattern)

        return sorted(patterns, key=lambda p: p["success_rate"], reverse=True)

    def get_stats(self) -> Dict[str, Any]:
        """Get semantic memory statistics"""
        total_patterns = len(self.patterns["patterns"])

        # Calculate category distribution
        category_counts = {
            cat: len(ids)
            for cat, ids in self.patterns["categories"].items()
        }

        # Calculate average success rate
        if total_patterns > 0:
            avg_success = sum(
                p["success_rate"] for p in self.patterns["patterns"]
            ) / total_patterns
        else:
            avg_success = 0.0

        return {
            "total_patterns": total_patterns,
            "categories": category_counts,
            "avg_success_rate": avg_success,
            "using_chromadb": self.use_chromadb,
            "chromadb_collection": self.collection_name if self.use_chromadb else None
        }

    def export_patterns(
        self,
        output_path: str,
        category: Optional[str] = None
    ):
        """
        Export patterns to JSON file.

        Args:
            output_path: Path to output file
            category: Filter by category
        """
        patterns = []

        for pattern in self.patterns["patterns"]:
            if category and pattern["category"] != category:
                continue

            patterns.append(pattern)

        # Write to output
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(patterns, f, indent=2)

        print(f"Exported {len(patterns)} patterns to {output_path}")

    def cleanup_low_success_patterns(self, min_success_rate: float = 0.3):
        """
        Remove patterns with low success rates.

        Args:
            min_success_rate: Minimum success rate threshold
        """
        original_count = len(self.patterns["patterns"])

        # Filter patterns
        self.patterns["patterns"] = [
            p for p in self.patterns["patterns"]
            if p["success_rate"] >= min_success_rate
        ]

        # Rebuild category index
        self.patterns["categories"] = {}
        for pattern in self.patterns["patterns"]:
            category = pattern["category"]
            if category not in self.patterns["categories"]:
                self.patterns["categories"][category] = []
            self.patterns["categories"][category].append(pattern["id"])

        self._save_patterns()

        removed_count = original_count - len(self.patterns["patterns"])
        print(f"Removed {removed_count} low-success patterns")


# Import regex at module level
import re
