# Quiet Creative OS Phase 12

## Native Angle Migration

Phase 12 migrates Angle from an embedded static page into the React shell.

- `/app/angle is native`.
- `/app/angle` renders `AngleWorkspace`, not `EmbeddedWorkbench`.
- `/app/angle` has no iframe and does not request `static/angle.html`.
- `direct /static/angle.html` remains available as a static fallback/reference.
- `static/angle.html remains unchanged`.
- `API / Models and ComfyUI remain embedded`.
- No backend API schema changes were made; Phase 12 made no backend API schema changes.

## What Was Migrated

The native workspace lives under `frontend/src/features/angle/`.

Native Angle now supports:

- Source image file picker and drag/drop upload.
- Local preview for the selected source image.
- Local ComfyUI and Cloud ModelScope engine modes.
- Rotation, pitch, distance, and lens prompt controls.
- Prompt text editing with the legacy camera-command mapping.
- Generate action with pending/running/succeeded/failed status.
- Inline missing-key, upload, server, and generation error states.
- Result preview and recent Angle history.
- Copy metadata, open original, and download output actions.
- Creation Rail context for source image, engine, controls, task status, task id, last output, and errors.
- Light/dark theme support through the existing shell tokens.
- Responsive mobile layout.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `GET /api/config`
- `POST /api/upload`
- `POST /api/generate`
- `POST /api/angle/generate`
- `POST /api/angle/poll_status`
- `GET /api/history?type=angle`
- `WS /ws/stats?client_id=...`

## Payload Contracts

Local ComfyUI reuses the existing `2511.json` workflow:

```json
{
  "workflow_json": "2511.json",
  "params": {
    "31": { "image": "uploaded-comfy-name.png" },
    "11": { "prompt": "prompt with camera command" },
    "14": { "seed": 123456789 }
  },
  "type": "angle",
  "client_id": "client-id"
}
```

The native UI intentionally omits top-level `prompt` on the local workflow request to preserve the legacy `static/angle.html` behavior. The prompt is applied through workflow node `11.prompt`.

Cloud ModelScope reuses the existing Angle endpoint:

```json
{
  "prompt": "prompt with camera command",
  "api_key": "",
  "type": "angle",
  "model": "Qwen/Qwen-Image-Edit-2511",
  "image_urls": ["data:image/png;base64,..."],
  "client_id": "client-id"
}
```

If cloud generation times out, the existing task id is polled with:

```json
{
  "task_id": "task-id",
  "api_key": "",
  "client_id": "client-id"
}
```

## Prompt Mapping

The native control mapping follows `static/angle.html`:

- Positive rotation: `向右旋转N度`.
- Negative rotation: `向左旋转N度`.
- Positive pitch: `俯视N度`.
- Negative pitch: `仰视N度`.
- Distance greater than 4: `使用广角镜头`.
- Distance less than 4: `使用特写镜头`.

The generated command replaces an existing `将相机...` line in the prompt rather than appending duplicates.

## Preserved / Deferred

Preserved:

- Native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle.
- Embedded routes: API / Models and ComfyUI.
- `/legacy` redirect/normalization behavior.
- Overlay-only Creation Rail behavior.
- `static/angle.html` on disk and directly accessible.

Deferred:

- Full static Angle UI parity such as every small legacy toast/detail affordance.
- Automatic real provider calls in acceptance; missing-key, mocked success, and mocked failure are sufficient when credentials are unavailable.
- A visible Legacy Angle product route. Phase 12 intentionally keeps only the direct static reference.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Results are recorded in `REVIEW_HANDOFF.md`.

Command results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: PASS; FastAPI started on `http://127.0.0.1:3000` and was stopped cleanly before handoff.

Browser QA result: PASS with mocked Angle upload/local/cloud/history responses and direct static-page verification.

Browser QA coverage:

- `/app/angle` loads native React Angle with zero iframes.
- `/app/angle` makes no `/static/angle.html` request.
- `direct /static/angle.html` still loads.
- Upload preview works with mocked `/api/upload`.
- Local payload matches the legacy `2511.json` workflow mapping.
- Cloud payload and polling match the existing `/api/angle/*` contract.
- Missing-key and server error states are inline and non-crashing.
- Angle history renders and dedupes through shared result upsert behavior.
- Creation Rail updates for Angle context.
- Mobile Angle layout is usable.
- Existing native routes still work: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas.
- API / Models and ComfyUI remain embedded and reachable.
- Native route console has no new errors in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase12-angle-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase12-angle-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase12-angle-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase12-angle-mobile-dark.png`

## Known Risks

- Real cloud execution depends on configured ModelScope credentials and upstream task availability.
- The native local run preserves the exact legacy workflow node mapping, but local success still depends on a configured ComfyUI server and the `2511.json` workflow.
- Browser QA uses isolated Playwright automation, not the user's normal Chrome profile.
