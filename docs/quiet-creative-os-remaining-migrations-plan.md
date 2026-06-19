# Quiet Creative OS Remaining Migration Plan

## Current Status

The product route migration is complete for the known Quiet Creative OS workspaces:

- Generate: native
- Enhance: native
- Edit: native
- Online: native
- Angle: native
- Chat: native
- Gallery: native
- Canvas: native
- API / Models: native
- ComfyUI: native

Canvas is no longer an embedded iframe route. `/app/canvas` is native React, renders zero iframes, and does not request `/static/canvas.html`. The archived `static/canvas.html` file remains directly reachable and unchanged for reference/compatibility.

## Canvas Native Coverage

Implemented and verified:

- canvas create/open/rename/save/delete/trash/restore/purge.
- unknown-field preserving save/load for canvas objects, nodes, connections, viewport, logs, and settings.
- native board pan, zoom, reset, node select/move/resize/delete.
- native prompt, image, output, group, prompt group, loop, LLM, generator, ModelScope, Comfy/workflow, and video nodes.
- native image editor crop, mask creation, and grid split through `/api/ai/upload`.
- native output preview/lightbox, output download, and compare slider for generated image outputs.
- native output compare alignment in one shared source/result coordinate frame.
- native grid split custom cut parsing for decimal fractions and legacy percentage values.
- native visible handles, drag-to-connect, Start link fallback, link select/delete, and `{id, from, to}` compatibility.
- native image, generator, Comfy/workflow/custom workflow, LLM, video, and ModelScope execution.
- native custom workflow field rendering through `/api/workflows`.
- deterministic one-hop graph collection, LLM `outputText` downstream precedence, and output-node non-overlap placement.
- native Gallery/recent/generated asset intake through Creation Rail/local intake.
- native local asset check/download actions.
- light/dark theme persistence and mobile no-overflow.

## Endpoint Mapping

Canvas save/load:

- `GET /api/canvases`
- `GET /api/canvases/{canvas_id}`
- `POST /api/canvases`
- `PUT /api/canvases/{canvas_id}`
- `DELETE /api/canvases/{canvas_id}`
- `POST /api/canvases/{canvas_id}/restore`
- `DELETE /api/canvases/{canvas_id}/purge`

Canvas image/generator execution:

- `POST /api/canvas-image-tasks`
- `GET /api/canvas-image-tasks/{task_id}`

Comfy/workflow execution:

- `POST /api/generate`
- `POST /api/upload`
- `GET /api/workflows`
- `GET /api/workflows/{name:path}`

LLM execution:

- `POST /api/canvas-llm`

Video execution:

- `POST /api/canvas-video`

ModelScope image/edit execution:

- `POST /generate`
- `POST /api/angle/generate`
- `POST /api/ms/generate`

Canvas local assets:

- `POST /api/canvas-assets/check`
- `POST /api/canvas-assets/download`
- `GET /api/download-output?url=...&name=...`

## Remaining Work Type

Remaining work is hardening and product refinement, not route migration:

- sample real user canvas documents before deleting archived static files from the repository.
- consider typed ports and stricter port validation after the compatible `{id, from, to}` shape has stabilized.
- add richer run graph visualization on top of the existing deterministic collector.
- add specialized output inspection tools beyond the migrated lightbox/compare baseline without reintroducing static iframe fallback.
- keep Playwright mocked success/failure coverage and screenshots current as providers evolve.

## Guardrail Expectations

Guardrails should continue to fail if:

- any completed native route becomes embedded again.
- `/app/canvas` references or requests `/static/canvas.html`.
- `static/canvas.html` or `static/comfyui-settings.html` is modified during native-route work.
- Canvas execution paths stop using existing backend contracts.
- LLM `outputText` downstream precedence regresses.
- output-node non-overlap placement regresses.
- native image editor or output compare coverage disappears from complete Canvas QA.
- output compare source/result layers stop sharing a matched frame.
- custom grid split cuts stop accepting both `0.25` and `25`/`25%` style input.
- required screenshots or final handoff docs are missing.
