# Quiet Creative OS Phase 1 Implementation Prompt

Start this task in the current independent worktree.

Before editing, run and report:

- `pwd`
- `git status -sb`

If `pwd` is not:

```text
/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1
```

or the current branch is not:

```text
codex/quiet-creative-os-phase1
```

stop and do not edit files.

Read and follow:

- `DESIGN.md`
- `docs/quiet-creative-os-phase1.md`

Task rules:

- Implement only your assigned Phase 1 workstream.
- Use `npm` for the frontend toolchain.
- Keep the accent color as `#2f6fed`.
- Build the new shell on `/app` during implementation.
- After Phase 1 acceptance, switch `/` to the new shell and preserve the old shell at `/legacy`.
- Do not change backend API schemas.
- Do not migrate `canvas.html` internals in Phase 1.
- Do not modify the original repo directory.
- Do not merge.
- Do not push.
- Do not commit unless explicitly asked.
- Write `REVIEW_HANDOFF.md` before stopping.
