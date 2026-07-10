# Quiet Creative OS Phase 8 Agent Instructions

## Goal

Cleanly remove visible legacy fallback clutter and retired tools from the Quiet Creative OS shell, while preserving Canvas, Angle, API / Models, and ComfyUI as important first-class routes that still need dedicated native migrations.

## Worktree Guard

Worktree:

```text
/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1
```

Expected branch:

```text
codex/quiet-creative-os-phase1
```

Before doing anything, run and report:

```bash
pwd
git status -sb
git branch --show-current
lsof -nP -iTCP:3000 -sTCP:LISTEN || true
```

If pwd or branch does not match, stop immediately.

The user may have the app open at `http://127.0.0.1:3000`. If port 3000 is occupied by the existing `tmux` session `qcos-phase1-7`, reuse it or restart it only when needed for verification. Do not kill unrelated processes.

## Hard Constraints

- Do not create a new worktree.
- Stay on `codex/quiet-creative-os-phase1`.
- Do not commit, push, merge, or rebase.
- Do not delete user data, output images, history files, config files, API keys, or generated assets.
- Do not migrate `canvas.html` internals in Phase 8.
- Do not migrate Angle, API / Models, or ComfyUI internals in Phase 8 unless the change is tiny, safe, and explicitly documented.
- Do not break `/app/canvas`.
- Do not break `/app/angle`.
- Do not break `/app/api-models`.
- Do not break `/app/comfyui`.
- No backend API schema changes.
- Keep these native routes working: `/app/generate`, `/app/enhance`, `/app/edit`, `/app/online`, `/app/chat`, `/app/gallery`.

## Read First

- `DESIGN.md`
- `REVIEW_HANDOFF.md`
- `docs/quiet-creative-os-phase7.md`
- `frontend/src/app/routes.tsx`
- `frontend/src/app/App.tsx`
- `frontend/src/components/shell/Sidebar.tsx`
- `frontend/src/components/shell/MobileNav.tsx`
- `frontend/src/components/shell/TopBar.tsx`
- `frontend/src/features/legacy/LegacyWorkbench.tsx`
- `frontend/src/styles/globals.css`
- `scripts/guardrails.py`
- `main.py`

## Product Objective

Remove from the product UI:

- Legacy Generate
- Legacy Enhance
- Legacy Edit
- Legacy Online
- Legacy Chat
- Legacy Gallery
- Flatlay
- Batch try-on

These should no longer appear in desktop sidebar, mobile bottom nav, route groups, top-level app navigation, Creation Rail context lists, or native workspace links.

Native workspaces should no longer show `Legacy X` links.

## Routes To Preserve

Preserve these as first-class product routes:

- `/app/generate`
- `/app/enhance`
- `/app/edit`
- `/app/online`
- `/app/chat`
- `/app/gallery`
- `/app/canvas`
- `/app/angle`
- `/app/api-models`
- `/app/comfyui`

Route status after Phase 8:

- Generate: native
- Enhance: native
- Edit / Klein: native
- Online: native
- Chat: native
- Gallery: native
- Canvas: embedded/static for now, first-class, next major migration priority
- Angle: embedded/static for now, first-class, future native migration
- API / Models: embedded/static for now, first-class system route, future native migration
- ComfyUI: embedded/static for now, first-class system route, future native migration

## Legacy Fallback Routes

Remove these `/app/legacy-*` route entries from the product route registry:

- `/app/legacy-generate`
- `/app/legacy-enhance`
- `/app/legacy-edit`
- `/app/legacy-online`
- `/app/legacy-chat`
- `/app/legacy-gallery`

Direct access must not load old iframe pages. Implement clean redirects or normalization:

- `/app/legacy-generate` -> `/app/generate`
- `/app/legacy-enhance` -> `/app/enhance`
- `/app/legacy-edit` -> `/app/edit`
- `/app/legacy-online` -> `/app/online`
- `/app/legacy-chat` -> `/app/chat`
- `/app/legacy-gallery` -> `/app/gallery`

## Retired Tool Routes

Flatlay and Batch try-on are retired.

Remove from app navigation and route registry:

- `/app/flatlay`
- `/app/batch-tryon`

Direct access must not load old iframes. Redirect `/app/flatlay` and `/app/batch-tryon` to `/app/gallery` or `/app/generate`, or show a small native retired-route notice. Do not add them back to normal navigation.

Inspect references before deleting static files. If `static/flatlay.html` or `static/batch-tryon.html` are still referenced by backend or shared code, do not perform risky deletion; leave them documented as dormant cleanup follow-up.

## Preserved Embedded Routes

For Canvas, Angle, API / Models, and ComfyUI:

- Do not delete their static files.
- Do not remove their routes.
- Keep them visible in app navigation.
- Label/group them clearly as important remaining workspaces/system surfaces.
- Avoid visible "legacy" wording for these routes.

## Old `/legacy` Shell

The old shell is no longer a product surface.

Preferred behavior:

- `/legacy` redirects to `/app` or serves a tiny redirect page to `/app`.
- Do not expose old shell in React navigation.
- `static/index.html` may remain on disk if deletion is risky, but it must not be part of the product path.

