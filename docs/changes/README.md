# Change notes, one file per change

Since 2026-11-05 (owner: "switch to per-PR progress files"), every finished change adds its own file here instead of a line in `docs/PROGRESS.md` and a row in `docs/IMPLEMENTATION_TRACKER.md`. Several sessions merge into `main` at once, and edits to the same spot in those two logs conflicted on nearly every PR. A new file never conflicts.

- **Name:** `WJ-<id>.md`, using an id from your session's own range (CLAUDE.md → Merging across sessions). One file per tracker id; a PR that covers two ids adds two files.
- **Never edit or delete another session's file.** Correct your own by adding a line to it.
- **Contents:** the four fields below, short.

```markdown
# WJ-<id> · <Area> · <DONE | IN_PROGRESS | BLOCKED>

**What:** one or two sentences, in the UI's words, on what changed for the user or admin.
**Why:** who asked and when (owner, YYYY-MM-DD: "quote"), or the bug it fixes.
**Notes:** security or governance implications (automation, AI provider, external actions), tests, anything the owner must do. "None" if none.
**PR:** #<number> (add it once the PR exists, in the same PR if you can)
```

`docs/PROGRESS.md` and `docs/IMPLEMENTATION_TRACKER.md` are kept as history up to WJ-710 and take no new lines.
