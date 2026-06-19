# Quiet Creative OS Phase 1 Plan

**Goal**: Establish the new design direction and a modern app shell foundation without breaking existing workflows.

Phase 1 is not a full rewrite. It creates the reviewable base that later subagents can build against: tokens, shell, legacy route hosting, shared status plumbing, and migration seams.

This work must happen inside the independent worktree:

```text
/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1
```

Branch:

```text
codex/quiet-creative-os-phase1
```

Do not implement Phase 1 in the original repo directory.

---

## 1. Phase 1 Outcome

At the end of Phase 1, the project should have:

- A new Vite + React + TypeScript frontend under `frontend/`.
- A Quiet Creative OS token system implemented in CSS.
- A new shell with sidebar, top context bar, main workbench, and Creation Rail placeholder.
- Legacy iframe routes for existing static pages so behavior remains reachable.
- Shared client modules for theme, API calls, queue/status stream, and local storage keys.
- FastAPI serving the built frontend without replacing existing `/static/*.html` pages.
- Guardrail updates that allow the new design direction and stop enforcing old Mistral/pixel rules.
- Screenshots for light and dark shell states.
- `/` switched to the new shell after Phase 1 acceptance passes, with the old shell preserved as a legacy route.

Non-goals:

- No full canvas rewrite.
- No provider/backend schema change.
- No removal of old pages.
- No broad visual pass across every legacy HTML page.

---

## 2. Locked Decisions

- Worktree: all implementation happens in `/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1`.
- Branch: `codex/quiet-creative-os-phase1`.
- Route target: build on `/app` during implementation, then switch `/` to the new shell after Phase 1 passes review.
- Legacy access: preserve the current shell at a stable legacy route, recommended `/legacy`.
- Accent color: keep the Codex/GPT-like blue `#2f6fed`.
- Package manager: use `npm`.
- Backend: keep FastAPI and existing API schemas unchanged.

---

## 3. Architecture Decision

Use a strangler migration:

```text
FastAPI
  ├─ existing APIs unchanged
  ├─ existing /static/*.html unchanged
  ├─ /app frontend during implementation
  ├─ /legacy old shell after cutover
  └─ / new shell after Phase 1 acceptance
       ├─ React shell
       ├─ shared modules
       └─ legacy iframe routes during transition
```

Reasoning:

- Keeps existing app usable while architecture changes.
- Lets multiple agents work on independent seams.
- Avoids the high risk of rewriting `canvas.html` first.
- Creates a modern foundation for later shared components.

Rejected alternatives:

- Full rewrite first: too risky and hard to verify.
- Continue static HTML only: does not solve duplication or page islands.
- Next.js: no clear SSR benefit for this local FastAPI workbench.
- htmx-first: not a good fit for canvas-heavy, client-state-heavy workflows.

---

## 4. Parallel Subagent Workstreams

### Agent A - Frontend Scaffold

Scope:

- Create `frontend/` with Vite React TypeScript.
- Add package scripts for dev/build.
- Configure output to `static/app/` or another FastAPI-served build directory.
- Add minimal routing.
- Add TypeScript strictness that is practical, not blocking.
- Use `npm` and commit `package-lock.json` when dependencies are installed.

