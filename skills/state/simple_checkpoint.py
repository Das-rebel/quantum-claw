"""
Simple Checkpoint System - Workflow Phase 4

Implements lightweight JSON-based checkpointing for state management.
No complex versioning or branching - just save and restore.

Philosophy:
- Save state at critical points
- Easy recovery from failures
- Minimal overhead (plain JSON)
- Transparent and debuggable
"""

from typing import Dict, List, Any, Optional
from pathlib import Path
import json
from datetime import datetime
import shutil
import hashlib


class SimpleCheckpoint:
    """
    Simple checkpoint system for state management.

    Features:
    - Save checkpoints with metadata
    - List available checkpoints
    - Restore from checkpoint
    - Automatic cleanup of old checkpoints
    - Checkpoint validation
    """

    def __init__(
        self,
        checkpoint_dir: str = ".taskmaster/checkpoints",
        max_checkpoints: int = 10
    ):
        """
        Initialize Simple Checkpoint

        Args:
            checkpoint_dir: Directory to store checkpoints
            max_checkpoints: Maximum number of checkpoints to keep
        """
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.max_checkpoints = max_checkpoints
        self.index_file = self.checkpoint_dir / "index.json"

        self.index = self._load_index()

        self.stats = {
            "checkpoints_created": 0,
            "checkpoints_restored": 0,
            "checkpoints_deleted": 0
        }

    def _load_index(self) -> Dict[str, Any]:
        """Load checkpoint index"""
        if self.index_file.exists():
            try:
                with open(self.index_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Warning: Failed to load checkpoint index: {e}")
                return self._empty_index()

        return self._empty_index()

    def _empty_index(self) -> Dict[str, Any]:
        """Create empty checkpoint index"""
        return {
            "version": "1.0",
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "checkpoints": []
        }

    def _save_index(self):
        """Save checkpoint index"""
        self.index["last_updated"] = datetime.now().isoformat()

        with open(self.index_file, 'w') as f:
            json.dump(self.index, f, indent=2)

    def _generate_checksum(self, data: Dict[str, Any]) -> str:
        """
        Generate checksum for checkpoint data.

        Args:
            data: Checkpoint data

        Returns:
            SHA256 hex digest
        """
        data_str = json.dumps(data, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

    def create_checkpoint(
        self,
        state: Dict[str, Any],
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a checkpoint.

        Args:
            state: Current state to save
            name: Optional checkpoint name
            description: Optional checkpoint description
            metadata: Optional additional metadata

        Returns:
            Checkpoint ID
        """
        checkpoint_id = f"checkpoint_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

        # Generate checksum
        checksum = self._generate_checksum(state)

        checkpoint = {
            "id": checkpoint_id,
            "name": name or checkpoint_id,
            "description": description or "",
            "created_at": datetime.now().isoformat(),
            "checksum": checksum,
            "metadata": metadata or {},
            "state": state
        }

        # Save checkpoint file
        checkpoint_file = self.checkpoint_dir / f"{checkpoint_id}.json"
        with open(checkpoint_file, 'w') as f:
            json.dump(checkpoint, f, indent=2)

        # Update index
        self.index["checkpoints"].append({
            "id": checkpoint_id,
            "name": name or checkpoint_id,
            "description": description or "",
            "created_at": checkpoint["created_at"],
            "checksum": checksum,
            "file": str(checkpoint_file),
            "metadata": metadata or {}
        })

        # Cleanup old checkpoints
        self._cleanup_old_checkpoints()

        self._save_index()
        self.stats["checkpoints_created"] += 1

        return checkpoint_id

    def restore_checkpoint(
        self,
        checkpoint_id: Optional[str] = None,
        name: Optional[str] = None,
        validate: bool = True
    ) -> Dict[str, Any]:
        """
        Restore from a checkpoint.

        Args:
            checkpoint_id: Checkpoint ID to restore
            name: Checkpoint name to restore (alternative to ID)
            validate: Whether to validate checksum

        Returns:
            Restored state

        Raises:
            FileNotFoundError: If checkpoint not found
            ValueError: If validation fails
        """
        # Find checkpoint
        checkpoint_info = None

        if checkpoint_id:
            checkpoint_info = next(
                (cp for cp in self.index["checkpoints"] if cp["id"] == checkpoint_id),
                None
            )
        elif name:
            checkpoint_info = next(
                (cp for cp in self.index["checkpoints"] if cp["name"] == name),
                None
            )
        else:
            # Get most recent checkpoint
            if self.index["checkpoints"]:
                checkpoint_info = self.index["checkpoints"][-1]

        if not checkpoint_info:
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_id or name}")

        # Load checkpoint file
        checkpoint_file = Path(checkpoint_info["file"])

        if not checkpoint_file.exists():
            raise FileNotFoundError(f"Checkpoint file not found: {checkpoint_file}")

        with open(checkpoint_file, 'r') as f:
            checkpoint = json.load(f)

        # Validate checksum if requested
        if validate:
            current_checksum = self._generate_checksum(checkpoint["state"])
            if current_checksum != checkpoint["checksum"]:
                raise ValueError(
                    f"Checksum mismatch: expected {checkpoint['checksum']}, got {current_checksum}"
                )

        self.stats["checkpoints_restored"] += 1

        return checkpoint["state"]

    def list_checkpoints(
        self,
        sort_by: str = "created_at",
        reverse: bool = True
    ) -> List[Dict[str, Any]]:
        """
        List all checkpoints.

        Args:
            sort_by: Field to sort by ("created_at", "name")
            reverse: Sort order (descending if True)

        Returns:
            List of checkpoint info dictionaries
        """
        checkpoints = self.index["checkpoints"].copy()

        if sort_by == "created_at":
            checkpoints.sort(key=lambda x: x["created_at"], reverse=reverse)
        elif sort_by == "name":
            checkpoints.sort(key=lambda x: x["name"], reverse=reverse)

        return checkpoints

    def get_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """
        Get the most recent checkpoint.

        Returns:
            Latest checkpoint info or None
        """
        if not self.index["checkpoints"]:
            return None

        return self.index["checkpoints"][-1]

    def delete_checkpoint(
        self,
        checkpoint_id: Optional[str] = None,
        name: Optional[str] = None
    ):
        """
        Delete a checkpoint.

        Args:
            checkpoint_id: Checkpoint ID to delete
            name: Checkpoint name to delete (alternative to ID)
        """
        # Find checkpoint
        checkpoint_info = None

        if checkpoint_id:
            checkpoint_info = next(
                (cp for cp in self.index["checkpoints"] if cp["id"] == checkpoint_id),
                None
            )
        elif name:
            checkpoint_info = next(
                (cp for cp in self.index["checkpoints"] if cp["name"] == name),
                None
            )

        if not checkpoint_info:
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_id or name}")

        # Delete file
        checkpoint_file = Path(checkpoint_info["file"])
        if checkpoint_file.exists():
            checkpoint_file.unlink()

        # Remove from index
        self.index["checkpoints"].remove(checkpoint_info)

        self._save_index()
        self.stats["checkpoints_deleted"] += 1

    def _cleanup_old_checkpoints(self):
        """Delete oldest checkpoints if exceeding max_checkpoints"""
        while len(self.index["checkpoints"]) > self.max_checkpoints:
            oldest = self.index["checkpoints"][0]

            # Delete file
            checkpoint_file = Path(oldest["file"])
            if checkpoint_file.exists():
                checkpoint_file.unlink()

            # Remove from index
            self.index["checkpoints"].remove(oldest)

            self.stats["checkpoints_deleted"] += 1

    def clear_all_checkpoints(self):
        """Delete all checkpoints"""
        for checkpoint_info in self.index["checkpoints"]:
            checkpoint_file = Path(checkpoint_info["file"])
            if checkpoint_file.exists():
                checkpoint_file.unlink()

        self.index["checkpoints"] = []
        self._save_index()

        print(f"Cleared all checkpoints")

    def validate_all_checkpoints(self) -> Dict[str, Any]:
        """
        Validate all checkpoints.

        Returns:
            Validation report with valid/invalid checkpoints
        """
        results = {
            "total": len(self.index["checkpoints"]),
            "valid": 0,
            "invalid": 0,
            "invalid_checkpoints": []
        }

        for checkpoint_info in self.index["checkpoints"]:
            checkpoint_file = Path(checkpoint_info["file"])

            if not checkpoint_file.exists():
                results["invalid"] += 1
                results["invalid_checkpoints"].append({
                    "id": checkpoint_info["id"],
                    "reason": "File not found"
                })
                continue

            try:
                with open(checkpoint_file, 'r') as f:
                    checkpoint = json.load(f)

                # Validate checksum
                current_checksum = self._generate_checksum(checkpoint["state"])
                if current_checksum != checkpoint["checksum"]:
                    results["invalid"] += 1
                    results["invalid_checkpoints"].append({
                        "id": checkpoint_info["id"],
                        "reason": "Checksum mismatch"
                    })
                else:
                    results["valid"] += 1

            except Exception as e:
                results["invalid"] += 1
                results["invalid_checkpoints"].append({
                    "id": checkpoint_info["id"],
                    "reason": str(e)
                })

        return results

    def export_checkpoint(
        self,
        checkpoint_id: str,
        export_path: str
    ):
        """
        Export a checkpoint to a file.

        Args:
            checkpoint_id: Checkpoint ID to export
            export_path: Path to export to
        """
        checkpoint_info = next(
            (cp for cp in self.index["checkpoints"] if cp["id"] == checkpoint_id),
            None
        )

        if not checkpoint_info:
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_id}")

        checkpoint_file = Path(checkpoint_info["file"])
        export_path = Path(export_path)

        shutil.copy2(checkpoint_file, export_path)

        print(f"Checkpoint exported to {export_path}")

    def import_checkpoint(
        self,
        import_path: str,
        name: Optional[str] = None
    ) -> str:
        """
        Import a checkpoint from a file.

        Args:
            import_path: Path to import from
            name: Optional name for imported checkpoint

        Returns:
            Checkpoint ID
        """
        import_path = Path(import_path)

        if not import_path.exists():
            raise FileNotFoundError(f"Import file not found: {import_path}")

        with open(import_path, 'r') as f:
            checkpoint = json.load(f)

        # Generate new ID
        checkpoint_id = f"checkpoint_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        checkpoint["id"] = checkpoint_id
        checkpoint["name"] = name or checkpoint.get("name", checkpoint_id)
        checkpoint["imported_at"] = datetime.now().isoformat()

        # Save checkpoint file
        checkpoint_file = self.checkpoint_dir / f"{checkpoint_id}.json"
        with open(checkpoint_file, 'w') as f:
            json.dump(checkpoint, f, indent=2)

        # Update index
        self.index["checkpoints"].append({
            "id": checkpoint_id,
            "name": checkpoint["name"],
            "description": checkpoint.get("description", ""),
            "created_at": checkpoint["created_at"],
            "checksum": checkpoint["checksum"],
            "file": str(checkpoint_file),
            "metadata": checkpoint.get("metadata", {})
        })

        # Cleanup old checkpoints
        self._cleanup_old_checkpoints()

        self._save_index()
        self.stats["checkpoints_created"] += 1

        return checkpoint_id

    def get_stats(self) -> Dict[str, Any]:
        """
        Get checkpoint statistics.

        Returns:
            Statistics dictionary
        """
        return {
            **self.stats,
            "total_checkpoints": len(self.index["checkpoints"]),
            "checkpoint_dir": str(self.checkpoint_dir),
            "max_checkpoints": self.max_checkpoints
        }


# Convenience functions for quick checkpoint operations

def save_checkpoint(
    state: Dict[str, Any],
    name: Optional[str] = None,
    checkpoint_dir: str = ".taskmaster/checkpoints"
) -> str:
    """
    Quick function to save a checkpoint.

    Args:
        state: State to save
        name: Optional checkpoint name
        checkpoint_dir: Checkpoint directory

    Returns:
        Checkpoint ID
    """
    checkpoint = SimpleCheckpoint(checkpoint_dir)
    return checkpoint.create_checkpoint(state, name=name)


def load_checkpoint(
    checkpoint_id: Optional[str] = None,
    name: Optional[str] = None,
    checkpoint_dir: str = ".taskmaster/checkpoints"
) -> Dict[str, Any]:
    """
    Quick function to load a checkpoint.

    Args:
        checkpoint_id: Checkpoint ID to load
        name: Checkpoint name to load
        checkpoint_dir: Checkpoint directory

    Returns:
        Restored state
    """
    checkpoint = SimpleCheckpoint(checkpoint_dir)
    return checkpoint.restore_checkpoint(checkpoint_id=checkpoint_id, name=name)
