# TMLPD Quick Reference Guide

## What is TMLPD?

**TreeQuest Multi-LLM Parallel Deployment** - A skill for deploying multiple AI agents in parallel across different LLM providers to accelerate development.

## Quick Start

```bash
# From any project directory
cd /path/to/project

# Deploy 4 parallel agents (quick start)
treequest-parallel --agents=4 --mode=category --background

# Check system status first
treequest test  # Verify all providers working
treequest status  # Quick health check
```

## Common Use Cases

### 1. Brain Spark Project Enhancement
```bash
cd ~/brain-spark-analysis-project

# Deploy for testing tasks
treequest-parallel \
  --agents=4 \
  --mode=category \
  --filter="status=pending,category=testing" \
  --providers="anthropic,openai,google,groq"
```

### 2. TaskMaster Integration
```bash
# Parse PRD and expand tasks
task-master parse-prd .taskmaster/docs/prd.txt
task-master expand --all --research

# Deploy TreeQuest agents
treequest-parallel --source=taskmaster --agents=5
```

### 3. Quick Feature Sprint
```bash
# Deploy 3 agents for feature implementation
treequest-parallel \
  --agents=3 \
  --focus="implementation" \
  --timeout=3600 \
  --budget=25.00
```

## Configuration Templates

### Copy to Project
```bash
# Category-based deployment
cp ~/.claude/skills/tmlpd-category.yaml ./tmlpd-config.yaml

# Phase-based deployment
cp ~/.claude/skills/tmlpd-phase.yaml ./tmlpd-config.yaml

# Monitoring only
cp ~/.claude/skills/tmlpd-monitoring.yaml ./tmlpd-monitoring.yaml
```

## Monitoring Commands

```bash
# Real-time status
treequest-parallel --status

# View logs
tail -f .tmlpd-output/tmlpd-logs.json

# Check metrics
treequest-parallel --metrics

# Launch dashboard
treequest-parallel --dashboard
```

## Agent Configuration Examples

### Frontend Specialist
```yaml
- id: "frontend-agent"
  provider: "anthropic"
  model: "claude-sonnet-4"
  focus: "UI components, styling"
  tasks: ["task-ui-*"]
```

### Backend Specialist
```yaml
- id: "backend-agent"
  provider: "openai"
  model: "gpt-4-turbo"
  focus: "API, database, logic"
  tasks: ["task-backend-*"]
```

### Testing Specialist
```yaml
- id: "testing-agent"
  provider: "google"
  model: "gemini-2.0-flash"
  focus: "Tests, validation"
  tasks: ["task-test-*"]
```

### Research Specialist
```yaml
- id: "research-agent"
  provider: "perplexity"
  model: "llama-3.1-sonar-large"
  focus: "Research, documentation"
  tasks: ["task-docs-*"]
```

## Performance Tips

1. **Start with 2-3 agents** - Scale up based on success
2. **Set budget limits** - Prevent cost overruns
3. **Use checkpoints** - Enable recovery for long tasks
4. **Monitor closely** - First deployment needs close watch
5. **Match models to tasks** - Right tool for the job

## Cost Optimization

| Task Type | Best Provider | Cost (per 1M tokens) |
|-----------|--------------|---------------------|
| Simple tests | Groq/Cerebras | $0.10 |
| Code generation | GPT-4 Turbo | $10.00 |
| Complex reasoning | Claude Sonnet | $3.00 |
| Research | Perplexity Sonar | $1.00 |
| Critical decisions | Claude Opus | $15.00 |

## Troubleshooting

### Agent not starting?
```bash
treequest test  # Check provider status
treequest status  # Check system health
```

### Merge conflicts?
```bash
treequest-parallel --merge-conflicts --strategy=timestamp
```

### Need to stop?
```bash
treequest-parallel --shutdown --graceful
```

### Resume from checkpoint?
```bash
treequest-parallel --resume
```

## Expected Speedup

- **2 agents:** 1.8x faster (ideal: 2x)
- **4 agents:** 3.4x faster (ideal: 4x)
- **6 agents:** 4.8x faster (ideal: 6x)

*Real-world results vary based on task complexity and dependencies*

## Advanced Features

### Dynamic Load Balancing
```yaml
coordination:
  load_balancing: "dynamic"
  rebalance_interval: 120
```

### Cost Limits
```yaml
cost_optimization:
  enabled: true
  budget_limit: 50.00
```

### Auto-Retry on Failure
```yaml
error_handling:
  retry_policy: "exponential_backoff"
  max_retries: 3
```

## Full Documentation

See: `~/.claude/skills/TMLPD.md`

## Support

- **TreeQuest Status:** `treequest status`
- **Config Check:** `treequest config --show`
- **Logs:** `~/.treequest/logs/`
- **Issues:** https://github.com/treequest-ai/issues

---

**Version:** 1.0.0
**Shortcut:** `/TMLPD`
**Works from:** Any project directory
