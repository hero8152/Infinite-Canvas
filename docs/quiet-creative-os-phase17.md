# Quiet Creative OS Phase 17

## Native Canvas Execution Node Data Layer

Phase 17 prepares native Canvas for execution-node parity without migrating real LLM, video, or workflow execution.

- `/app/canvas` remains native and iframe-free.
- `static/canvas.html remains unchanged`.
- `no backend API schema changes`.
- Phase 15 asset actions remain preserved.
- Phase 16 connection UX remains preserved.
- LLM/video/workflow execution remains deferred.
- no real LLM/video/workflow execution is called from native Canvas in this phase.

## What Changed

Execution context collector:

- Added a typed execution context collector in `frontend/src/features/canvas/CanvasWorkspace.tsx`.
- Classifies nodes as `prompt`, `text`, `image`, `output`, `group`, `llm`, `video`, `workflow`, or `unknown`.
- Collects selected-node context plus one-hop upstream/downstream context from Phase 16 connections.
- Collects prompt text, image refs, output refs, video refs, and text/LLM output refs.
- Keeps deterministic ordering: selected node first, then directly connected nodes in saved connection order.
- Dedupes prompt text by text value, text refs by node/field/text, and media refs by URL.
- Produces upstream/downstream counts and graph input warnings for missing prompt/media/workflow inputs.

Native node surfaces:

- Added LLM node creation with static-compatible fields such as `llmProvider`, `model`, `systemPrompt`, `messages`, and `outputText`.
- Added Video node creation with static-compatible fields such as `providerId`, `model`, `duration`, `aspectRatio`, `resolution`, `videos`, and video toggles.
- Added Workflow / ComfyUI node creation saved as a `comfy` node with `mode`, `comfyWorkflow`, `comfyParams`, `generatedOutputs`, and `inputs`.
- Existing prompt/image/output/group creation remains unchanged.
- Inspector fields now expose title/name, text/prompt, media URL where applicable, provider/model placeholders, and workflow placeholder fields.

Execution preview/debug panel:

- The selected-node inspector now shows an execution preview/debug panel.
- It reports collected prompt text, linked image refs, linked output refs, linked video refs, linked text / LLM outputs, upstream/downstream connection count, readiness, and graph input warnings.
- Existing native image execution remains limited to the Phase 11 prompt/image/output path through `/api/canvas-image-tasks`.
- LLM, video, and workflow nodes are preview-only in Phase 17 and do not call `/api/canvas-llm`, `/api/canvas-video`, or `/api/workflows/{name}/run`.

Creation Rail context:

- Adds selected execution node kind.
- Adds prompt/image/video/text ref counts.
- Adds execution-data readiness.
- Adds graph input warnings.

## Data Compatibility

Phase 17 does not change Canvas save/load schemas. Nodes remain `Record<string, unknown>` objects, and save payloads still send the full `nodes` and `connections` arrays.

Existing fields such as `generatedOutputs`, `images`, `videos`, `outputText`, `runStatus`, `runError`, `comfyParams`, `comfyWorkflow`, `workflow_json`, provider/model fields, and unknown node fields remain preserved when loaded and saved by native Canvas.

Connections remain compatible with existing `{id, from, to}` data. Phase 17 does not add typed ports, `fromPort`, `toPort`, or connection `type` metadata.

## Preserved / Deferred

Preserved:

- Phase 15 asset check/download all local assets.
- Phase 15 selected asset download and remote/data skip behavior.
- Phase 16 visible handles, drag-to-connect, preview link, selected-link deletion, and Start link fallback.
- Existing native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle, API / Models, ComfyUI.

Deferred:

- Real LLM execution through `/api/canvas-llm`.
- Real video execution through `/api/canvas-video`.
- Real custom workflow execution through `/api/generate` or `/api/workflows/{name}/run`.
- Generator/MSGen/Comfy execution parity, pending placeholders, cascade execution, typed ports, and advanced input ordering.

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

- `/app/canvas` has zero iframes.
- Existing prompt/image/output/group nodes still render.
- New LLM/video/workflow nodes can be created.
- Inspector edits preserve node fields.
- Graph context collector sees connected prompt/image/output/video/text refs.
- Context ordering and dedupe are deterministic.
- Missing input warnings appear without crashing.
- No `/api/canvas-llm`, `/api/canvas-video`, or `/api/workflows/{name}/run` call happens in Phase 17.
- Save payload preserves unknown node fields and existing canvas fields.
- Save/reload preserves new node types and connections.
- Phase 15 asset actions still work.
- Phase 16 drag-to-connect and selected-link deletion still work.
- Mobile layout has no horizontal overflow.
- Native route console/page errors are zero.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase17-canvas-node-types-desktop.png`

## Known Risks

- The collector is intentionally one-hop. Multi-hop execution scheduling remains Phase 18+ work.
- Workflow nodes use static-compatible node fields, but real workflow field rendering and payload construction remain deferred.
- Typed ports are still not present; warnings are advisory until the execution contract is explicit.
