# Quiet Creative OS Phase 7

## Summary

Phase 7 migrates Edit / Klein from the legacy `static/klein.html` iframe into the native React shell while preserving Phase 1-6 behavior.

- `/app/edit` renders `frontend/src/features/edit/EditWorkspace.tsx`.
- `/app/legacy-edit` loads `/static/klein.html?v=31` as the fallback iframe route.
- `/app/generate`, `/app/enhance`, `/app/online`, `/app/chat`, and `/app/gallery` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, `/app/legacy-online`, `/app/legacy-chat`, `/app/legacy-gallery`, and `/app/legacy-edit` remain available.
- Angle, Flatlay, Batch try-on, Canvas, API / Models, and ComfyUI remain legacy iframe routes.
- `/` and `/app` remain on the new React shell; `/legacy` remains the old static shell.
- Creation Rail remains overlay-only: right drawer on desktop/tablet, bottom sheet on mobile.
- No backend API schema change was introduced.
- `canvas.html` internals were not migrated.

## What Migrated

Edit / Klein now has a native React workspace with:

- three upload slots: Main image, Aux A, and Aux B
- file picker upload
- drag/drop upload
- paste upload while hovering a slot
- local previews and per-slot clear actions
- prompt textarea
- engine selector for Local ComfyUI and Cloud ModelScope
- Local ComfyUI seed input and random seed toggle
- Cloud ModelScope LoRA toggle and LoRA strength control from `0.1` to `1.0`, default `0.8`
- inline validation, loading, running, failed, and success states
- result grid backed by Klein history
- empty and loading states
- preview/lightbox
- before/after comparison when history contains the original main image node param
- reuse prompt, seed, and input slots from compatible history params
- delete history action with browser confirmation
- stable result upsert/dedupe through the existing native result dedupe helper

Creation Rail now switches to Edit context when `/app/edit` is active:

- current Edit task status
- prompt/context summary
- selected/main input artifact when available
- recent Edit outputs
- Edit output thumbnails in the rail asset strip
- mobile bottom sheet and desktop/tablet overlay drawer without resizing the workspace

## What Remains Legacy

- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/legacy-enhance` -> `/static/enhance.html?v=31`
- `/app/legacy-edit` -> `/static/klein.html?v=31`
- `/app/legacy-online` -> `/static/online.html?v=1`
- `/app/legacy-chat` -> `/static/gpt-chat.html?v=1`
- `/app/legacy-gallery` -> `/static/gallery.html?v=3`
- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/flatlay` -> `/static/flatlay.html?v=4`
- `/app/batch-tryon` -> `/static/batch-tryon.html?v=20260514-batch-state-ux`
- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

`static/klein.html` was preserved as fallback. `canvas.html` internals were not migrated.

## Backend Endpoints Reused

No new backend schema was added.

- `POST /api/upload`
  - native Edit uploads Main image, Aux A, and Aux B using `FormData`.
  - Local ComfyUI payloads use returned `comfy_name` values.
- `POST /api/generate`
  - Local ComfyUI Klein workflow submission.
  - Payload uses `workflow_json: "Flux2-Klein.json"`, `type: "klein"`, existing node override params, and `client_id`.
- `POST /api/ms/generate`
  - Cloud ModelScope Klein submission.
  - Payload uses model `black-forest-labs/FLUX.2-klein-9B`, `image_urls`, prompt, and `client_id`.
  - When LoRA is enabled, payload includes `loras: { "Daniel8152/Klein-enhance": strength }`.
- `GET /api/history?type=klein`
  - native Edit result/history grid.
- `POST /api/history/delete`
  - confirmed history delete action.
- `GET /api/config`
  - provider/API state and missing-key behavior.
- `GET /api/queue_status?client_id=...`
  - shell and Creation Rail queue state.
- `GET /api/gallery/assets?page=1&page_size=6`
  - recent asset fallback for Creation Rail.