## Terminology Cleanup

There should be no visible "Legacy" product concept after Phase 8.

If practical:

- Rename or replace `LegacyWorkbench` with `EmbeddedWorkbench`.
- Replace route kind `"legacy"` with `"embedded"` or equivalent for remaining iframe-backed routes.
- Remaining embedded routes should be Canvas, Angle, API / Models, and ComfyUI.

## Navigation Target

Desktop sidebar should include:

Create:

- Generate
- Enhance
- Edit
- Online
- Angle

Workspace:

- Chat
- Gallery
- Canvas

System:

- API / Models
- ComfyUI

Do not include legacy fallbacks, Flatlay, or Batch try-on.

Mobile nav should remain usable and not overcrowded. Include at least:

- Generate
- Enhance
- Edit
- Online
- Chat
- Gallery
- Canvas

Angle, API / Models, and ComfyUI may remain desktop/sidebar/direct routes for now if they do not fit in bottom nav.

## Migration Plan Document

Add:

```text
docs/quiet-creative-os-remaining-migrations-plan.md
```

Cover:

- Canvas native migration plan
- Angle native migration plan
- API / Models native migration plan
- ComfyUI native migration plan

For each remaining route document:

- current static file
- current responsibilities
- backend endpoints or data paths used
- user workflows
- migration risks
- proposed migration phases
- verification required before replacing the embedded route
- recommended next phase order

Recommended next phase order:

1. Canvas planning/audit and migration spike
2. Angle native migration
3. API / Models native migration
4. ComfyUI native migration

## Guardrails

Update `scripts/guardrails.py` so it fails if:

- frontend route registry contains visible legacy fallback routes
- frontend UI contains visible labels like `Legacy Generate`, `Legacy Chat`, etc.
- native workspaces link to `/app/legacy-*`
- Flatlay or Batch try-on appear in primary nav
- `/app/flatlay` or `/app/batch-tryon` still load old iframe routes
- `/app/canvas` is missing
- `/app/angle` is missing
- `/app/api-models` is missing
- `/app/comfyui` is missing
- Canvas, Angle, API / Models, or ComfyUI are labeled as legacy in visible UI
- `canvas.html` is modified without explicit documentation
- Creation Rail returns to inline third-column layout
- `qcos_creation_rail_collapsed` returns
- npm build fails

Guardrails should allow embedded iframe routes for Canvas, Angle, API / Models, and ComfyUI.

## Docs

Add:

- `docs/quiet-creative-os-phase8.md`
- `docs/quiet-creative-os-remaining-migrations-plan.md`

Update:

- `REVIEW_HANDOFF.md`
- `README.md` if route behavior changed
- `DESIGN.md` only if needed to reflect route cleanup and remaining migration priorities

Docs must say:

- legacy fallback pages were removed from the product shell
- Flatlay and Batch try-on were retired
- Canvas remains embedded temporarily and is the next major migration priority
- Angle remains embedded temporarily and should be migrated native later
- API / Models and ComfyUI remain embedded temporarily and should be migrated native later
- `/legacy` no longer represents the product shell
- no backend API schema changes were made
- `canvas.html` internals were not migrated

## Verification

Run:

```bash
npm run build
python scripts/guardrails.py
python main.py
```

Use Playwright or Chrome automation to verify:

- `/` loads new shell
- `/app` loads new shell
- `/legacy` redirects or normalizes to `/app`
- `/app/generate`, `/app/enhance`, `/app/edit`, `/app/online`, `/app/chat`, `/app/gallery` are native and have no iframe
- `/app/canvas` loads embedded Canvas
- `/app/angle` loads embedded Angle
- `/app/api-models` loads embedded API / Models
- `/app/comfyui` loads embedded ComfyUI
- `/app/legacy-*` routes do not load old iframes
- `/app/flatlay` and `/app/batch-tryon` do not load old iframes
- Flatlay and Batch try-on do not appear in sidebar or mobile nav
- no visible `Legacy ...` labels remain in React product UI
- Canvas, Angle, API / Models, and ComfyUI remain visible in desktop navigation
- Creation Rail opens as overlay and does not resize workspace
- mobile bottom nav remains usable
- light/dark theme persists
- native route console has no new errors

Save screenshots:

- `docs/quiet-creative-os/screenshots/phase8-shell-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase8-canvas-embedded-desktop.png`
- `docs/quiet-creative-os/screenshots/phase8-angle-embedded-desktop.png`
- `docs/quiet-creative-os/screenshots/phase8-system-routes-desktop.png`

## Final Report Format

- Initial guard results
- Files changed
- Product navigation changes
- Removed/retired routes
- Routes preserved
- Remaining embedded routes and migration plan path
- Verification commands and results
- Browser QA results
- Screenshot paths
- Tradeoffs / residual risks
- Confirm no backend API schema changes
- Confirm `canvas.html` internals were not migrated
- Confirm Angle/API Models/ComfyUI internals were not migrated unless explicitly documented
- Confirm no commit/push/merge/rebase
