# Quiet Creative OS Phase 2

## Summary

Phase 2 migrates Generate from the legacy `static/zimage.html` iframe into a native React workspace while keeping the Phase 1 shell and every non-Generate legacy tool route intact.

The implementation is a reviewable vertical slice:

- `/app` and `/app/generate` render `frontend/src/features/generate/GenerateWorkspace.tsx`.
- `/app/legacy-generate` remains available and loads `/static/zimage.html?v=32` in the legacy iframe workbench.
- The native Generate workspace uses the existing backend generation, cloud generation, history, queue, provider status, and websocket helpers.
- Creation Rail now shows the current Generate task state and recent Generate outputs from zimage history or current-session completions.
- No backend API schema change was introduced.

## What Migrated

- Generate prompt/config UI moved into React:
  - prompt
  - engine choice: Local ComfyUI or ModelScope
  - width
  - height
  - local convert-to-JPG toggle
- Generate results moved into React:
  - recent zimage history grid
  - current run pending/running/failed/success state
  - image preview dialog
  - copy prompt/metadata
  - open original image URL
  - download image URL
- Generate task and output state moved into the Phase 1 shell data flow:
  - websocket `new_image` messages update the native results list
  - Creation Rail shows Generate task status
  - Creation Rail shows recent Generate thumbnails instead of placeholder-only text

## What Remains Legacy

The following routes remain legacy iframe routes:

- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/enhance` -> `/static/enhance.html?v=31`
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

`/legacy` still loads `static/index.html`, the old static shell. `static/zimage.html` was not removed or edited for the migration.

## Backend Endpoints Reused

No new backend schema was added.

- `GET /api/config`
  - provider and key availability used by the shell and Generate.
- `GET /api/queue_status?client_id=...`
  - queue state shown in the top bar, Generate state, and Creation Rail.
- `GET /api/history?type=zimage`
  - native Generate recent local zimage history.
- `POST /api/generate`
  - local Generate submission.
  - payload uses existing fields: `prompt`, `width`, `height`, `type: "zimage"`, `client_id`, `convert_to_jpg`.
- `POST /generate`
  - ModelScope Z-Image cloud submission.
  - payload uses existing fields: `prompt`, `api_key`, `resolution`.
  - `api_key` remains optional when the backend has `MODELSCOPE_API_KEY`.
- `WS /ws/stats?client_id=...`
  - existing task/status stream used to update queue state and receive `new_image` broadcasts.

## Behavior Differences From `static/zimage.html`

- The native workspace is quieter and shell-integrated rather than using the legacy masonry UI.
- Native Generate displays up to 48 history records internally and surfaces the latest 12 to Creation Rail.
- ModelScope missing-key handling is inline instead of using `alert`.
- Cloud results returned by `/generate` are shown immediately in the native session. Backend history currently stores those records as `type: "cloud"`, while the recent history load intentionally reuses `GET /api/history?type=zimage`.
- Send-to-canvas is not exposed in Phase 2. The old page posts `{ type: "send-to-canvas", url }` to its parent, but the Phase 1 React shell does not yet have a safe, verified receiver for that legacy protocol.
- Count is not exposed because the existing zimage endpoints used by the legacy page do not support a stable count field.

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

Browser verification used Playwright against `http://127.0.0.1:3000` with system Chrome in a headless, isolated profile.

Verified:

- `/app` renders native Generate with no `/static/zimage.html` iframe.
- `/app/generate` deep link renders native Generate.
- `/app/legacy-generate` loads `/static/zimage.html?v=32`.
- Enhance, Edit, Angle, Online, Flatlay, Batch try-on, Chat, Canvas, Gallery, API / Models, and ComfyUI still load as legacy iframes.
- `/` loads the new shell.
- `/legacy` loads the old static shell.
- Light/dark toggle works and persists through reload.
- Missing ModelScope key state is shown inline, and Creation Rail updates to `Generate blocked`.
- Queue, online, and API/provider status appear in the shell.
- Creation Rail has Generate task status and recent Generate output sections.
- Mobile bottom navigation is visible.
- Mobile Creation Rail opens as a sheet.
- Mobile Generate layout keeps the results heading visible in the first viewport.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase2-generate-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase2-generate-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase2-generate-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase2-generate-mobile-dark.png`

## Known Risks

- Local ComfyUI generation was not invoked during verification because the environment had no configured image provider; the missing-key path was verified instead.
- Browser QA used isolated headless Chrome via Playwright, not the user's normal Chrome profile.
- Legacy iframe pages can still emit their pre-existing console noise; this phase only migrates Generate.