Deliverables:

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig*.json`
- `frontend/src/app/App.tsx`
- `frontend/src/app/routes.tsx`
- Build output path documented.

Verification:

- `npm install`
- `npm run build`
- Built files are generated where FastAPI can serve them.

Dependencies:

- None.

Start guard:

- Before editing, verify `pwd` is `/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1`.
- Verify branch is `codex/quiet-creative-os-phase1`.

### Agent B - Design Tokens And Base UI

Scope:

- Implement Quiet Creative OS tokens.
- Add global CSS, light/dark theme variables, focus ring, typography, control primitives.
- Create initial Button, IconButton, Input, SelectShell, Panel, Tabs, Tooltip wrappers or CSS classes.
- Do not import a large visual component kit.

Deliverables:

- `frontend/src/styles/tokens.css`
- `frontend/src/styles/globals.css`
- `frontend/src/components/controls/*`

Verification:

- Component preview route or shell route shows controls in light/dark.
- No old pixel/Mistral tokens are used in the new frontend.

Dependencies:

- Agent A scaffold paths.

### Agent C - App Shell And Legacy Routes

Scope:

- Build shell layout: sidebar, top context bar, main area, Creation Rail placeholder.
- Add routes for legacy pages using iframes.
- Preserve access to current tools: zimage, enhance, klein, angle, online, flatlay, batch try-on, chat, canvas, gallery, providers, ComfyUI.
- Implement route active state and responsive collapse.

Deliverables:

- `frontend/src/components/shell/*`
- `frontend/src/features/legacy/LegacyFrame.tsx`
- Route registry mapping route IDs to old static URLs.

Verification:

- Every old tool is reachable in the new shell.
- Route switching lazy-loads iframe URLs.
- Light/dark theme message is posted to active iframe.

Dependencies:

- Agent A.
- Can use Agent B tokens once available.

### Agent D - Shared Runtime Plumbing

Scope:

- Extract frontend client helpers for:
  - API fetch wrapper.
  - Queue status polling.
  - WebSocket stats/task stream.
  - Theme storage.
  - Provider/API key status detection from localStorage.
- Keep behavior compatible with current keys and endpoints.

Deliverables:

- `frontend/src/lib/api.ts`
- `frontend/src/lib/task-stream.ts`
- `frontend/src/lib/theme.ts`
- `frontend/src/lib/storage.ts`
- `frontend/src/lib/provider-status.ts`

Verification:

- Queue count updates in the new shell.
- Online count updates when backend websocket is available.
- API configured indicator reflects existing localStorage keys.
- Theme persists and syncs to legacy iframe.

Dependencies:

- Agent A.

### Agent E - FastAPI Integration

Scope:

- Serve new frontend entry at `/app`.
- Serve built assets.
- During implementation, keep `/` and existing `/static/*.html` behavior intact.
- After Phase 1 acceptance, switch `/` to the new shell and preserve the old shell at `/legacy`.
- Add no API schema changes.

Deliverables:

- Minimal `main.py` changes or static mount additions.
- Optional fallback route for `/app/*`.

Verification:

- `python main.py` starts.
- `http://127.0.0.1:3000/app` loads new shell.
- Before cutover, `http://127.0.0.1:3000` still loads old shell.
- After cutover, `http://127.0.0.1:3000` loads new shell and `/legacy` loads old shell.
- Existing APIs still respond.

Dependencies:

- Agent A build output decision.

### Agent F - Guardrails And Documentation

Scope:

- Update `scripts/guardrails.py` so it no longer enforces Mistral-only rules.
- Add checks for the new frontend where reasonable:
  - TypeScript build can run if dependencies are installed.
  - No secrets in frontend files.
  - No generated build artifacts committed unless intended.
- Update README development notes for new frontend.

Deliverables:

- `scripts/guardrails.py`
- `README.md`
- Possibly `docs/quiet-creative-os-phase1.md` updates after implementation.

Verification:

- `python scripts/guardrails.py`
- README commands are accurate.

Dependencies:

- Agent A and E decisions.

### Agent G - Reviewer / QA

Scope:

- Review all Phase 1 branches/patches against `DESIGN.md`.
- Run build and guardrails.
- Start backend and inspect `/app` with Playwright.
- Capture desktop and mobile screenshots in light/dark.
- File concrete issues with file/line references.

Deliverables:

- Review report under `docs/quiet-creative-os-phase1-review.md`.
- Screenshots under `docs/quiet-creative-os/screenshots/`.

Verification:

- All Phase 1 acceptance criteria checked.
- Known risks are listed before implementation moves to Phase 2.

Dependencies:

- All implementation agents.

---

## 5. Suggested Parallel Order

Wave 1:

- Agent A - Frontend Scaffold.
- Agent F - Guardrails audit prep.

Wave 2:

- Agent B - Tokens and base UI.
- Agent D - Shared runtime plumbing.
- Agent E - FastAPI integration.

Wave 3:

- Agent C - Shell and legacy routes.
- Agent F - Final guardrails/docs.

Wave 4:

- Agent G - Reviewer / QA.

Critical dependency:

- Agent C should not wait for every control to be perfect. It only needs stable token names and shell primitives from Agent B.

---

## 6. Acceptance Criteria

Functional:

- `/app` loads a React shell.
- All current major tools are reachable through legacy routes.
- Active route state works.
- Theme toggles light/dark and persists.
- Theme syncs into legacy iframes.
- Queue/online status appears in the shell when backend is running.
- After acceptance cutover, `/` loads the new shell and `/legacy` loads the old shell.

Visual:

- New shell visibly follows Quiet Creative OS, not Mistral v2.
- No cream grid paper in new shell.
- No pixel icon requirement in new shell.
- Controls use modern radius and muted surfaces.
- Creation Rail placeholder is present and visually integrated.
- Light and dark modes are both usable.

Engineering:

- New frontend build succeeds.
- FastAPI starts.
- Guardrails pass or document intentional skips.
- No backend API schema changes.
- No secrets or generated outputs committed.
- Implementation work happened in the Phase 1 worktree, not the original repo directory.

Review:

- Reviewer report lists blockers, non-blocking issues, and residual risk.
- Screenshots exist for desktop and mobile in light/dark.

---

## 7. Risks

### Node Dependency Footprint

Adding a frontend toolchain increases project setup weight. Mitigation: keep it isolated under `frontend/`, do not disturb Python setup, and document commands clearly.

### Duplicate Shells During Migration

For a while there will be old `/` and new `/app`. Mitigation: treat `/app` as the migration target and do not maintain two visual systems indefinitely.

### Legacy iframe Theme Sync

Old pages use existing theme message behavior. The new shell must preserve that protocol until pages are migrated.

### Canvas Rewrite Temptation

Canvas is important but risky. Phase 1 should only host it as legacy iframe.

---

## 8. Implementation Prompt

Use this as the first message for an implementation subagent or new Codex worktree thread:

```text
Start this task in the current independent worktree.

Before editing, run and report:
- pwd
- git status -sb

If pwd is not:
/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1

or the current branch is not:
codex/quiet-creative-os-phase1

stop and do not edit files.

Read and follow:
- DESIGN.md
- docs/quiet-creative-os-phase1.md

Implement only your assigned Phase 1 workstream.
Do not modify the original repo directory.
Do not merge.
Do not push.
Do not commit unless explicitly asked.
Write REVIEW_HANDOFF.md before stopping.
```
