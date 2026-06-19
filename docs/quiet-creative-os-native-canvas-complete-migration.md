# Quiet Creative OS Native Canvas Complete Migration

This sprint completes the native `/app/canvas` migration path while leaving `static/canvas.html` archived and directly reachable. The product Canvas route is native React, iframe-free, and does not request `/static/canvas.html`. static/canvas.html remains archived for direct reference only.

## Initial Guard

- `pwd`: `/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1`
- `git status -sb`: clean after local checkpoint commit `1887876 feat(qcos): migrate native creative os canvas`.
- `git branch --show-current`: `codex/quiet-creative-os-phase1`

## Legacy Canvas Audit Checklist

All items below were mapped from local inspection of `static/canvas.html`, `frontend/src/features/canvas/CanvasWorkspace.tsx`, `frontend/src/features/canvas/canvas.css`, `frontend/src/lib/api.ts`, `main.py`, `docs/quiet-creative-os-canvas-completion-plan.md`, and `REVIEW_HANDOFF.md`.

| Legacy Canvas capability | Native status |
| --- | --- |
| Canvas create/open/rename/save/delete/trash/restore/purge | implemented natively and verified |
| Existing document load/save with unknown canvas/node/connection fields | implemented natively and verified |
| Viewport pan, zoom, reset, and saved viewport/settings/logs | implemented natively and verified |
| Prompt, image, output, group, prompt group, loop, LLM, generator, ModelScope, Comfy/workflow, and video node surfaces | implemented natively and verified |
| Node select, edit, move, resize, and delete | implemented natively and verified |
| Image editor crop, mask creation, and grid split | implemented natively and verified through existing `/api/ai/upload` |
| Output preview lightbox, download action, and image compare slider | implemented natively and verified |
| Output compare coordinate alignment | implemented natively and verified; source and generated layers share one frame |
| Grid split custom cuts | implemented natively and verified for decimal fractions and percentages |
| Visible connection handles, drag-to-connect, fallback Start link, link select/delete | implemented natively and verified |
| Static-compatible minimum `{id, from, to}` connections | implemented natively and verified |
| Prompt/image/output selected image execution | implemented natively and verified through `/api/canvas-image-tasks` |
| Generator execution | implemented natively and verified through `/api/canvas-image-tasks` |
| ComfyUI text/enhance/edit/custom workflow execution | implemented natively and verified through `/api/generate`, `/api/upload`, and `/api/workflows` metadata |
| Custom workflow editable parameters and random fields | implemented natively and verified |
| LLM node execution and chat-compatible message storage | implemented natively and verified through `/api/canvas-llm` |
| LLM downstream prompt refs | implemented natively and verified; completed LLM nodes emit `outputText` only |
| Video node execution | implemented natively and verified through `/api/canvas-video` |
| ModelScope ZImage/Qwen Edit/Klein execution | implemented natively and verified through `/generate`, `/api/angle/generate`, and `/api/ms/generate` |
| Output insertion/update and source-to-output linking | implemented natively and verified |
| Phase 18 output-node overlap regression | fixed and verified with right-side node click interception coverage |
| Gallery/recent/generated output intake into Canvas | implemented natively and verified through Creation Rail/local intake |
| Local asset check/download all and selected asset download | implemented natively and verified through existing asset endpoints |
| Inline pending/running/succeeded/failed status and explicit errors | implemented natively and verified for image, generator, workflow, LLM, and video paths |
| Light/dark theme persistence and mobile layout | implemented natively and verified |
| Native route preservation for Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas, API / Models, and ComfyUI | implemented natively and verified |
| `static/canvas.html` direct archive | static/canvas.html remains archived/directly reachable and unchanged; it is not used by `/app/canvas` |

## What Changed

