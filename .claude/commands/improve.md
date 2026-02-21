# Post-Task Improvement Review

A task was just completed. Before moving on, review and improve documentation.

## Step 1: Identify Gaps

Answer these questions:

1. **Agent instructions:** Did any agent lack instructions for something it needed to do? Was anything unclear?

2. **CLAUDE.md:** Was any project context missing that would have helped? New tables, endpoints, components, or patterns that should be documented?

3. **STATUS.md:** Is it current?

## Step 2: Propose Updates

List specific updates in this format:

```
### CLAUDE.md Updates
- [Section]: [What to add/change]

### Agent Updates
- [agent name].md: [What to add/change]

### New Patterns to Document
- [Pattern]: [Description]
```

## Step 3: Apply Updates

After Mat approves, apply all updates:
1. Edit CLAUDE.md with new context
2. Edit agent .md files in .claude/agents/
3. Update STATUS.md
4. Confirm: "Documentation updated. Ready for next task."

## Step 4: Commit Documentation

If changes are significant, commit:
```
git add CLAUDE.md .claude/agents/ STATUS.md
git commit -m "docs: update project documentation after [feature name]"
```
