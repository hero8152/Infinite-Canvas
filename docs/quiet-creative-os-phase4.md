# Quiet Creative OS Phase 4

## Summary

Phase 4 migrates Online hosted image generation from the legacy `static/online.html` iframe into the native React shell while preserving Phase 1-3 behavior.

- `/app/online` renders `frontend/src/features/online/OnlineWorkspace.tsx`.
- `/app/legacy-online` loads `/static/online.html?v=1` as the fallback iframe route.
- `/app/generate` and `/app/enhance` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, and `/app/legacy-online` remain available.
- Other major tools remain legacy iframe routes.
- `/` and `/app` remain on the new shell; `/legacy` remains the old static shell.
- No backend API schema change was introduced.

## What Migrated

Online now has a native React workspace with:

- hosted prompt input
- provider selection from `GET /api/config`
- model selection from provider `image_models`
- aspect and resolution controls matching the legacy presets
- custom ratio and custom size controls
- up to 3 reference image uploads
- inline pending/running/failed/success state
- recent Online history
- result grid
- image preview
- copy metadata
- reuse prompt/settings
- open original output URL
- download output URL
- delete history item through the existing history delete endpoint

Creation Rail now switches context when Online is active:

- current Online task state
- recent Online outputs
- latest Online prompt/context

## Carry-Forward Fix

Phase 4 adds shared stable result dedupe in `frontend/src/lib/result-dedupe.ts`.

The helper matches generated records primarily by normalized image URL and task id when present. Timestamp is only used as a fallback display/key ingredient when a record has no URL/task identity.

Applied to:

- native Generate history, immediate insert, and websocket insert paths
- native Enhance history, immediate insert, and websocket insert paths
- native Online history, immediate insert, and websocket insert paths
- Creation Rail output keys

This fixes the Phase 3 duplicate-result risk where a local cloud result and a later backend websocket/history record could carry the same image URL with different timestamps.

## What Remains Legacy

- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/legacy-enhance` -> `/static/enhance.html?v=31`
- `/app/legacy-online` -> `/static/online.html?v=1`
- `/app/edit` -> `/static/klein.html?v=31`
- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/flatlay` -> `/static/flatlay.html?v=4`
- `/app/batch-tryon` -> `/static/batch-tryon.html?v=20260514-batch-state-ux`
- `/app/chat` -> `/static/gpt-chat.html?v=1`
- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`
- `/app/gallery` -> `/static/gallery.html?v=3`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

`static/online.html` was preserved as fallback. `canvas.html` internals were not migrated.

## Backend Endpoints Reused

No new backend schema was added.

- `GET /api/config`
  - provider list, provider key state, primary provider, and image models.
- `POST /api/ai/upload`
  - reference image upload, using the legacy response shape `{ files: [{ url, name }] }`.
- `POST /api/online-image`
  - hosted image generation.
  - existing fields used: `prompt`, `provider_id`, `model`, `size`, `quality`, `reference_images`.
- `GET /api/history?type=online`
  - Online history.
- `POST /api/history/delete`
  - delete a selected Online history record by timestamp.
- `GET /api/queue_status?client_id=...`
  - queue state.
- `GET /api/gallery/assets?page=1&page_size=6`
  - fallback recent assets for the rail.
- `WS /ws/stats?client_id=...`
  - online count, queue/task stream, and `new_image` updates.

## Behavior Differences From `static/online.html`

- Missing prompt, provider, size, and provider-key problems are shown inline instead of using `alert`.
- Native Online shows up to 48 history records and surfaces the latest 12 to Creation Rail.
- The native result grid uses the Quiet Creative OS card and preview pattern instead of the legacy grid/lightbox internals.
- Provider/model controls use the existing `/api/config` data and do not expose new provider schemas.
- Quality remains the backend default `auto` because the legacy Online page does not expose a quality control.
- Send-to-canvas is not exposed in Phase 4.
- Real hosted generation was not invoked during verification because external provider credentials were not assumed; missing-key and mocked success/dedupe states were verified instead.

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

Browser verification:

- In-app Browser was attempted first and returned `Browser is not available: iab`.
- Final QA used system Python Playwright with isolated Chromium/Chrome.

Verified:

- `/app/online` renders native Online with no `/static/online.html` iframe.
- `/app/legacy-online` loads `/static/online.html?v=1`.
- `/app/generate` remains native.
- `/app/enhance` remains native.
- `/app/legacy-generate` loads `/static/zimage.html?v=32`.
- `/app/legacy-enhance` loads `/static/enhance.html?v=31`.
- Edit, Angle, Flatlay, Batch try-on, Chat, Canvas, Gallery, API / Models, and ComfyUI remain legacy iframe routes.
- `/` loads the new shell.
- `/legacy` loads the old shell.
- Light/dark theme persists after reload.
- Online empty prompt state is shown inline.
- Creation Rail updates to Online blocked state and shows Recent Online context.
- Duplicate same-URL Online results are deduped when inserted through API response and through a mocked websocket `new_image` event.
- Mobile bottom navigation is visible.
- Mobile Creation Rail opens as a sheet.
- Mobile Online controls are usable and the Results header reaches the first viewport.
- Native route console produced no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase4-online-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase4-online-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase4-online-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase4-online-mobile-dark.png`

## Known Risks

- Real hosted Online generation was not exercised end-to-end because this environment did not provide confirmed provider credentials.
- Provider-specific local browser keys beyond the existing Comfly header flow are not newly introduced; native Online follows the legacy endpoint behavior.
- Legacy iframe pages remain unchanged and can still emit pre-existing warnings.
- Browser QA used isolated Playwright, not the user's normal Chrome profile.
