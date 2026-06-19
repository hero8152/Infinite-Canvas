# Quiet Creative OS Phase 9

## Native Canvas Foundation

Phase 9 migrates the Canvas route from an embedded iframe to a native React foundation.

- /app/canvas is native.
- `/app/canvas` no longer uses `EmbeddedWorkbench`.
- `/app/canvas` has zero `static/canvas.html` iframe dependency.
- static/canvas.html remains unchanged as a direct fallback/reference.
- No backend API schema changes were made; Phase 9 made no backend API schema changes.
- `static/canvas.html` internals were not migrated or rewritten.
- unknown node fields survive native load/save round trips.
- full node execution is deferred.

## What Was Migrated

Native Canvas now supports:

- Canvas list loading.
- New canvas creation.
- Opening existing canvas documents.
- Title and icon editing.
- Explicit save through the existing canvas save endpoint.
- Soft delete to trash.
- Trash view.
- Restore from trash.
- Purge from trash with explicit confirmation.
- Board rendering with grid background.
- Safe rendering of existing nodes and connections.
- Placeholder rendering for unknown or unsupported node types.
- Node selection.
- Node drag/move.
- Board pan and wheel zoom.
- Mobile/tablet usable stacked layout.
- Creation Rail context for the active canvas, selected node, save state, node count, and connection count.

## Endpoints Reused

Only existing backend endpoints are used:

- `GET /api/canvases`
- `POST /api/canvases`
- `GET /api/canvases/{canvas_id}`
- `PUT /api/canvases/{canvas_id}`
- `DELETE /api/canvases/{canvas_id}`
- `GET /api/canvases/trash`
- `POST /api/canvases/{canvas_id}/restore`
- `DELETE /api/canvases/{canvas_id}/purge`

No request or response schema was changed.

## Data Preservation Strategy

The native Canvas keeps the backend document contract intact.

- The frontend loads the existing canvas document and keeps `nodes`, `connections`, `viewport`, `logs`, and `settings` in their existing shapes.
- Node movement updates only `x` and `y` on the existing node object copy, preserving unknown node fields.
- Unsupported node types render as placeholder cards rather than failing or dropping data.
- Save uses the existing `PUT /api/canvases/{canvas_id}` payload shape with `base_updated_at` conflict protection.
- Existing backend behavior preserves unknown top-level canvas fields by loading the stored canvas and only replacing known top-level fields.

Browser QA included a mocked canvas with unknown node fields and verified that the save payload preserved those fields.

## Deferred Work

This phase intentionally does not migrate full Canvas execution internals:

- Full image generation node execution.
- Full video node execution.
- Full LLM node execution.
- Full ComfyUI workflow execution from Canvas.
- Crop/mask/image editor internals.
- Drag-to-canvas from other workspaces.
- Rich node creation menus and complex link editing.

Those behaviors remain deferred because the old `static/canvas.html` implementation is large, stateful, and tightly coupled to provider/task flows.

## Preserved Routes

Native routes remain:

- `/app`
- `/app/generate`
- `/app/enhance`
- `/app/edit`
- `/app/online`
- `/app/chat`
- `/app/gallery`
- `/app/canvas`

Embedded routes remain:

- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

Direct static fallback/reference:

- `/static/canvas.html`

No visible Legacy Canvas navigation was added.

## Verification

Required commands:

```bash
npm run build
python scripts/guardrails.py
python main.py
```

Results:

- `npm run build`: passed.
- `python scripts/guardrails.py`: passed; guardrails also ran the frontend build.
- `python main.py`: passed; server started on `http://127.0.0.1:3000` for QA and was stopped before handoff.
- Browser QA: passed with local Playwright automation. The Browser plugin runtime was unavailable because its bundled `scripts/browser-client.mjs` file was missing, so Playwright was used as the equivalent local QA path.
- `static/canvas.html`: unchanged in git; SHA-256 `b60cc17c5aaebbb5bf2bce65505247b7ff60cdf526ca6104cac274f256438165`.

Browser QA coverage:

- `/app/canvas` loads native React Canvas.
- `/app/canvas` has zero iframes.
- `/app/canvas` does not load `static/canvas.html`.
- `/static/canvas.html` still loads directly.
- Create/open/rename/save/delete/restore flows work with mocked disposable canvas data.
- Unknown canvas/node fields survive a load/save round trip.
- Pan, zoom, selection, and node drag work.
- Mobile Canvas layout is usable.
- Creation Rail overlay does not resize the workspace.
- Existing native routes still work: Generate, Enhance, Edit, Online, Chat, Gallery.
- Angle, API / Models, and ComfyUI remain reachable as embedded routes.
- `/` and `/app` load the shell.
- `/legacy` redirects or normalizes to `/app`.
- Native route console has no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase9-canvas-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase9-canvas-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase9-canvas-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase9-canvas-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase9-canvas-board-desktop.png`
- `docs/quiet-creative-os/screenshots/phase9-canvas-trash-desktop.png`

## Known Risks

- Native Canvas foundation preserves and moves nodes, but does not yet execute full node workflows.
- Some old Canvas node types are represented by placeholder cards until their native editors are migrated.
- Purge is supported because the existing backend endpoint exists, but it remains a guarded trash-only action.
- Browser QA uses an isolated browser automation context rather than the user's normal Chrome profile.
