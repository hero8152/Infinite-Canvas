# Quiet Creative OS Canvas Completion Plan

This plan is based on local source inspection of:

- `static/canvas.html`
- `frontend/src/features/canvas/CanvasWorkspace.tsx`
- `frontend/src/lib/api.ts`
- `main.py` Canvas save/load and execution endpoints

Phase 17 completed the native execution-node data layer. Phase 18 completed the native Generator/ComfyUI execution slice. Phase 19 completed Native Canvas LLM Nodes and the output-node overlap fix. Phase 20 completed Native Canvas Video Nodes, custom workflow field parity, ModelScope generation, loop nodes, and prompt group nodes. The final native Canvas sprint completed deterministic QA, native image crop/mask/split tools, output preview/compare, and handoff coverage for `/app/canvas` as a native, iframe-free work surface. Reviewer follow-up fixes aligned output compare layers in one coordinate frame and made grid split custom cuts accept both decimal and percentage input.

LLM execution is now native. At the final native Canvas boundary, image, workflow, LLM, video, and ModelScope execution now all run through native Canvas surfaces.

## Already Native

- `/app/canvas` is a native React route with zero iframe usage.
- Canvas list, search, create, open, title/icon editing, save, soft delete, trash, restore, and purge.
- Save conflict protection with `base_updated_at`.
- Native board grid, pan, wheel zoom, reset viewport, node select, and node drag.
- Existing simple connections render, including `{id, from, to}` and compatibility aliases such as `source/target`.
- Phase 16 adds visible node connection handles, drag-to-connect, preview links, selected/hovered link styling, selected link deletion, and soft connection warnings.
- Native authoring for prompt, image URL, output/reference, and group nodes.
- Native image editor for crop, mask-node creation, and grid split through `/api/ai/upload`.
- Native output preview/lightbox, output download, and compare slider for generated image outputs.
- Output compare renders source and generated images in one matched frame, with the slider revealing a clipped overlay rather than resizing the source image.
- Grid split custom cuts accept `0.25`, `25`, and `25%` as equivalent 25% cuts.
- Phase 17 adds native creation for LLM, video, and Workflow / ComfyUI node surfaces without triggering real execution.
- Inspector editing for node name, text/prompt, image URL, width, height, node delete, and Start link fallback.
- Phase 17 adds an execution preview/debug panel with selected-node context, one-hop graph input collection, prompt/image/output/video/text refs, and graph input warnings.
- Phase 18 adds native Generator node creation and real generator execution through `/api/canvas-image-tasks`.
- Phase 18 adds native ComfyUI text/enhance/edit/custom workflow execution through `/api/generate` and `/api/upload`.
- Phase 18 stores execution results in static-compatible `generatedOutputs`, `images`, `runStatus`, `runError`, `task_id`, and workflow metadata fields.
- Phase 19 fixes the output-node overlap regression by placing new image/workflow output nodes at deterministic non-overlapping positions near the source node or visible viewport.
- Phase 19 adds native LLM node execution through `/api/canvas-llm`, including direct text, upstream prompt/text context, optional image refs, chat mode history, `outputText`, `messages`, `runStatus`, and `runError`.
- Phase 20 adds native video node execution through `/api/canvas-video`, including prompt/image/video refs, video provider/model controls, frame-role mapping, `videos`, `runStatus`, and `runError`.
- Phase 20 adds native ModelScope generation nodes for ZImage, Qwen Edit, and Klein through the existing `/generate`, `/api/angle/generate`, and `/api/ms/generate` paths.
- Phase 20 adds native loop and prompt group authoring, with loop prompt-token rendering and legacy promptGroup `items` context collection.
- Image upload intake through `/api/ai/upload`.
- Gallery/recent/generated output intake into Canvas through Creation Rail.
- First native image execution loop for a selected prompt/image/output node through `/api/canvas-image-tasks`.
- Native local asset actions from Phase 15: check/download all local assets and selected local asset download.
- Creation Rail Canvas context for save state, nodes, links, selected node/link, execution state, assets, and last actions.
- Unknown node fields are preserved because `CanvasNode` is a `Record<string, unknown>` and save sends full node objects; unknown node fields must stay in native save payloads.

## Native Complete Surface

