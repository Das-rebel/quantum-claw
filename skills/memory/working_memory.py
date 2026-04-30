"""
Phase 3c: Working Memory Cache

In-memory cache for active session context and frequently accessed data.
Based on Memoria framework (arXiv:2512.12686) working memory component.
"""

import time
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from collections import OrderedDict


class WorkingMemoryCache:
    """
    Working memory: Fast in-memory cache for active session context.

    Based on Memoria framework (arXiv:2512.12686)

    Features:
    - LRU (Least Recently Used) eviction policy
    - TTL (Time To Live) for automatic expiration
    - Session-based context tracking
    - Fast lookups (< 1ms)
    - Persistent across operations in a session
    """

    def __init__(
        self,
        max_size: int = 1000,
        default_ttl_seconds: int = 3600
    ):
        """
        Initialize working memory cache.

        Args:
            max_size: Maximum number of items to store
            default_ttl_seconds: Default time-to-live for cache entries
        """
        self.max_size = max_size
        self.default_ttl = default_ttl_seconds

        # Main cache (OrderedDict for LRU)
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()

        # Session context
        self.session_context: Dict[str, Any] = {
            "session_start": datetime.now().isoformat(),
            "operations_count": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }

        # Indexes for faster queries
        self.tag_index: Dict[str, set] = {}  # tag -> set of keys
        self.category_index: Dict[str, set] = {}  # category -> set of keys

    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        tags: Optional[List[str]] = None,
        category: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        """
        Store value in cache.

        Args:
            key: Cache key
            value: Value to store (must be JSON-serializable)
            ttl: Time-to-live in seconds (uses default if not specified)
            tags: Optional tags for categorization
            category: Optional category
            metadata: Optional metadata
        """
        # Check if we need to evict
        if len(self.cache) >= self.max_size and key not in self.cache:
            self._evict_lru()

        # Calculate expiration
        ttl = ttl if ttl is not None else self.default_ttl
        expires_at = datetime.now() + timedelta(seconds=ttl)

        # Create cache entry
        entry = {
            "value": value,
            "created_at": datetime.now().isoformat(),
            "expires_at": expires_at.isoformat(),
            "accessed_at": datetime.now().isoformat(),
            "access_count": 0,
            "tags": tags or [],
            "category": category,
            "metadata": metadata or {},
            "size_bytes": len(str(value))  # Approximate size
        }

        # Remove from indexes if updating existing key
        if key in self.cache:
            self._remove_from_indexes(key)

        # Add to cache
        self.cache[key] = entry

        # Move to end (most recently used)
        self.cache.move_to_end(key)

        # Update indexes
        self._add_to_indexes(key, entry)

    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        # Check if key exists
        if key not in self.cache:
            self.session_context["cache_misses"] += 1
            return None

        entry = self.cache[key]

        # Check if expired
        if self._is_expired(entry):
            # Remove expired entry
            del self.cache[key]
            self._remove_from_indexes(key)
            self.session_context["cache_misses"] += 1
            return None

        # Update access statistics
        entry["accessed_at"] = datetime.now().isoformat()
        entry["access_count"] += 1

        # Move to end (most recently used)
        self.cache.move_to_end(key)

        self.session_context["cache_hits"] += 1

        return entry["value"]

    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple values from cache.

        Args:
            keys: List of cache keys

        Returns:
            Dict of key -> value (only for found keys)
        """
        result = {}

        for key in keys:
            value = self.get(key)
            if value is not None:
                result[key] = value

        return result

    def set_many(self, items: Dict[str, Any], **kwargs):
        """
        Store multiple values in cache.

        Args:
            items: Dict of key -> value
            **kwargs: Additional arguments passed to set()
        """
        for key, value in items.items():
            self.set(key, value, **kwargs)

    def delete(self, key: str) -> bool:
        """
        Delete entry from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted, False if not found
        """
        if key in self.cache:
            del self.cache[key]
            self._remove_from_indexes(key)
            return True

        return False

    def clear(self):
        """Clear all cache entries"""
        self.cache.clear()
        self.tag_index.clear()
        self.category_index.clear()

    def get_by_tag(self, tag: str) -> List[Any]:
        """
        Get all entries with a specific tag.

        Args:
            tag: Tag to search for

        Returns:
            List of values with that tag
        """
        if tag not in self.tag_index:
            return []

        values = []
        keys_to_remove = []

        for key in self.tag_index[tag]:
            value = self.get(key)
            if value is not None:
                values.append(value)
            else:
                keys_to_remove.append(key)

        # Clean up expired keys from index
        for key in keys_to_remove:
            self.tag_index[tag].discard(key)

        return values

    def get_by_category(self, category: str) -> List[Any]:
        """
        Get all entries in a specific category.

        Args:
            category: Category to search for

        Returns:
            List of values in that category
        """
        if category not in self.category_index:
            return []

        values = []
        keys_to_remove = []

        for key in self.category_index[category]:
            value = self.get(key)
            if value is not None:
                values.append(value)
            else:
                keys_to_remove.append(key)

        # Clean up expired keys from index
        for key in keys_to_remove:
            self.category_index[category].discard(key)

        return values

    def search(
        self,
        query: str,
        search_values: bool = True,
        search_keys: bool = False,
        search_metadata: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Search cache for entries matching query.

        Args:
            query: Search query (simple string matching)
            search_values: Search in values
            search_keys: Search in keys
            search_metadata: Search in metadata

        Returns:
            List of matching entries with keys
        """
        results = []
        query_lower = query.lower()

        for key, entry in self.cache.items():
            # Skip expired
            if self._is_expired(entry):
                continue

            # Search key
            if search_keys and query_lower in key.lower():
                results.append({"key": key, "value": entry["value"]})
                continue

            # Search value
            if search_values and query_lower in str(entry["value"]).lower():
                results.append({"key": key, "value": entry["value"]})
                continue

            # Search metadata
            if search_metadata:
                metadata_str = str(entry["metadata"])
                if query_lower in metadata_str.lower():
                    results.append({"key": key, "value": entry["value"]})
                    continue

        return results

    def cleanup_expired(self):
        """Remove all expired entries"""
        keys_to_remove = []

        for key, entry in self.cache.items():
            if self._is_expired(entry):
                keys_to_remove.append(key)

        for key in keys_to_remove:
            del self.cache[key]
            self._remove_from_indexes(key)

        return len(keys_to_remove)

    def _evict_lru(self):
        """Evict least recently used entry"""
        if self.cache:
            # First item is least recently used
            lru_key = next(iter(self.cache))
            del self.cache[lru_key]
            self._remove_from_indexes(lru_key)

    def _is_expired(self, entry: Dict[str, Any]) -> bool:
        """Check if entry is expired"""
        expires_at = datetime.fromisoformat(entry["expires_at"])
        return datetime.now() > expires_at

    def _add_to_indexes(self, key: str, entry: Dict[str, Any]):
        """Add entry to tag and category indexes"""
        # Tag index
        for tag in entry.get("tags", []):
            if tag not in self.tag_index:
                self.tag_index[tag] = set()
            self.tag_index[tag].add(key)

        # Category index
        category = entry.get("category")
        if category:
            if category not in self.category_index:
                self.category_index[category] = set()
            self.category_index[category].add(key)

    def _remove_from_indexes(self, key: str):
        """Remove entry from tag and category indexes"""
        # Tag index
        for tag_set in self.tag_index.values():
            tag_set.discard(key)

        # Category index
        for category_set in self.category_index.values():
            category_set.discard(key)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        # Calculate total size
        total_size_bytes = sum(
            entry["size_bytes"] for entry in self.cache.values()
        )

        # Calculate hit rate
        total_requests = (
            self.session_context["cache_hits"] +
            self.session_context["cache_misses"]
        )
        hit_rate = (
            self.session_context["cache_hits"] / total_requests
            if total_requests > 0 else 0
        )

        # Calculate avg access count
        if self.cache:
            avg_access_count = sum(
                entry["access_count"] for entry in self.cache.values()
            ) / len(self.cache)
        else:
            avg_access_count = 0

        # Session duration
        session_start = datetime.fromisoformat(self.session_context["session_start"])
        session_duration = (datetime.now() - session_start).total_seconds()

        return {
            "cache_size": len(self.cache),
            "max_size": self.max_size,
            "total_size_bytes": total_size_bytes,
            "total_size_mb": total_size_bytes / (1024 * 1024),
            "hit_rate": hit_rate,
            "cache_hits": self.session_context["cache_hits"],
            "cache_misses": self.session_context["cache_misses"],
            "avg_access_count": avg_access_count,
            "tags_count": len(self.tag_index),
            "categories_count": len(self.category_index),
            "session_duration_seconds": session_duration,
            "operations_count": self.session_context["operations_count"]
        }

    def export_cache(self, include_expired: bool = False) -> List[Dict[str, Any]]:
        """
        Export cache entries as list.

        Args:
            include_expired: Whether to include expired entries

        Returns:
            List of cache entries
        """
        entries = []

        for key, entry in self.cache.items():
            # Skip expired if requested
            if not include_expired and self._is_expired(entry):
                continue

            entry_copy = entry.copy()
            entry_copy["key"] = key
            entries.append(entry_copy)

        return entries

    def import_cache(self, entries: List[Dict[str, Any]]):
        """
        Import cache entries from list.

        Args:
            entries: List of cache entries (from export_cache)
        """
        for entry in entries:
            key = entry.pop("key")
            value = entry.pop("value")

            self.set(key, value, **entry)

    def __len__(self):
        """Get cache size"""
        return len(self.cache)

    def __contains__(self, key: str):
        """Check if key exists in cache"""
        return key in self.cache and not self._is_expired(self.cache[key])

    def __repr__(self):
        """String representation"""
        return f"WorkingMemoryCache(size={len(self.cache)}, max_size={self.max_size})"
