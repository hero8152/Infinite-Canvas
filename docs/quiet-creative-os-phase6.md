# Quiet Creative OS Phase 6

## Summary

Phase 6 migrates Gallery from the legacy `static/gallery.html` iframe into the native React shell while preserving Phase 1-5 behavior.

- `/app/gallery` renders `frontend/src/features/gallery/GalleryWorkspace.tsx`.
- `/app/legacy-gallery` loads `/static/gallery.html?v=3` as the fallback iframe route.
- `/app/generate`, `/app/enhance`, `/app/online`, and `/app/chat` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, `/app/legacy-online`, `/app/legacy-chat`, and `/app/legacy-gallery` remain available.
- Edit, Angle, Flatlay, Batch try-on, Canvas, API / Models, and ComfyUI remain legacy iframe routes.
- `/` and `/app` remain on the new shell; `/legacy` remains the old static shell.
- No backend API schema change was introduced.

Phase 6 layout follow-up:

- Creation Rail no longer participates in the shell grid at any viewport width.
- Desktop and tablet always open Creation Rail as a fixed right overlay drawer from the TopBar.
- Mobile keeps the existing bottom navigation plus Creation Rail bottom sheet pattern.
- The old `qcos_creation_rail_collapsed` preference is no longer read or written by the React shell because there is no inline rail layout to collapse.

## What Migrated

Gallery now has a native React workspace with:

- responsive asset grid
- search input
- source, artifact, status, model, date, and favorite filters using existing facets where present
- page size and previous/next pagination using existing query params
- loading, empty, and inline error states
- selected asset detail panel
- preview modal
- open original action
- single-asset download URL handling for local `/output/` assets
- favorite toggle through the existing favorite endpoint
- hide/delete action behind browser confirmation through the existing delete endpoint
- local batch selection state
- batch download through the existing zip endpoint

Creation Rail now switches context when Gallery is active:

- current Gallery task state
- selected Gallery asset thumbnails
- selected asset prompt/name, source, artifact, model, date, and status
- fallback recent assets when no Gallery asset is selected
- mobile Creation Rail sheet showing the same selected asset context
- desktop/tablet overlay drawer showing the same selected asset context without resizing the workspace

## What Remains Legacy

- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/legacy-enhance` -> `/static/enhance.html?v=31`
- `/app/legacy-online` -> `/static/online.html?v=1`
- `/app/legacy-chat` -> `/static/gpt-chat.html?v=1`
- `/app/legacy-gallery` -> `/static/gallery.html?v=3`
- `/app/edit` -> `/static/klein.html?v=31`
- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/flatlay` -> `/static/flatlay.html?v=4`
- `/app/batch-tryon` -> `/static/batch-tryon.html?v=20260514-batch-state-ux`
- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

`static/gallery.html` was preserved as fallback. `canvas.html` internals were not migrated.

## Backend Endpoints Reused

No new backend schema was added.

- `GET /api/gallery/assets`
  - native Gallery list, search, filters, facets, pagination, and empty/error states.
- `PATCH /api/gallery/assets/{asset_id}/favorite`
  - favorite toggle.
- `DELETE /api/gallery/assets/{asset_id}`
  - hide/delete asset after explicit confirmation.
- `POST /api/gallery/download`
  - batch download for selected assets.
- `GET /api/download-output?url=...&name=...`
  - local single-asset download links for `/output/` URLs.
- `GET /api/config`
  - provider/API status in the shell and Creation Rail.
- `GET /api/queue_status?client_id=...`
  - queue state.
- `GET /api/gallery/assets?page=1&page_size=6`
  - recent asset fallback for Creation Rail.
- `WS /ws/stats?client_id=...`
  - online count and shared task stream.

## Behavior Differences From `static/gallery.html`

- Native Gallery keeps the same backend asset contract but presents it as a shell-native workbench with left filters, center grid, selected asset detail, and Creation Rail context.
- Missing server/API failures are shown inline in the native workspace.
- Batch selection is native UI state; batch download only uses the existing zip endpoint.
- Hide/delete keeps the existing destructive endpoint but requires browser confirmation.
- Send-to-canvas and drag-to-canvas were not implemented in Phase 6 because no safe, verified native receiver path was reused. Canvas remains an iframe route.
- The legacy Gallery page remains available at `/app/legacy-gallery` for behavior not yet migrated.

## Verification

Commands run:

```bash
pwd
git status -sb
git branch --show-current
npm run build
python scripts/guardrails.py
python main.py
```

Results:

- `pwd`: `/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1`
- branch: `codex/quiet-creative-os-phase1`
- `npm run build`: pass
- `python scripts/guardrails.py`: pass
- `python main.py`: pass, served `http://127.0.0.1:3000`

Browser verification used Playwright with an isolated Chromium context. The Playwright browser bundle for the runtime was installed into the user Playwright cache; no repo files were changed by that install.

Verified:

- `/app/gallery` renders native Gallery with no `/static/gallery.html` iframe.
- `/app/legacy-gallery` loads `/static/gallery.html?v=3`.
- `/app/generate`, `/app/enhance`, `/app/online`, and `/app/chat` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, `/app/legacy-online`, `/app/legacy-chat`, and `/app/legacy-gallery` load old iframe fallbacks.
- Edit, Angle, Flatlay, Batch try-on, Canvas, API / Models, and ComfyUI remain legacy iframe routes.
- `/` loads the new shell.
- `/legacy` loads the old shell.
- Light/dark theme persists after reload.
- Gallery loading, empty, and inline error states are visible with mocked Gallery endpoint responses.
- Gallery selected asset updates Creation Rail with selected asset metadata.
- Creation Rail opens from the TopBar as an overlay drawer on desktop/tablet and never changes `.qc-app-shell` grid columns.
- At 1440x960, 1510x960, 1600x960, 1601x960, and 1680x960, Gallery renders without toolbar/detail overlap or page-level horizontal overflow before and after opening the rail drawer.
- At 390x780, Gallery keeps the mobile one-column shell, bottom nav, and bottom rail sheet without layout offset.
- Gallery favorite action works against the existing favorite endpoint shape with mocked response.
- Gallery preview modal opens.
- Mobile Gallery layout is usable.
- Mobile Creation Rail opens as a sheet and shows selected Gallery metadata.
- Native route console produced no new errors; the intentional mocked `/api/gallery/assets` 500 was excluded from the final console-clean assertion.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase6-gallery-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase6-gallery-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase6-gallery-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase6-gallery-mobile-dark.png`

The Phase 6 screenshots were refreshed after the Creation Rail overlay simplification. The desktop light screenshot shows Gallery at 1440px with the rail closed; the desktop dark screenshot shows the 1680px rail drawer open without resizing Gallery; the mobile dark screenshot verifies the rail remains a bottom sheet.

## Known Risks

- Real destructive hide/delete was not executed against local user data; the confirmation flow and existing endpoint shape were verified through mocked browser responses.
- Real batch zip download was not saved from production data; native Gallery calls the existing endpoint and the browser QA mocked the zip response.
- Gallery facets depend on the existing backend response. If a facet is absent, the native select falls back to the corresponding `All ...` option.
- Send-to-canvas and drag-to-canvas remain deferred until an existing safe receiver path is verified.
- Browser QA used isolated Playwright, not the user's normal Chrome profile.