- `/app/canvas` is native React, iframe-free, and makes no `/static/canvas.html` request.
- Canvas lifecycle is native: create, open, rename, save, soft delete, trash, restore, and purge.
- Legacy canvas documents load and save without stripping unknown canvas, node, connection, viewport, log, or settings fields.
- Board interactions are native: pan, zoom, reset, select, move, resize, delete, drag handles, link creation, link selection, and link deletion.
- User-facing node types are native: prompt, image, output, group, promptGroup, loop, LLM, generator, msgen, Comfy/workflow, and video.
- Execution is native for selected prompt/image/output image execution, generator nodes, ComfyUI text/enhance/edit/custom workflows, LLM nodes, video nodes, and ModelScope nodes.
- Legacy-visible image editing is native: crop updates the image node, mask creates a linked mask image node, and grid split creates tile image nodes using `/api/ai/upload`.
- Output inspection is native: output/lightbox preview, direct output download, and compare slider against connected source imagery.
- Output compare alignment is part of the native baseline: source/result layers share one frame before clipping.
- Grid split cut parsing is compatible with both decimal fraction and legacy percentage input.
- Custom workflow fields render from `/api/workflows` detail metadata and submit static-compatible `params` through `/api/generate`.
- LLM downstream prompt refs prefer `outputText` only after an LLM run succeeds, preventing stale `text`/`prompt`/`chatInput` pollution.
- Output nodes use deterministic non-overlapping placement and preserve source-to-output links.
- Gallery/recent/generated output intake into Canvas is native through Creation Rail/local intake.
- Local asset check/download actions use the existing `/api/canvas-assets/check`, `/api/canvas-assets/download`, and `/api/download-output` endpoints.
- Light/dark theme persistence and mobile no-overflow behavior are covered by Playwright.

## Day-1 Native Requirements

The Day-1 native requirements are now implemented:

- Execution nodes for image generation, ModelScope generation, ComfyUI text/enhance/edit/custom workflow, LLM, and video are native.
- User-facing loop and prompt group node types are native and save-compatible.
- Stable graph input collection from Phase 16 connections covers prompt refs, image refs, generated outputs, videos, and LLM text outputs.
- Output insertion/update behavior remains compatible with `generatedOutputs`, `images`, `videos`, `outputText`, `_pending`, `runStatus`, and `runError` shapes.
- Save/load preservation keeps existing documents compatible without migrating unknown fields away.
- Inline run status/error surfaces exist for image, generator, workflow, LLM, video, and ModelScope execution classes.
- Image crop/mask/split and output preview/compare are native and covered by the complete Canvas QA.
- Asset download behavior from Phase 15 remains unchanged.
- Mobile-safe execution controls avoid horizontal overflow.
- Playwright covers endpoint payloads, failure paths, and save/reload compatibility.

## Later Hardening

- Typed ports, port labels, and stricter per-port validation can build on Phase 16 connection metadata without changing the current minimum `{id, from, to}` compatibility.
- A richer run graph visualization can be added on top of the deterministic one-hop execution collector.
- More specialized output inspection tools beyond the legacy lightbox/compare baseline can be layered onto the native output nodes without reintroducing a static iframe fallback.
- Real-user document sampling should continue before deleting the archived `static/canvas.html` file from the repository.

## Endpoint And Payload Mapping

### Canvas Save / Load

- `GET /api/canvases`
- `GET /api/canvases/{canvas_id}`
- `POST /api/canvases`
- `PUT /api/canvases/{canvas_id}`
- `DELETE /api/canvases/{canvas_id}`
- `POST /api/canvases/{canvas_id}/restore`
- `DELETE /api/canvases/{canvas_id}/purge`

`CanvasSaveRequest` in `main.py` accepts:

```json
{
  "title": "Canvas title",
  "icon": "layers",
  "nodes": [],
  "connections": [],
  "viewport": {},
  "logs": [],
  "settings": {},
  "client_id": "client",
  "base_updated_at": 0
}
```

Backend save replaces `nodes`, `connections`, `viewport`, `logs`, and `settings` on the loaded canvas object, so unknown top-level fields already present on the canvas survive unless those specific fields are overwritten. Unknown node/connection fields survive if the native frontend includes them in the arrays it sends.

### Image Generation

Native Phase 11 already uses:

- `POST /api/canvas-image-tasks`
- `GET /api/canvas-image-tasks/{task_id}`

Payload shape is `OnlineImageRequest`:

```json
{
  "prompt": "prompt text",
  "provider_id": "comfly",
  "model": "image-model",
  "size": "1024x1024",
  "quality": "auto",
  "reference_images": [{"url": "/output/ref.png", "name": "ref", "role": "linked-source"}]
}
```

