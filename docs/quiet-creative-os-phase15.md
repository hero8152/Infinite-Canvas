# Quiet Creative OS Phase 15

## Canvas Asset Actions + ComfyUI P3 cleanup

Phase 15 completes native Canvas local asset actions and fixes the Phase 14 ComfyUI reload/status overwrite regression.

- `/app/canvas` remains native and iframe-free.
- `/app/comfyui is native`.
- `static/canvas.html remains unchanged`.
- `static/comfyui-settings.html remains unchanged`.
- No backend API schema changes were made; Phase 15 made no backend API schema changes.
- LLM, video, and custom workflow Canvas execution remain deferred.

## What Changed

ComfyUI P3 cleanup:

- Workflow selection state now uses refs for loader decisions, so the initial ComfyUI `loadAll` flow runs on mount/explicit refresh rather than running again because `selectedName` changed.
- Selecting an already-loaded workflow no longer refetches its detail.
- Uploading a workflow still refreshes the list and selects the uploaded workflow, including slash-containing names, without a later mount reload overwriting `Workflow uploaded.`.
- Deleting a custom workflow still requires confirmation and refreshes the list without overwriting `Workflow deleted.`.
- Config save forces a detail refresh after save so backend-normalized config remains visible.

Canvas asset actions:

- Added typed frontend helpers for `POST /api/canvas-assets/check`, `POST /api/canvas-assets/download`, and `/api/download-output`.
- Native Canvas now derives asset URLs from existing static-compatible node fields:
  - `node.url`
  - `node.images`
  - `node.generatedOutputs`
  - `node.videos`
  - object/string URL values handled by `outputUrlValue`
- The native UI filters downloadable local candidates to `/output/`, `/assets/`, and `/static/assets/` paths before calling local asset endpoints.
- Remote, blob, and data URLs are counted as skipped and are not claimed as downloadable through the local zip endpoint.
- Added inline actions to check local asset availability, download all available local assets as a zip, and download the selected local image/output/video asset.
- Selected `/output/...` assets use `/api/download-output`; other selected local asset paths use the existing zip endpoint.
- Blob downloads use object URLs and revoke them after click.
- Creation Rail Canvas context now includes total asset count, downloadable count, selected asset name/url, and last asset action status.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `POST /api/canvas-assets/check`
- `POST /api/canvas-assets/download`
- `GET /api/download-output?url=...&name=...`

Zip downloads use `POST /api/canvas-assets/download` with:

```json
{
  "urls": ["/output/example.png"],
  "filename": "canvas-assets.zip"
}
```

## Preserved / Deferred

Preserved:

- Native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle, API / Models, ComfyUI.
- Direct static references for `static/canvas.html` and `static/comfyui-settings.html`.
- Existing Canvas save compatibility: unknown node fields are preserved because the native save payload keeps full node objects, and unknown top-level canvas fields remain on the backend-loaded canvas document.
- Existing Canvas image execution from Phase 11.

Deferred:

- LLM, video, and custom workflow Canvas execution remain deferred.
- Full static Canvas execution-node parity remains a follow-up area.
- Backend API schema changes remain out of scope.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Command results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: PASS; FastAPI started on `http://127.0.0.1:3000` and was stopped cleanly before handoff.
- Port 3000 clear after stop: PASS; `lsof -nP -iTCP:3000 -sTCP:LISTEN` returned no listener.

Playwright QA result: PASS with mocked ComfyUI/workflow/Canvas responses and direct static-page verification.

Playwright QA coverage:

- `/app/comfyui` remains native, iframe-free, and does not request `/static/comfyui-settings.html`.
- `direct /static/comfyui-settings.html` still loads.
- ComfyUI select/upload/delete detail fetches do not duplicate through mount reloads.
- ComfyUI upload/delete/test statuses remain visible after completion.
- `/app/canvas` remains native and iframe-free.
- Canvas asset check sends only local candidates to `/api/canvas-assets/check`.
- Canvas download-all sends only available local URLs to `/api/canvas-assets/download`.
- Selected `/output/...` asset download calls `/api/download-output`.
- Selected `/assets/...` asset download calls `/api/canvas-assets/download`.
- Remote/data URLs are shown as skipped, not downloadable.
- Creation Rail shows Canvas asset counts, selected asset, and action status.
- Existing native routes remain native.
- Theme persistence and mobile layout remain usable.
- Native route console/page errors are zero in the mocked QA run.

Observed mocked asset payloads:

- Check payload: `/output/local-image.png`, `/output/output-a.png`, `/assets/generated-local.png`, `/output/missing.png`, `/assets/clip.mp4`, `/assets/video-local.mp4`.
- Zip payload: `/output/local-image.png`, `/output/output-a.png`, `/assets/generated-local.png`, `/assets/clip.mp4`, `/assets/video-local.mp4`.
- Selected output payload: `/api/download-output?url=/output/local-image.png&name=local-image.png`.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase15-canvas-assets-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase15-canvas-assets-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase15-canvas-assets-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase15-canvas-assets-mobile-dark.png`

## Known Risks

- Real downloads depend on files existing under the backend-recognized `/output`, `/assets`, or `/static/assets` roots.
- The check endpoint reports remote/data URLs as present for static compatibility, so the native UI deliberately filters those before check/download.
- Playwright QA uses isolated Chromium automation, not the user's normal Chrome profile.
