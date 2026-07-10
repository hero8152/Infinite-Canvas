# Quiet Creative OS Phase 10

## Native Canvas Authoring & Asset Intake

Phase 10 extends the Phase 9 native Canvas foundation into everyday composition.

- /app/canvas remains native.
- `/app/canvas` has no iframe and no `static/canvas.html` dependency.
- static/canvas.html remains unchanged as a direct fallback/reference.
- No backend API schema changes were made; Phase 10 made no backend API schema changes.
- unknown node fields survive native edit/save round trips.
- Gallery selected asset -> Canvas is supported through a native frontend intake path.
- full node execution is deferred.

## Authoring Features Added

Native Canvas now supports:

- Create Prompt/Text nodes.
- Create Image URL nodes.
- Create Output/Reference image nodes.
- Create Group/section nodes.
- Upload image files through the existing AI upload endpoint and place them as image nodes.
- Edit selected node name/title.
- Edit selected node text or prompt.
- Edit selected image URL.
- Edit selected node width and height.
- Delete selected nodes with connected-link confirmation.
- Create links by selecting a source node and then selecting a target node.
- Delete selected-node links.
- Render broken or missing image URLs as placeholders.
- Keep Creation Rail context updated with selected node, link state, intake state, save state, node count, and connection count.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `GET /api/canvases`
- `POST /api/canvases`
- `GET /api/canvases/{canvas_id}`
- `PUT /api/canvases/{canvas_id}`
- `DELETE /api/canvases/{canvas_id}`
- `GET /api/canvases/trash`
- `POST /api/canvases/{canvas_id}/restore`
- `DELETE /api/canvases/{canvas_id}/purge`
- `POST /api/ai/upload`
- `GET /api/gallery/assets`

## Intake Behavior

Implemented safe frontend intake without using old Canvas postMessage paths:

- Gallery selected asset -> Canvas image/output node.
- Creation Rail selected Gallery asset -> Canvas.
- Creation Rail latest generated output -> Canvas output node.
- Creation Rail recent asset -> Canvas image node.

The intake bridge stores existing asset URLs in `qcos_canvas_intake_items`, dispatches a same-tab `qcos:canvas-intake` event, and navigates to `/app/canvas`. If there is no active canvas target, Canvas does not auto-open the first canvas. It shows a `Choose a Canvas target` state and keeps items queued until the user explicitly opens an existing canvas or creates a new canvas. The queued assets are placed only after that explicit target choice.

## Data Preservation Strategy

- Existing canvas documents still save through `PUT /api/canvases/{canvas_id}` with `base_updated_at`.
- Existing nodes are edited through object spreading, so unknown node fields remain present.
- Existing connections are preserved unless a user explicitly deletes that link or deletes a connected node.
- Node deletion only removes the selected node and its connected links.
- Viewport updates spread the existing viewport object, preserving unknown viewport fields.
- Logs and settings are passed through the save payload.
- Backend save behavior loads the existing document first, preserving unknown top-level canvas fields while replacing known canvas fields.

## Deferred Work

Phase 10 intentionally does not migrate full old Canvas execution internals:

- Full image generation node execution.
- Full video node execution.
- Full LLM node execution.
- Full ComfyUI workflow execution from Canvas.
- Crop/mask/image editor internals.
- Rich multi-select and complex link routing.
- Drag-to-canvas receiver behavior from all workspaces.

Those belong in Phase 11 or later, one execution node class at a time.

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
npm run build
python scripts/guardrails.py
python main.py
```

Results are recorded in `REVIEW_HANDOFF.md`.

Browser QA coverage:

- `/app/canvas` loads native React Canvas.
- `/app/canvas` has zero iframes.
- `/app/canvas` does not load `static/canvas.html`.
- `/static/canvas.html` still loads directly.
- Create prompt/text node, save, reload, and verify persistence.
- Create image node from URL, save, reload, and verify persistence.
- Upload image asset through mocked `/api/ai/upload` and verify node creation.
- Edit node title/text/size, save, reload, and verify persistence.
- Delete a node and verify connected links are removed.
- Create and delete a link.
- Unknown node, connection, viewport, settings, logs, and top-level fields survive save.
- Gallery selected asset -> Canvas intake works.
- Gallery/Rail -> Canvas intake does not auto-place assets into the first listed canvas; queued assets wait for an explicit open/create target choice.
- Creation Rail shows Canvas context and does not resize the workspace.
- Mobile Canvas remains usable.
- Existing native routes still work: Generate, Enhance, Edit, Online, Chat, Gallery.
- Angle, API / Models, and ComfyUI remain reachable as embedded routes.
- Native route console has no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase10-canvas-authoring-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase10-canvas-authoring-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase10-canvas-authoring-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase10-canvas-authoring-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase10-canvas-linking-desktop.png`
- `docs/quiet-creative-os/screenshots/phase10-canvas-asset-intake-desktop.png`

## Known Risks

- Native authoring supports basic composition, but not provider execution.
- Generated node schemas are compatible extensions of the existing Canvas JSON, but old `static/canvas.html` may not provide rich editors for every new field.
- Upload QA uses mocked `/api/ai/upload`; real upload still depends on local filesystem permissions and output directory availability.
- Browser QA uses an isolated automation context rather than the user's normal Chrome profile.