The task result is a `GenerateRecord` with `images`, `prompt`, `model`, `provider_id`, `status`, and `params`.

Static Canvas `generator` nodes already use this path, with multiple task submissions for `count`.

### ModelScope Image / Edit

Static `msgen` maps these modes:

- Z-Image: `POST /generate`
- Qwen edit: `POST /api/angle/generate`
- Klein edit: `POST /api/ms/generate`

Payloads observed:

```json
{
  "prompt": "prompt",
  "resolution": "1024x1024",
  "client_id": "client"
}
```

```json
{
  "prompt": "prompt",
  "image_urls": ["data-or-url"],
  "client_id": "client"
}
```

```json
{
  "prompt": "prompt",
  "model": "black-forest-labs/FLUX.2-klein-9B",
  "image_urls": ["data-or-url"],
  "width": 1024,
  "height": 1024,
  "loras": {"Daniel8152/Klein-enhance": 0.8},
  "client_id": "client"
}
```

Native follow-up should decide whether `msgen` remains a distinct node class or folds into a provider-backed image/edit node. The endpoint contracts already exist; no backend schema change is needed for first parity.

### ComfyUI Text / Enhance / Edit / Workflow

Static `comfy` nodes call `POST /api/generate` with `GenerateRequest`.

Text-to-image:

```json
{
  "prompt": "prompt",
  "width": 1024,
  "height": 1024,
  "workflow_json": "Z-Image.json",
  "type": "zimage",
  "client_id": "client"
}
```

Enhance:

```json
{
  "workflow_json": "Z-Image-Enhance.json",
  "params": {
    "15": {"image": "uploaded-input-name.png"},
    "204": {"value": 0.5}
  },
  "type": "enhance",
  "client_id": "client"
}
```

Edit:

```json
{
  "prompt": "prompt",
  "workflow_json": "Flux2-Klein.json",
  "type": "klein",
  "params": {
    "168": {"text": "prompt"},
    "158": {"noise_seed": 123456},
    "278": {"image": "first.png"},
    "270": {"image": "second.png"},
    "292": {"image": "third.png"},
    "313": {"value": true},
    "314": {"value": false}
  },
  "client_id": "client"
}
```

Custom workflow:

```json
{
  "prompt": "prompt",
  "workflow_json": "custom/name.json",
  "type": "custom-workflow",
  "params": {
    "node_id": {"input_name": "value"}
  },
  "client_id": "client"
}
```

Comfy image inputs are uploaded first through:

- `POST /api/upload`

The upload response provides `files[0].comfy_name`, which is then used in workflow `params`.

Custom workflow metadata is managed by:

- `GET /api/workflows`
- `GET /api/workflows/{name:path}`
- `POST /api/workflows`
- `PUT /api/workflows/{name:path}/config`
- `DELETE /api/workflows/{name:path}`

### Upscale

Static Canvas uses `POST /api/generate` with `upscale.json` after uploading the selected/generated image through `/api/upload`:

```json
{
  "workflow_json": "upscale.json",
  "params": {
    "15": {"image": "uploaded-input-name.png"},
    "172": {"seed": 123456, "resolution": 2048}
  },
  "type": "enhance",
  "client_id": "client"
}
```

Enhance/edit nodes optionally call this after their first output.

### Video

Static `video` nodes call `POST /api/canvas-video`.

Payload shape is `CanvasVideoRequest`:

```json
{
  "prompt": "prompt",
  "provider_id": "comfly",
  "model": "veo3-fast",
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "",
  "images": [{"url": "/output/frame.png", "name": "frame", "role": "first_frame"}],
  "enhance_prompt": false,
  "enable_upsample": false,
  "watermark": false,
  "camera_fixed": false,
  "generate_audio": false
}
```

Backend returns:

```json
{
  "videos": ["/output/video.mp4"],
  "task_id": "upstream-task-id",
  "raw": {}
}
```

Static stores videos as output-like media and clears `generatedOutputs` on the video node.

### LLM

Static `llm` nodes call `POST /api/canvas-llm`.

Payload shape is `CanvasLLMRequest`:

```json
{
  "message": "input text",
  "model": "chat-model",
  "ms_model": "",
  "provider": "comfly",
  "system_prompt": "You are a helpful assistant.",
  "messages": [{"role": "user", "content": "previous"}],
  "images": ["/output/ref.png"]
}
```

