# Quiet Creative OS Phase 11

## Native Canvas Image Execution

Phase 11 adds the first native execution loop to Canvas: prompt/image context can run through the existing hosted image task endpoint and return generated outputs as Canvas output nodes.

- /app/canvas remains native.
- `/app/canvas` has no iframe and no `static/canvas.html` dependency.
- static/canvas.html remains unchanged as a direct fallback/reference.
- No backend API schema changes were made; Phase 11 made no backend API schema changes.
- unknown node fields survive native run/save round trips.
- Generated images are inserted as output nodes.
- Video, LLM, ComfyUI workflow, and complex graph execution remain deferred.

## Execution Behavior Added

Native Canvas now supports:

- Run selected prompt nodes.
- Run selected image/output nodes using their image URL as reference context.
- Optionally include directly connected prompt/image/output nodes as one-hop execution context.
- Choose an image provider from the existing `/api/config` provider list.
- Choose an existing image model, size, and quality.
- Submit image execution through `POST /api/canvas-image-tasks`.
- Poll task status through `GET /api/canvas-image-tasks/{task_id}`.
- Show pending/running/succeeded/failed status inline in the selected-node inspector.
- Show missing provider/key/server state inline without crashing.
- Insert successful generated image URLs as native `type: "output"` nodes near the source node.
- Preserve prompt, model, provider, task id, and source node metadata on new output nodes where available.
- Keep output insertion dirty until the user explicitly saves the canvas.
- Update Creation Rail with selected node, execution status, active task id, model/provider, error state, output count, and last output URL.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `GET /api/config`
- `POST /api/canvas-image-tasks`
- `GET /api/canvas-image-tasks/{task_id}`
- `GET /api/canvases`
- `POST /api/canvases`
- `GET /api/canvases/{canvas_id}`
- `PUT /api/canvases/{canvas_id}`
- `DELETE /api/canvases/{canvas_id}`
- `GET /api/canvases/trash`
- `POST /api/canvases/{canvas_id}/restore`
- `DELETE /api/canvases/{canvas_id}/purge`

The Canvas image task payload reuses the existing Online image request contract: `prompt`, `provider_id`, `model`, `size`, `quality`, and `reference_images`.

## Context Rules

The native MVP intentionally keeps graph interpretation narrow:

- Prompt node: uses its `text` or `prompt` field.
- Image node: uses its `url` as a reference image.
- Output node: uses the first URL from `images` as a reference image.
- Directly connected prompt/image/output nodes can be used as one-hop context when the inspector toggle is enabled.
- If selected image/output context has no prompt, Canvas uses the existing legacy-compatible default prompt: `Edit the reference image.`
- Rich multi-step graph execution remains deferred.

## Data Preservation Strategy

- Existing canvas documents still save through `PUT /api/canvases/{canvas_id}` with `base_updated_at`.
- Existing nodes are not rewritten during execution; generated output nodes are appended additively.
- Existing unknown node fields survive because selected-node edits and move operations use object spreading.
- Existing connections are preserved unless the user explicitly deletes a link or deletes a connected node.
- Existing unknown connection fields survive when links are not edited.
- Viewport updates spread the existing viewport object.
- Logs and settings continue to pass through the save payload.
- New output node metadata is additive: `task_id`, `source_node_id`, `provider_id`, `model`, `prompt`, `status`, and `params`.

## Deferred Work

Phase 11 intentionally does not migrate the full old Canvas execution system:

- Video node execution.
- LLM/chat node execution.
- ComfyUI workflow node execution.
- Complex graph scheduling and multi-hop dependency resolution.
- Crop/mask/image editor internals.
- Automatic drag-to-canvas execution receivers from other workspaces.

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
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Results are recorded in `REVIEW_HANDOFF.md`.

Command results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: PASS; FastAPI started on `http://127.0.0.1:3000` and was stopped cleanly before handoff.
- `static/canvas.html`: unchanged; SHA-256 `b60cc17c5aaebbb5bf2bce65505247b7ff60cdf526ca6104cac274f256438165`.

Browser QA result: PASS with mocked disposable Canvas/API responses for missing-key, successful task, failed task, output insertion, save/reload, unknown-field preservation, mobile layout, route coverage, and screenshot capture.

Browser QA coverage:

- `/app/canvas` loads native React Canvas.
- `/app/canvas` has zero iframes.
- `/app/canvas` does not load `static/canvas.html`.
- `/static/canvas.html` still loads directly.
- Selected prompt node enters execution flow.
- Missing provider/key state is inline and non-crashing.
- Mocked successful image task inserts an output node.
- Output node saves and reloads.
- Mocked failed task shows error and does not alter unrelated canvas data.
- Unknown node, connection, viewport, settings, logs, and top-level fields survive save.
- Creation Rail shows Canvas execution context.
- Mobile Canvas remains usable.
- Existing native routes still work: Generate, Enhance, Edit, Online, Chat, Gallery.
- Angle, API / Models, and ComfyUI remain reachable as embedded routes.
- Native route console has no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase11-canvas-execute-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase11-canvas-execute-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase11-canvas-execute-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase11-canvas-execute-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase11-canvas-task-state-desktop.png`
- `docs/quiet-creative-os/screenshots/phase11-canvas-output-node-desktop.png`

## Known Risks

- The native execution MVP runs one selected node with optional one-hop context; full graph execution is intentionally deferred.
- Real provider execution depends on configured provider keys; acceptance can be verified through missing-key, mocked success, and mocked failure states.
- Output node metadata is compatible/additive, but old `static/canvas.html` may not provide rich editors for every new field.
- Browser QA uses an isolated automation context rather than the user's normal Chrome profile.
