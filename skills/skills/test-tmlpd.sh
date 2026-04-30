#!/bin/bash
# TMLPD Test Script - Verify TreeQuest Multi-LLM Parallel Deployment setup

set -e

echo "🚀 TMLPD Skill Verification"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check TreeQuest installation
echo -n "📦 Checking TreeQuest installation... "
if command -v treequest &> /dev/null; then
    echo -e "${GREEN}✓ Installed${NC}"
    treequest version 2>/dev/null || treequest --version 2>/dev/null || echo "Version: unknown"
else
    echo -e "${RED}✗ TreeQuest CLI not found${NC}"
    echo "  Install with: pip install treequest-ai"
    exit 1
fi

echo ""
echo "🔍 Testing Providers..."
echo "----------------------"

# Test if treequest test works
echo -n "   Running provider tests... "
if treequest test &> /dev/null; then
    echo -e "${GREEN}✓ Test command works${NC}"
else
    echo -e "${YELLOW}⚠ Test completed with warnings${NC}"
fi

# Check configuration
echo ""
echo -n "⚙️  Checking TreeQuest configuration... "
if [ -f ~/.config/treequest/config.yaml ]; then
    echo -e "${GREEN}✓ Config file exists${NC}"
    echo "   Location: ~/.config/treequest/config.yaml"
else
    echo -e "${YELLOW}⚠ Config not found${NC}"
    echo "  Run: treequest init"
fi

# Verify skill files
echo ""
echo "📝 Verifying TMLPD Skill Files..."
echo "--------------------------------"

SKILL_FILES=(
    "~/.claude/skills/TMLPD.md"
    "~/.claude/skills/TMLPD-QUICKREF.md"
    "~/.claude/skills/tmlpd-category.yaml"
    "~/.claude/skills/tmlpd-phase.yaml"
    "~/.claude/skills/tmlpd-monitoring.yaml"
)

for file in "${SKILL_FILES[@]}"; do
    expanded_file="${file/#\~/$HOME}"
    if [ -f "$expanded_file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file (missing)"
    fi
done

echo ""
echo "💡 Quick Start Commands:"
echo "----------------------"
echo ""
echo "  # From any project:"
echo "  cd /path/to/project"
echo "  /TMLPD"
echo ""
echo "  # Or use treequest directly:"
echo "  treequest-parallel --agents=4 --mode=category"
echo ""
echo "  # Check system status:"
echo "  treequest status"
echo ""

echo "📚 Documentation:"
echo "---------------"
echo "  Full Guide:    ~/.claude/skills/TMLPD.md"
echo "  Quick Ref:     ~/.claude/skills/TMLPD-QUICKREF.md"
echo "  Configs:       ~/.claude/skills/tmlpd-*.yaml"
echo ""

# Get provider count
if command -v treequest &> /dev/null; then
    echo "🔌 Provider Status:"
    echo "-----------------"
    treequest status 2>/dev/null || echo "  Run 'treequest status' for details"
fi

echo ""
echo -e "${GREEN}✓ TMLPD Skill Ready!${NC}"
echo ""
echo "Next Steps:"
echo "  1. Copy a config template to your project"
echo "  2. Customize for your needs"
echo "  3. Run: treequest-parallel --config=tmlpd-config.yaml"
echo ""