Backend returns `{ "text": "assistant output" }`. Static stores the result on `node.outputText` and optionally appends chat messages.

Native Phase 19 now reuses this contract without a backend schema change:

- direct node mode sends selected node text plus one-hop upstream prompt/text/LLM refs as `message`.
- chat mode sends `chatInput` as `message` and preserves compatible `messages`.
- upstream image/output refs are sent in `images` only because the existing endpoint already supports them.
- success stores `outputText`, `messages`, `runStatus`, `runError`, `model`, and returned usage metadata compatibly.
- downstream workflow/generator nodes read LLM output through the Phase 17 text ref collector.

### Assets

Phase 15 native asset actions already map:

- `POST /api/canvas-assets/check` with `{ "urls": ["/output/a.png"] }`
- `POST /api/canvas-assets/download` with `{ "urls": ["/output/a.png"], "filename": "canvas-assets.zip" }`
- `GET /api/download-output?url=...&name=...` for selected `/output/...` assets

Native Canvas should continue filtering remote/data/blob URLs before local zip operations.

## Completed Phase 17-20 Order

Phase 17: Native execution-node data layer. Completed.

- Add graph input collectors using Phase 16 connections.
- Normalize prompt/image/video/LLM refs without changing saved node schemas.
- Add LLM/video/workflow node creation surfaces and an execution preview/debug panel.
- Keep actual execution limited to the existing Phase 11 image task path.
- Preserve save/load compatibility and unknown node fields.

Phase 18: Native image generator and ComfyUI text/enhance/edit/custom workflow. Completed.

- Implement `generator` and `comfy` node UI/run paths.
- Reuse `/api/canvas-image-tasks`, `/api/upload`, and `/api/generate`.
- Preserve static node fields such as `generatedOutputs`, `runStatus`, `runError`, and workflow params.
- Historical Phase 17 follow-up label: Phase 18: Native image generator and ComfyUI text/enhance/edit/upscale.

Phase 19: Native LLM nodes. Completed.

- Implement node/chat modes and `/api/canvas-llm` payloads.
- Store `outputText`, `messages`, `systemPrompt`, provider/model fields compatibly.
- Feed LLM text outputs into downstream prompt collection, using only `outputText` once an upstream LLM node has produced output.
- Fix the Phase 18 output-node overlap regression before adding LLM execution, so generated output nodes no longer intercept clicks on pre-existing right-side nodes.

Phase 20: Native video nodes. Completed.

- Implement video provider/model/duration/aspect/resolution/toggle controls.
- Reuse `/api/canvas-video`.
- Preserve `videos`, output node media rendering, and video asset downloads.
- Add native ModelScope generation nodes for ZImage, Qwen Edit, and Klein without changing backend endpoint schemas.
- Add native loop and prompt group authoring surfaces with deterministic prompt output collection.

Post-migration hardening:

- Continue sampling real user Canvas documents before deleting archived static files from the repository.
- Add richer graph visualization and typed ports as product refinements on top of the existing compatible connection shape.
- Keep final Playwright mocked success/failure coverage current as provider contracts evolve.

## Compatibility Risks

- `PUT /api/canvases/{canvas_id}` replaces `nodes` and `connections`; any native save that drops unknown fields will permanently remove them from that canvas.
- Some static runtime fields begin with `_` such as `_pending`. Native save should continue preserving loaded runtime fields unless a future documented migration intentionally changes them.
- Existing connections may use `from/to`, `source/target`, or `fromNodeId/toNodeId`. Native code should continue reading these aliases until a migration is explicit.
- Backend currently accepts arbitrary connection dicts, but Phase 16 creates only `{id, from, to}`. Typed ports should wait for a documented contract.
- Static Canvas stores execution state in node objects (`generatedOutputs`, `videos`, `outputText`, `runStatus`, `runError`, `comfyParams`, provider/model fields). Native nodes must preserve these fields even when not understood.
- Asset URLs may be local `/output`, `/assets`, `/static/assets`, remote HTTP, data URLs, or nested object values. Phase 15 filtering should remain the local-download authority.
- ComfyUI image inputs require `/api/upload` and returned `comfy_name`; direct output URLs are not valid workflow image names.
- Several static paths perform async polling or long-running provider calls. Native UI should treat status and cancellation as UI state first, not schema changes.
