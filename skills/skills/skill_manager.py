"""
SkillManager - Agent Skills Management System

Implements Anthropic's Agent Skills specification with progressive disclosure.

Based on:
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

Progressive Disclosure Levels:
  Level 1: Metadata (name, description) - loaded at startup
  Level 2: SKILL.md content - loaded when relevant
  Level 3: Additional files - loaded on-demand
"""

from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, field
import yaml
import json
import re
from datetime import datetime


@dataclass
class Skill:
    """Represents an Agent Skill"""
    name: str
    description: str
    directory: Path
    metadata: Dict[str, str] = field(default_factory=dict)
    content: Optional[str] = None
    loaded_at: Optional[datetime] = None

    def to_dict(self) -> Dict:
        """Convert skill to dictionary"""
        return {
            "name": self.name,
            "description": self.description,
            "directory": str(self.directory),
            "metadata": self.metadata,
            "loaded": self.content is not None,
            "loaded_at": self.loaded_at.isoformat() if self.loaded_at else None
        }


class SkillManager:
    """
    Manages Agent Skills following Anthropic's specification.
    Implements progressive disclosure for efficient context loading.
    """

    def __init__(self, skills_dir: str = "tmlpd-skills"):
        """
        Initialize SkillManager

        Args:
            skills_dir: Directory containing skill folders
        """
        self.skills_dir = Path(skills_dir)
        self.skills: Dict[str, Skill] = {}
        self._load_skills_metadata()

    def _load_skills_metadata(self):
        """
        Load Level 1: Metadata only (name, description)
        This is loaded into system prompt at startup.
        """

        if not self.skills_dir.exists():
            return

        for skill_dir in self.skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue

            skill_md = skill_dir / "SKILL.md"

            if not skill_md.exists():
                continue

            # Parse YAML frontmatter
            try:
                with open(skill_md, "r", encoding="utf-8") as f:
                    content = f.read()

                # Extract YAML frontmatter
                if content.startswith("---"):
                    parts = content.split("---", 2)
                    if len(parts) >= 3:
                        frontmatter = parts[1]
                        metadata = yaml.safe_load(frontmatter)
                    else:
                        continue
                else:
                    continue

                self.skills[metadata["name"]] = Skill(
                    name=metadata["name"],
                    description=metadata["description"],
                    directory=skill_dir,
                    metadata=metadata
                )
            except Exception as e:
                print(f"Warning: Failed to load skill from {skill_dir}: {e}")
                continue

    def list_skills(self) -> List[str]:
        """
        List all available skills (Level 1 metadata)

        Returns:
            List of skill names
        """
        return list(self.skills.keys())

    def get_skill_info(self, skill_name: str) -> Optional[Dict]:
        """
        Get skill metadata without loading full content

        Args:
            skill_name: Name of the skill

        Returns:
            Dictionary with skill info or None if not found
        """
        if skill_name not in self.skills:
            return None

        return self.skills[skill_name].to_dict()

    def get_relevant_skills(
        self,
        task: str,
        top_k: int = 3,
        threshold: float = 0.1
    ) -> List[str]:
        """
        Find relevant skills based on task description.
        Uses keyword matching with scoring.

        Args:
            task: Task description
            top_k: Maximum number of skills to return
            threshold: Minimum relevance threshold (0-1)

        Returns:
            List of relevant skill names
        """
        task_lower = task.lower()
        task_words = set(re.findall(r'\w+', task_lower))

        if not task_words:
            return []

        relevant = []

        for skill_name, skill in self.skills.items():
            # Check if task keywords match skill description
            skill_desc_lower = skill.description.lower()
            skill_words = set(re.findall(r'\w+', skill_desc_lower))

            # Calculate Jaccard similarity
            intersection = task_words & skill_words
            union = task_words | skill_words

            if union:
                similarity = len(intersection) / len(union)
            else:
                similarity = 0.0

            # Also check for keyword containment
            contains_score = sum(1 for word in task_words if word in skill_desc_lower)
            combined_score = similarity + (contains_score * 0.1)

            if combined_score >= threshold:
                relevant.append((skill_name, combined_score))

        # Sort by relevance and return top_k
        relevant.sort(key=lambda x: x[1], reverse=True)
        return [skill_name for skill_name, _ in relevant[:top_k]]

    def load_skill(self, skill_name: str) -> Skill:
        """
        Load Level 2: Full SKILL.md content
        Called only when skill is relevant to current task.

        Args:
            skill_name: Name of the skill to load

        Returns:
            Skill with loaded content

        Raises:
            ValueError: If skill not found
        """
        if skill_name not in self.skills:
            raise ValueError(f"Skill '{skill_name}' not found")

        skill = self.skills[skill_name]

        # Return cached if already loaded
        if skill.content is not None:
            return skill

        skill_md = skill.directory / "SKILL.md"

        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                content = f.read()

            # Skip YAML frontmatter, get content
            if "---" in content:
                _, _, content = content.split("---", 2)

            skill.content = content.strip()
            skill.loaded_at = datetime.now()

            return skill
        except Exception as e:
            raise IOError(f"Failed to load skill '{skill_name}': {e}")

    def load_additional_file(self, skill_name: str, filename: str) -> str:
        """
        Load Level 3: Additional files from skill
        Progressive disclosure - load only when needed.

        Args:
            skill_name: Name of the skill
            filename: Name of the additional file

        Returns:
            File content

        Raises:
            ValueError: If skill not found
            FileNotFoundError: If file not found in skill directory
        """
        if skill_name not in self.skills:
            raise ValueError(f"Skill '{skill_name}' not found")

        skill = self.skills[skill_name]
        additional_file = skill.directory / filename

        if not additional_file.exists():
            raise FileNotFoundError(
                f"File '{filename}' not found in skill '{skill_name}'"
            )

        try:
            with open(additional_file, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            raise IOError(
                f"Failed to load file '{filename}' from skill '{skill_name}': {e}"
            )

    def list_additional_files(self, skill_name: str) -> List[str]:
        """
        List all additional files available in a skill

        Args:
            skill_name: Name of the skill

        Returns:
            List of filenames (excluding SKILL.md)
        """
        if skill_name not in self.skills:
            return []

        skill = self.skills[skill_name]

        files = []
        for file_path in skill.directory.iterdir():
            if file_path.is_file() and file_path.name != "SKILL.md":
                # Skip subdirectories and hidden files
                if not file_path.name.startswith("."):
                    files.append(file_path.name)

        return sorted(files)

    def get_skills_summary(self) -> Dict[str, Dict]:
        """
        Get summary of all skills with their metadata

        Returns:
            Dictionary mapping skill names to their info
        """
        return {
            name: skill.to_dict()
            for name, skill in self.skills.items()
        }

    def reload_skills(self):
        """
        Reload all skills from disk
        Useful for dynamic skill updates
        """
        self.skills.clear()
        self._load_skills_metadata()

    def validate_skill(self, skill_name: str) -> Dict[str, bool]:
        """
        Validate a skill's structure

        Args:
            skill_name: Name of the skill to validate

        Returns:
            Dictionary with validation results
        """
        if skill_name not in self.skills:
            return {
                "exists": False,
                "has_skill_md": False,
                "valid_yaml": False,
                "has_name": False,
                "has_description": False
            }

        skill = self.skills[skill_name]
        skill_md = skill.directory / "SKILL.md"

        validation = {
            "exists": True,
            "has_skill_md": skill_md.exists(),
            "valid_yaml": "name" in skill.metadata and "description" in skill.metadata,
            "has_name": "name" in skill.metadata,
            "has_description": "description" in skill.metadata,
            "has_additional_files": len(self.list_additional_files(skill_name)) > 0
        }

        return validation

    def create_skill_template(self, skill_name: str, output_dir: Optional[str] = None):
        """
        Create a template for a new skill

        Args:
            skill_name: Name for the new skill
            output_dir: Directory to create skill in (default: skills_dir/<skill_name>)
        """
        if output_dir is None:
            output_dir = self.skills_dir / skill_name.lower().replace(" ", "_")
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        skill_md = output_dir / "SKILL.md"

        template = f"""---
name: "{skill_name}"
description: "A brief description of what this skill does"
---

# {skill_name}

## Overview

Provide a brief overview of this skill and when it should be used.

## Core Principles

List the key principles that this skill follows.

## Common Patterns

Describe common patterns or approaches used in this skill.

## When to Use This Skill

Trigger this skill when:
- Condition 1
- Condition 2
- Condition 3

## Examples

Provide examples of when to use this skill.
"""

        with open(skill_md, "w", encoding="utf-8") as f:
            f.write(template)

        return skill_md
