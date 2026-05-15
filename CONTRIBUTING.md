# Contributing to OmniClaw

PRs welcome! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/Das-rebel/omniclaw.git
cd omniclaw
npm install        # Node.js dependencies
pip install -e .  # Python dependencies
cp .env.example .env  # configure your keys
```

## Testing

```bash
# Node.js tests
npm test

# Python tests
pytest
```

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructure
- `test:` test additions

## Pull Request Checklist

- [ ] Tests pass locally
- [ ] New endpoints have documentation
- [ ] `.env` changes documented in PR description
- [ ] No secrets committed

## Code Review

Expect review within 48h. For urgent fixes, tag with `urgent` label.