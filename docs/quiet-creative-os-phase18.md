# Quiet Creative OS Phase 18

## Native Canvas Generator/ComfyUI Execution MVP

Phase 18 implements the first native execution-node parity slice for Canvas generator nodes and ComfyUI-style workflow nodes.

- `/app/canvas` remains native and iframe-free.
- `static/canvas.html remains unchanged`.
- `no backend API schema changes`.
- save remains explicit after execution updates.
- Phase 15 asset actions remain preserved.
- Phase 16 connection UX remains preserved.
- Phase 17 execution preview remains preserved.
- LLM/video execution remains deferred.

## What Changed

Native generator nodes:

- Added Generator node creation in the native Canvas authoring palette.
- Generator nodes use the existing `POST /api/canvas-image-tasks` plus `GET /api/canvas-image-tasks/{task_id}` loop.
- The payload maps Phase 17 one-hop graph context to `prompt`, `provider_id`, `model`, `size`, `quality`, and `reference_images`.
- Prompt-only generation and connected image/output context are supported.

Native ComfyUI workflow execution:

- Workflow / ComfyUI nodes now expose a native Workflow execution panel.
- Text mode calls `POST /api/generate` with `workflow_json: "Z-Image.json"`.
- Enhance mode uploads the first connected image/output ref through `POST /api/upload`, then calls `POST /api/generate` with `workflow_json: "Z-Image-Enhance.json"`.
- Edit mode uploads up to three connected image/output refs through `POST /api/upload`, then calls `POST /api/generate` with `workflow_json: "Flux2-Klein.json"`.
- Custom mode calls `POST /api/generate` with `type: "custom-workflow"` and existing `comfyParams`; full custom workflow field rendering remains deferred.

Output and status handling:

- Successful runs update the selected execution node with `generatedOutputs`, `runStatus`, `runError`, `task_id`, and compatible workflow metadata.
- Runs insert or update a connected output node using existing `images`, prompt/model/provider/task/source metadata, and a minimum-compatible `{id, from, to}` connection when needed.
- Failed runs set inline `runStatus: "failed"` and `runError` on the selected node so the explicit save payload can preserve the error state.
- Unknown node fields, unknown canvas fields, viewport, settings, logs, and existing connections are preserved by the existing Canvas save path.

Creation Rail context:

- Shows selected Canvas execution mode/workflow.
- Shows run status and errors.
- Shows graph input counts from Phase 17.
- Shows output count and last output for the selected execution node.

## Preserved / Deferred

Preserved:

- Phase 11 selected prompt/image/output image execution through `/api/canvas-image-tasks`.
- Phase 15 local asset check/download actions.
- Phase 16 drag-to-connect, selected link deletion, and inspector Start link fallback.
- Phase 17 execution preview/debug panel.
- Existing native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle, API / Models, ComfyUI.

Deferred:

- Real LLM execution through `/api/canvas-llm`.
- Real video execution through `/api/canvas-video`.
- Full custom workflow field rendering using `/api/workflows`.
- MSGen, cascade scheduling, pending placeholder parity, typed ports, and multi-hop graph execution.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Expected results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: starts on `http://127.0.0.1:3000`, then is stopped.
- Port 3000 clear after stop.

Playwright QA coverage:

- `/app/canvas` has zero iframes and does not request `/static/canvas.html`.
- Generator node runs with prompt-only context.
- Generator/ComfyUI node runs with connected image/output context.
- Mocked success inserts or updates output data.
- Mocked failure renders inline error and saves `runError`.
- Save/reload preserves `generatedOutputs`, `runStatus`, `runError`, and unknown fields.
- Phase 11 selected prompt/image/output image execution still works.
- Phase 15 asset actions still work.
- Phase 16 drag-to-connect and selected-link deletion still work.
- Phase 17 execution preview still works.
- Mobile light/dark has no horizontal overflow.
- Native route console/page errors are zero in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase18-canvas-generator-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase18-canvas-generator-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase18-canvas-generator-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase18-canvas-generator-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase18-canvas-workflow-result-desktop.png`
- `docs/quiet-creative-os/screenshots/phase18-canvas-workflow-error-desktop.png`

## Known Risks

- Phase 18 intentionally uses one-hop graph inputs only. It does not infer multi-hop scheduling or cascade execution.
- Custom workflow execution is a compatible MVP path for existing `comfyParams`; field discovery and UI mapping remain Phase 21 work.
- Real provider execution still depends on configured providers, reachable ComfyUI instances, and valid workflow JSON files.