- `WS /ws/stats?client_id=...`
  - online count and task stream. Native Edit consumes existing `new_image` task messages when `data.type === "klein"`.

## Payload Contracts

Local ComfyUI request:

```json
{
  "prompt": "tailored editorial crop",
  "workflow_json": "Flux2-Klein.json",
  "type": "klein",
  "params": {
    "168": { "text": "tailored editorial crop" },
    "158": { "noise_seed": 123 },
    "278": { "image": "mock-main.png" },
    "270": { "image": "mock-aux-a.png" },
    "292": { "image": "mock-aux-b.png" },
    "313": { "value": true },
    "314": { "value": true }
  },
  "client_id": "..."
}
```

Cloud ModelScope request without LoRA:

```json
{
  "prompt": "cloud edit without lora",
  "model": "black-forest-labs/FLUX.2-klein-9B",
  "image_urls": ["data:image/png;base64,..."],
  "client_id": "..."
}
```

Cloud ModelScope request with LoRA:

```json
{
  "prompt": "cloud edit with lora",
  "model": "black-forest-labs/FLUX.2-klein-9B",
  "image_urls": ["data:image/png;base64,..."],
  "client_id": "...",
  "loras": {
    "Daniel8152/Klein-enhance": 0.6
  }
}
```

## Behavior Differences From `static/klein.html`

- Native Edit is shell-native rather than iframe-backed and uses the shared TopBar, Creation Rail, route registry, theme, and mobile shell.
- Validation appears inline instead of alert-only behavior.
- Upload, generate, history, and delete use typed frontend helpers against existing endpoints.
- Cloud results are inserted into native history state and deduped with existing native result dedupe logic.
- Creation Rail now shows Edit task and input/output context while staying overlay-only.
- Send-to-canvas was not implemented because no safe verified native receiver path was reused. Canvas remains an iframe route.
- The legacy Klein page remains available at `/app/legacy-edit`.

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

Browser verification used Playwright with an isolated Chromium context and mocked API responses for Edit submit/history/delete.

Verified:

- `/app/edit` renders native Edit with no `/static/klein.html` iframe.
- `/app/legacy-edit` loads `/static/klein.html?v=31`.
- `/app/generate`, `/app/enhance`, `/app/online`, `/app/chat`, and `/app/gallery` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, `/app/legacy-online`, `/app/legacy-chat`, and `/app/legacy-gallery` remain iframe fallbacks.
- Angle, Flatlay, Batch try-on, Canvas, API / Models, and ComfyUI remain legacy iframe routes.
- `/` loads the new shell.
- `/legacy` loads the old shell.
- Light/dark theme persists after reload.
- Missing prompt shows inline validation.
- Missing main image shows inline validation.
- Mock `/api/upload` and `/api/generate` verified exact local Klein payload.
- Mock `/api/ms/generate` verified exact cloud payload.
- LoRA payload appears only when the LoRA toggle is enabled.
- Mock `/api/history?type=klein` renders deduped history/results.
- Mock `/api/history/delete` verifies confirmed delete flow.
- Creation Rail updates for Edit state and recent Edit outputs.
- Creation Rail opens as an overlay drawer on desktop/tablet and does not resize `.qc-workbench`.
- Creation Rail opens as a bottom sheet on mobile.
- Mobile layout is usable with bottom nav, visible controls, and no horizontal overflow.
- Native routes produced no new console errors in the final Playwright pass.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase7-edit-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase7-edit-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase7-edit-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase7-edit-mobile-dark.png`

## Known Risks

- Real provider credentials were not exercised; browser QA verified the available and missing-key/error paths with mocked responses.
- Real user history deletion was not executed against local user data; the confirmation flow and existing endpoint shape were verified with mocked responses.
- Paste upload is scoped to the hovered slot to avoid global accidental paste capture.
- Send-to-canvas remains deferred until an existing safe receiver path is verified.
- Browser QA used isolated Playwright, not the user's normal Chrome profile.