- Completed the Phase 19 LLM downstream fix: a completed LLM node contributes only `outputText` to downstream generator/workflow context.
- Added native LLM execution through the existing `/api/canvas-llm` contract.
- Added native video execution through the existing `/api/canvas-video` contract.
- Added native ModelScope node execution through existing ModelScope image/edit routes.
- Added native custom workflow parameter rendering and mapping through existing workflow metadata endpoints.
- Added native image crop, mask, and grid split tools that upload edited PNG assets through `/api/ai/upload`.
- Added native output preview/lightbox, download, and compare-slider inspection for generated outputs with saved `imageComparisons` metadata.
- Fixed output compare alignment by clipping a full-size source overlay inside the generated-result coordinate frame.
- Fixed grid split custom cuts to accept both decimal fractions like `0.25` and percentage values like `25` or `25%`.
- Added native loop and prompt group node creation/context collection.
- Kept output insertion deterministic with non-overlapping placement near the source node or visible viewport.
- Added deterministic Playwright coverage for success paths, failure paths, lifecycle/trash flows, mobile/theme, static-route absence, and screenshots.
- Added guardrails for native-complete artifacts, screenshots, static file preservation, and final documentation.

## Data Compatibility

The frontend still saves through the existing `PUT /api/canvases/{canvas_id}` payload. Nodes and connections remain open `Record<string, unknown>` objects, and native save sends full `nodes`, `connections`, `viewport`, `logs`, and `settings` arrays/objects.

No backend API schema changes were introduced. The implementation reuses existing endpoints and static-compatible fields such as `generatedOutputs`, `images`, `videos`, `outputText`, `messages`, `runStatus`, `runError`, `task_id`, `providerId`, `model`, `workflow_json`, `comfyWorkflow`, and `comfyParams`.

## Playwright QA

`frontend/tests/native_canvas_complete_qa.spec.mjs` verifies:

- `/app/canvas` has zero iframes and makes no `/static/canvas.html` request.
- Legacy canvas data loads without unknown-field loss.
- Create, rename, save, move to trash, restore, and purge.
- Pan/zoom/reset.
- Node creation for Loop and Prompt group plus existing node rendering for all migrated node types.
- Image editor crop, mask, and grid split paths upload edited assets and preserve them through explicit save.
- Output preview opens in a lightbox and generated workflow output can be compared against its connected image ref.
- Output compare source/result layers share a bounding box, and the slider position is verified against the selected percentage.
- Grid split custom cuts accept mixed decimal/percentage input in the same flow.
- Drag connection creation and selected-link deletion.
- Save/reload preserves nodes, links, output fields, run state, viewport, logs, settings, and unknown fields.
- Selected prompt image execution, generator execution, custom workflow execution, LLM execution, video execution, and ModelScope execution.
- LLM outputText-only downstream regression.
- Output-node non-overlap regression.
- Failure UI and saved `runError` for LLM, generator, workflow, and video paths.
- Local asset check/download.
- Theme persistence and mobile no-overflow.
- Native route smoke for all completed native routes.
- Console/page errors remain zero in the mocked success pass.

## Screenshots

- `docs/quiet-creative-os/screenshots/native-canvas-complete-desktop-light.png`
- `docs/quiet-creative-os/screenshots/native-canvas-complete-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/native-canvas-complete-mobile-light.png`
- `docs/quiet-creative-os/screenshots/native-canvas-complete-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/native-canvas-node-types.png`
- `docs/quiet-creative-os/screenshots/native-canvas-links.png`
- `docs/quiet-creative-os/screenshots/native-canvas-llm-to-generator.png`
- `docs/quiet-creative-os/screenshots/native-canvas-image-result.png`
- `docs/quiet-creative-os/screenshots/native-canvas-workflow-result.png`
- `docs/quiet-creative-os/screenshots/native-canvas-custom-workflow.png`
- `docs/quiet-creative-os/screenshots/native-canvas-video-result.png`
- `docs/quiet-creative-os/screenshots/native-canvas-save-reload.png`

## Constraints Confirmed

- no backend API schema changes
- no `static/canvas.html` rewrite
- no `static/comfyui-settings.html` rewrite
- no legacy iframe fallback for `/app/canvas`
- local checkpoint commit `1887876` exists; no push, merge, or rebase
- no new worktree
