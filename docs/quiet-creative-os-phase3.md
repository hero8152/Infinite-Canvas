# Quiet Creative OS Phase 3

## Summary

Phase 3 migrates Enhance from the legacy `static/enhance.html` iframe into a native React workspace while preserving all Phase 1 and Phase 2 behavior.

- `/app/enhance` renders `frontend/src/features/enhance/EnhanceWorkspace.tsx`.
- `/app/legacy-enhance` loads `/static/enhance.html?v=31` as the fallback iframe route.
- `/app/generate` remains native Generate.
- `/app/legacy-generate` remains the old zimage iframe fallback.
- Other major tools remain legacy iframe routes.
- `/` and `/app` remain on the new shell; `/legacy` remains the old static shell.
- No backend API schema change was introduced.

## What Migrated

Enhance now has a native React workspace with:

- input image upload/dropzone
- optional prompt
- refinement strength slider
- Local ComfyUI / Klein cloud engine switch
- local super-resolution toggle with 2K/4K choice
- inline pending/running/failed/success state
- recent enhancement history
- result grid
- before/after preview when source metadata is available
- copy metadata
- open original output URL
- download output URL

Creation Rail now switches context when Enhance is active:

- current Enhance task state
- recent Enhance outputs
- latest Enhance prompt/context

## What Remains Legacy

- `/app/legacy-enhance` -> `/static/enhance.html?v=31`
- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/edit` -> `/static/klein.html?v=31`
- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/online` -> `/static/online.html?v=1`
- `/app/flatlay` -> `/static/flatlay.html?v=4`
- `/app/batch-tryon` -> `/static/batch-tryon.html?v=20260514-batch-state-ux`
- `/app/chat` -> `/static/gpt-chat.html?v=1`
- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`
- `/app/gallery` -> `/static/gallery.html?v=3`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

`static/enhance.html` was preserved as fallback. `canvas.html` internals were not migrated.

## Backend Endpoints Reused

No new backend schema was added.

- `POST /api/upload`
  - uploads source images to ComfyUI-compatible input storage.
- `POST /api/generate`
  - local Enhance with `workflow_json: "Z-Image-Enhance.json"`.
  - local upscale with `workflow_json: "upscale.json"`.
  - existing fields used: `workflow_json`, `params`, `type: "enhance"`, `client_id`, `prompt`.
- `POST /api/ms/generate`
  - Klein cloud Enhance using `black-forest-labs/FLUX.2-klein-9B` and `Daniel8152/Klein-enhance`.
- `GET /api/history?type=enhance`
  - local Enhance history.
- `GET /api/history?type=klein`
  - cloud Klein history already stored by the backend.
- `GET /api/view?filename=...&type=input`
  - before image preview when source metadata exists.
- `GET /api/config`
  - provider/key state.
- `GET /api/queue_status?client_id=...`
  - queue state.
- `WS /ws/stats?client_id=...`
  - task stream and `new_image` updates.

## Behavior Differences From `static/enhance.html`

- Missing input, missing ModelScope key, upload failures, and server errors are shown inline instead of alerting or only changing legacy button text.
- Native preview uses a side-by-side before/after layout, not the legacy draggable comparison slider.
- Recent history loads both `enhance` and `klein` records so local and cloud Enhance outputs can appear in one native view.
- Cloud result history still depends on the existing backend record type `klein`.
- Real generation was not invoked during verification because provider credentials/local generation readiness were not available; the missing-input and missing-key/failure surfaces are handled in UI.

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

Browser verification used Playwright with system Chrome in a headless isolated profile after the in-app Browser plugin reported `iab` unavailable.

Verified:

- `/app/enhance` renders native Enhance with no `/static/enhance.html` iframe.
- `/app/legacy-enhance` loads `/static/enhance.html?v=31`.
- `/app/generate` remains native Generate.
- `/app/legacy-generate` loads `/static/zimage.html?v=32`.
- Edit, Angle, Online, Flatlay, Batch try-on, Chat, Canvas, Gallery, API / Models, and ComfyUI remain legacy iframe routes.
- `/` loads the new shell.
- `/legacy` loads the old shell.
- Light/dark theme persists after reload.
- Enhance missing-input state is shown inline.
- Creation Rail updates to Enhance context and blocked task state.
- Mobile bottom navigation is visible.
- Mobile Creation Rail opens as a sheet.
- Mobile Enhance layout keeps controls usable and the result area visible in the first viewport.
- Native route console produced no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase3-enhance-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase3-enhance-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase3-enhance-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase3-enhance-mobile-dark.png`

## Known Risks

- Local Enhance and Klein cloud generation were not exercised end-to-end because this environment did not provide confirmed provider credentials or local generation readiness.
- Legacy iframe pages remain unchanged and can still emit pre-existing warnings.
- Playwright QA used isolated headless Chrome, not the user's normal Chrome profile.
