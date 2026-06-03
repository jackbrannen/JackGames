---
name: spec_first
description: Always read spec before implementing; ask before deviating from it
metadata:
  type: feedback
---

**Rule:** Before starting any implementation, read the spec (tasks.md, CLAUDE.md, or user description). If the spec conflicts with what you're about to build, ask before deviating.

**Why:** Multiple times I've implemented off-spec solutions (top strip vs popup, home page navigation vs lobby link, hardcoded Jack player, etc.) without checking the spec or asking. Each time it took the user significant time to find and fix. The user explicitly said: "You keep creating things off-spec like this and it takes me forever to find and fix."

**How to apply:**
- Search tasks.md + CLAUDE.md for the feature before coding
- If you're about to shortcut something (e.g., "navigation is complex, I'll just do X"), pause and ask first: "The spec says X, but that requires Y — should I do Z instead?"
- After implementation, compare against spec line-by-line before reporting done
- If there's a gap between spec and reality, list it explicitly instead of hiding it

This is not a nice-to-have. It's foundational.
