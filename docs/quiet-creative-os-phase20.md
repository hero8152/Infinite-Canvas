# Quiet Creative OS Phase 20

## Native Canvas Video Nodes

Phase 20 adds native Canvas video node execution through the existing `POST /api/canvas-video` backend contract and native ModelScope generation nodes through existing image endpoints.

- `/app/canvas` remains native and iframe-free.
- `static/canvas.html remains unchanged`.
- `static/comfyui-settings.html remains unchanged`.
- `no backend API schema changes`.
- save remains explicit after execution updates.
- Phase 15 asset actions remain preserved.
- Phase 16 connection UX remains preserved.
- Phase 17 execution preview remains preserved.
- Phase 18 generator/comfy execution remains preserved.
- Phase 19 LLM execution remains preserved, including outputText-only downstream prompt collection.

## What Changed

- Added typed frontend helpers for `POST /api/canvas-video`.
- Native ModelScope nodes now support ZImage, Qwen Edit, and Klein using `/generate`, `/api/angle/generate`, and `/api/ms/generate`.
- Native loop and prompt group nodes are now createable and editable, with loop token rendering and promptGroup `items` prompt collection for legacy documents.
- Native video nodes now run from the selected-node inspector with provider, model, duration, aspect ratio, resolution, and static-compatible toggles.
- Phase 17 one-hop graph context supplies prompt refs, upstream image/output refs, and upstream video refs.
- `useFrameRoles` maps the first two upstream image refs to `first_frame` and `last_frame`; remaining refs use `reference_image`.
- Success writes static-compatible `videos`, `runStatus`, `runError`, `task_id`, provider/model metadata, and linked output node media.
- Failure writes inline `runStatus: "failed"` and `runError`.
- Output nodes now render video URLs stored in existing `images` or `videos` fields.
- ModelScope success writes static-compatible `generatedOutputs`, `runStatus`, `runError`, model metadata, and linked output node images.

## Verification Targets

- `/app/canvas` has zero iframes and makes no `/static/canvas.html` request.
- Video node can run with direct/upstream prompt context.
- Video node can run with upstream image/output refs.
- Video node success writes `videos`, `runStatus`, and linked output node media.
- Video node failure renders inline error and saves `runError`.
- ModelScope node success and failure use the same native output insertion and inline error path as generator/workflow nodes.
- Save/reload preserves `videos`, `runStatus`, `runError`, and unknown fields.
- Phase 15 asset actions still collect/download local video assets.
- Phase 16 drag-to-connect and selected-link deletion still work.
- Phase 17 execution preview still includes video refs.
- Phase 18 generator/comfy execution still works.
- Phase 19 LLM outputText-only downstream behavior still works.
- Mobile light/dark has no horizontal overflow.

## Screenshots

Screenshots must be produced during final Canvas completion verification.
