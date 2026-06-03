---
name: semantic_search
description: Protocol for retrieving historical theorems and memory context.
category: domain
---

# Semantic Search Skill

When you need to retrieve historical theorems, logic patterns, or memory context to guide your decisions:

1. **Query Local Logic:** Our primary logic store is at `.memory/context.json`.
2. **Query external Reference Library:** The **Claude Cookbooks** are located at `knowledge/claude-cookbooks/`. You can find an index of patterns in the `claude_cookbooks` skill.
3. **Standard Execution:** Use `grep -r` or `cat` commands to search through either `.memory/context.json` or the relevant files in `knowledge/claude-cookbooks/` found via the index.
4. **Synthesis:** If the retrieved text relates to user-intent, integrate those procedures *exactly* into your current step strategy.
