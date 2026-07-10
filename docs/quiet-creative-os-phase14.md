# Quiet Creative OS Phase 14

## Native ComfyUI Settings Migration

Phase 14 migrates ComfyUI settings from an embedded static page into the React shell.

- `/app/comfyui is native`.
- `/app/comfyui` renders `ComfyUIWorkspace`, not `EmbeddedWorkbench`.
- `/app/comfyui` has no iframe and does not request `static/comfyui-settings.html`.
- `direct /static/comfyui-settings.html` remains available as a static fallback/reference.
- `static/comfyui-settings.html remains unchanged`.
- No backend API schema changes were made; Phase 14 made no backend API schema changes.

## What Was Migrated

The native workspace lives under `frontend/src/features/comfyui/`.

Native ComfyUI now supports:

- ComfyUI instance list loading and editing.
- Instance save through `PUT /api/comfyui/instances`, preserving backend normalization response.
- Workflow list loading through `GET /api/workflows`.
- Empty custom workflow state.
- Workflow detail loading through `GET /api/workflows/{name}`.
- `workflow name encoding` with path-segment encoding for names such as `custom/example.json`.
- Workflow title/name, builtin/custom status, field count, and node count.
- Node graph preview from node id, `class_type`, and input names.
- Config JSON editor.
- Config save through `PUT /api/workflows/{name}/config`.
- Builtin workflow read-only behavior when the backend returns `builtin: true`.
- Client-side upload validation for valid non-empty ComfyUI API workflow JSON.
- Upload through `POST /api/workflows` and selection of the uploaded workflow after success.
- Custom-only two-step delete through `DELETE /api/workflows/{name}`.
- Test run through `POST /api/workflows/{name}/run` with `custom-workflow-test`.
- Creation Rail context for instances, primary instance, selected workflow, custom/builtin status, field/node counts, last action, test state, output count, and errors.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `GET /api/comfyui/instances`
- `PUT /api/comfyui/instances`
- `GET /api/workflows`
- `GET /api/workflows/{name}`
- `POST /api/workflows`
- `PUT /api/workflows/{name}/config`
- `DELETE /api/workflows/{name}`
- `POST /api/workflows/{name}/run`

## Test Run Payload

The native test run matches the static settings page behavior:

```json
{
  "prompt": "test run from settings",
  "width": 1024,
  "height": 1024,
  "type": "custom-workflow-test",
  "fields": {
    "field_id": "default value"
  },
  "config": {
    "title": "Workflow",
    "fields": []
  },
  "client_id": "browser-client-id"
}
```

`fields` is built from `config.fields[*].default`, keyed by each field `id`.

## Preserved / Deferred

Preserved:

- Native routes: Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas, API / Models, ComfyUI.
- `/legacy` redirect/normalization behavior.
- Overlay-only Creation Rail behavior.
- `static/comfyui-settings.html` on disk and directly accessible.
- `static/api-providers.html` on disk and directly accessible.

Deferred:

- Any backend workflow schema changes.
- Full Canvas workflow-node execution migration beyond the existing Canvas image execution loop.
- Rich graph visualization beyond a compact node id/class/input preview.
- Real ComfyUI availability in browser QA; mocked endpoints cover the native UI contract.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Command results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: PASS; FastAPI started on `http://127.0.0.1:3000` and was stopped cleanly before handoff.
- Port 3000 clear after stop: PASS.

Playwright QA result: PASS with mocked ComfyUI/workflow responses and direct static-page verification.

Playwright QA coverage:

- `/app/comfyui` loads native React ComfyUI with zero iframes.
- `/app/comfyui` makes no `/static/comfyui-settings.html` request.
- `direct /static/comfyui-settings.html` still loads.
- Instance load and save work with mocked endpoints.
- Workflow list and detail load with mocked endpoints.
- Workflow detail uses encoded workflow names with slashes.
- Config save payload is correct.
- Invalid upload is rejected inline.
- Valid upload sends the expected `POST /api/workflows` payload and selects the uploaded workflow.
- Delete requires confirmation and calls `DELETE` only for custom workflows.
- Test run sends `prompt: "test run from settings"`, `width: 1024`, `height: 1024`, `type: "custom-workflow-test"`, defaults-derived fields, config, and client id.
- Creation Rail updates for ComfyUI context.
- Theme persistence works.
- Mobile ComfyUI layout renders at 390x844 with no horizontal overflow.
- Existing native routes remain native.
- Native route console and page errors are zero in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase14-comfyui-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase14-comfyui-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase14-comfyui-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase14-comfyui-mobile-dark.png`

## Known Risks

- Real test run behavior depends on reachable ComfyUI instances, workflow validity, and queue availability.
- The backend currently lists custom workflows through `GET /api/workflows`; builtin handling is honored when a detail response returns `builtin: true`.
- Workflow upload validation is intentionally local and schema-light; backend validation remains authoritative.
- Playwright QA uses isolated Chromium automation, not the user's normal Chrome profile.
