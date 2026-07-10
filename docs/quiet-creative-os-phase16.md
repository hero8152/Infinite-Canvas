# Quiet Creative OS Phase 16

## Canvas Connection UX Foundation

Phase 16 makes native Canvas connections visible, editable, save-compatible, and ready for future execution nodes.

- `/app/canvas` remains native and iframe-free.
- `static/canvas.html remains unchanged`.
- `no backend API schema changes`.
- Phase 15 asset actions remain preserved.
- Existing saved `{from,to}` connections render.
- existing saved {from,to} connections render.
- LLM, video, and custom workflow Canvas execution remain deferred.
- Canvas Completion Plan added at `docs/quiet-creative-os-canvas-completion-plan.md`.

## What Changed

Canvas connection UX:

- Added visible node connection handles:
  - generic input handle on the left edge
  - generic output handle on the right edge
  - light/dark styling with no node card resize
- Added drag-to-connect:
  - drag from an output handle to another node input handle
  - preview line while dragging
  - Escape/background/invalid release cancels safely
  - same-node and duplicate links are ignored with inline status
- Improved connection rendering:
  - existing `{id, from, to}` and older `source/target` aliases still render
  - hover and selected links are visually distinct
  - preview and weak-link states use temporary/dashed styling
- Added link selection/editing:
  - click a link to select it
  - selected link can be deleted from the inspector
  - Delete/Backspace deletes the selected link when focus is not inside a form field
  - selected node inspector still lists connected links

Connection semantics:

- Node kinds are classified softly as `prompt`, `text`, `image`, `output`, `group`, or `unknown`.
- Weak links such as group-to-group are allowed but show an inline warning.
- typed ports remain future direction; Phase 16 only prepares the UI and context layer.

Creation Rail context:

- Connection count.
- Selected link label/id.
- Pending link/drag state.
- Last connection action.
- Soft connection warning.

## Data Compatibility

Phase 16 stores only compatible minimum data for newly created links:

```json
{
  "id": "link-example",
  "from": "source-node-id",
  "to": "target-node-id"
}
```

The frontend still reads compatibility aliases such as `source`, `sourceId`, `fromNodeId`, `target`, `targetId`, and `toNodeId` for older/simple documents. Save payloads still include the full `connections` array. Unknown node fields and existing canvas fields remain preserved by the existing Canvas save/load flow.

No `fromPort`, `toPort`, or `type` metadata is required yet. Future typed ports should be added only after frontend and backend contracts are explicit.

## Preserved / Deferred

Preserved:

- Phase 15 Canvas asset check/download actions.
- ComfyUI P3 reload/status fix.
- Native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle, API / Models, ComfyUI.
- Existing direct static fallback/reference file for `static/canvas.html`.
- Source-inspection-based Canvas Completion Plan covering native status, missing work, endpoint/payload mapping, Phase 17-21 order, and save/load risks.

Deferred:

- LLM, video, and custom workflow Canvas execution remain deferred.
- Execution-node typed-port mapping remains a follow-up.
- Advanced graph scheduling and complex multi-select remain follow-up work.

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
- Port 3000 clear after stop: PASS; `lsof -nP -iTCP:3000 -sTCP:LISTEN` returned no listener.

Playwright QA result: PASS with mocked Canvas data.

Playwright QA coverage:

- `/app/canvas` has zero iframes.
- Existing saved `{from,to}` connections render.
- Dragging an output handle to another node input handle creates a connection.
- Same-node connection is safely ignored.
- Duplicate connection is safely ignored.
- Preview line appears while dragging.
- Selected link can be deleted.
- Inspector Start link fallback still works.
- Save payload includes created/deleted connections correctly.
- Reload after save preserves connections.
- Unknown node fields and existing canvas fields survive save.
- Phase 15 asset actions still work.
- Mobile layout has no horizontal overflow.
- Native route console/page errors are zero in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase16-canvas-links-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase16-canvas-links-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase16-canvas-links-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase16-canvas-links-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase16-canvas-link-selected-desktop.png`

## Known Risks

- Connection semantics are intentionally soft; future execution nodes still need explicit typed-port contracts.
- Link hit testing uses browser pointer events over SVG paths and should remain covered by Playwright before deeper graph work.
- Playwright QA uses isolated Chromium automation, not the user's normal Chrome profile.
