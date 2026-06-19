# Quiet Creative OS Native Canvas Complete Migration Goal

You are executing the final native Canvas migration sprint. This is not another small phase. The objective is a complete, production-usable migration of the legacy Canvas experience into `/app/canvas`.

## Initial Guard

Before doing anything, run and report:

```bash
pwd
git status -sb
git branch --show-current
```

Required worktree:

```text
/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1
```

Required branch:

```text
codex/quiet-creative-os-phase1
```

If either path or branch is wrong, stop immediately. Do not inspect or edit files.

## Hard Rules

- Do not create a new worktree.
- Do not commit, push, merge, or rebase.
- Do not rewrite git history.
- Do not remove user work or revert unrelated dirty files.
- `/app/canvas` must stay native React.
- `/app/canvas` must render zero iframes.
- `/app/canvas` must not request `/static/canvas.html`.
- `static/canvas.html` may remain archived/directly reachable, but it must no longer be needed by the product Canvas route.
- Preserve unknown canvas, node, connection, viewport, log, and settings fields on save/reload.
- Keep existing native routes working: Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas, API / Models, ComfyUI.
- Do not use "deferred", "MVP", "blocked", or "fallback to legacy" as a completion strategy.
- If a missing backend capability prevents full migration, implement the backend support in this worktree while preserving backward compatibility. Do not break existing API consumers.
- If external provider credentials are missing, still verify the UI, payload, state, error, and mocked success paths. If valid local credentials already exist, also run one minimal live smoke test where practical and safe.

## Definition Of Complete

The migration is complete only when `/app/canvas` can replace legacy `static/canvas.html` for real daily work.

The user must be able to:

- create, open, rename, save, delete, trash, restore, and purge canvases;
- preserve and reload existing legacy canvas documents;
- pan, zoom, reset view, and work on a large board without layout corruption;
- add, edit, resize, move, select, and delete all user-facing Canvas node types from the legacy Canvas;
- connect nodes visually with reliable drag handles;
- select and delete links;
- save and reload minimum compatible `{id, from, to}` connections;
- use prompt, text, image, output, group, LLM, generator, workflow/ComfyUI, video, and any other user-facing legacy Canvas node types;
- run image generation from prompt/image/output context;
- run generator nodes;
- run ComfyUI/workflow nodes, including custom workflow params;
- run LLM nodes;
- run video nodes if legacy Canvas exposes video execution;
- see pending/running/succeeded/failed states inline on nodes and in the inspector;
- save and reload outputs, task ids, provider/model metadata, errors, and run state;
- send Gallery or Creation Rail assets into Canvas safely;
- check/download local output assets;
- use the app in light and dark themes;
- use desktop and mobile layouts without horizontal overflow;
- keep using all previously migrated native workspaces.

## Required Audit First

Before implementing, audit these files and write a checklist in the final handoff:

- `static/canvas.html`
- `frontend/src/features/canvas/CanvasWorkspace.tsx`
- `frontend/src/features/canvas/canvas.css`
- `frontend/src/lib/api.ts`
- `main.py`
- `docs/quiet-creative-os-canvas-completion-plan.md`
- `REVIEW_HANDOFF.md`

The checklist must map every user-facing legacy Canvas capability to one of:

- implemented natively and verified;
- not user-facing / dead legacy code, with evidence;
- removed only if the product no longer exposes it anywhere.

Do not leave user-facing legacy Canvas capabilities unmapped.

## Required Fixes From Review

Fix the Phase 19 P2 issue:

- When an LLM node is used as upstream context, downstream generator/workflow nodes must prefer the LLM node's `outputText`.
- If `outputText` exists, do not also pass the LLM node's original `text`, `prompt`, or `chatInput` downstream.
- Only fall back to original LLM input fields when `outputText` is empty.
- Add guardrails and Playwright coverage for this regression.

Fix documentation drift:

- Correct any misleading severity language such as calling a P2 fix a "Priority 0 Fix".
- Replace remaining "deferred Canvas migration" wording with truthful final status.

## Implementation Requirements

### Native Canvas Parity

Implement native parity for all user-facing Canvas behavior discovered in the audit. Preserve existing data shapes where possible. For new data needed by native execution, make it backward-compatible and tolerant of old documents.

### Execution

All Canvas execution paths must be native:

- image execution through existing Canvas image task flow;
- generator execution;
- ComfyUI/workflow execution;
- custom workflow execution with editable params;
- LLM execution through the existing Canvas LLM backend flow;
- video execution through the existing Canvas video backend flow or a backward-compatible backend implementation if needed.

Each execution path needs:

- input validation;
- provider/model controls where applicable;
- pending/running/succeeded/failed UI;
- inline error rendering;
- output insertion/update on the board;
- source-to-output connection where appropriate;
- deterministic non-overlapping output placement;
- explicit save behavior;
- save/reload preservation.

### Graph Semantics

Graph collection must be deterministic and predictable:

- one-hop upstream context must work reliably;
- downstream prompt pollution must be prevented;
- duplicate refs must be deduped;
- image/output/video/text refs must be typed clearly;
- selected-node execution must not accidentally consume unrelated board nodes;
- link creation must reject same-node and duplicate links;
- existing compatible links must still load and render.

### UI Quality

The final UI must be usable, not just technically wired:

- no overlapping controls;
- no unusable clipped text;
- no hidden primary action on common desktop sizes;
- no page-level horizontal overflow on mobile;
- Creation Rail must be overlay-only and must not resize the workspace;
- dark and light themes must both be readable;
- loading, empty, error, and success states must be explicit.

## Guardrails

Update `scripts/guardrails.py` so it fails if:

- `/app/canvas` is not native;
- `/app/canvas` uses an iframe;
- native Canvas references `/static/canvas.html`;
- legacy fallback navigation is reintroduced for Canvas;
- static Canvas is modified unexpectedly;
- output placement no longer uses non-overlapping placement;
- LLM upstream outputText-only behavior regresses;
- any completed native execution path is removed;
- required screenshots are missing or empty;
- docs claim completion without the required verification notes.

## Required Verification Commands

Run and report exact results:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
lsof -nP -iTCP:3000 -sTCP:LISTEN
git diff --check
git status --porcelain -- static/canvas.html static/comfyui-settings.html
```

`python main.py` must start successfully on `127.0.0.1:3000` and then be stopped cleanly. After stopping, port 3000 must have no listener.

## Required Playwright QA

Use deterministic Playwright automation. Mock external providers when needed, but verify payloads and state transitions exactly.

Required coverage:

- `/app/canvas` has zero iframes.
- `/app/canvas` makes zero `/static/canvas.html` requests.
- existing legacy canvas documents load without data loss;
- create/open/rename/save/delete/trash/restore/purge;
- pan/zoom/reset;
- add/edit/move/resize/delete every migrated node type;
- connect via drag handles;
- select/delete links;
- save/reload preserves nodes, links, outputs, run states, unknown fields, viewport, logs, and settings;
- image execution success and failure;
- generator execution success and failure;
- ComfyUI/workflow execution success and failure;
- custom workflow params render, edit, submit, save, and reload;
- LLM execution success and failure;
- LLM outputText-only downstream regression;
- video execution success and failure;
- output node placement does not overlap existing nodes;
- Gallery/Creation Rail asset intake;
- local asset check/download;
- theme persistence light/dark;
- mobile light/dark with no horizontal overflow;
- native route smoke for Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas, API / Models, ComfyUI;
- console/page errors are zero, except explicitly mocked unavailable asset URLs that are not part of the final verification.

## Required Screenshots

Save screenshots under `docs/quiet-creative-os/screenshots/`:

- `native-canvas-complete-desktop-light.png`
- `native-canvas-complete-desktop-dark.png`
- `native-canvas-complete-mobile-light.png`
- `native-canvas-complete-mobile-dark.png`
- `native-canvas-node-types.png`
- `native-canvas-links.png`
- `native-canvas-llm-to-generator.png`
- `native-canvas-image-result.png`
- `native-canvas-workflow-result.png`
- `native-canvas-custom-workflow.png`
- `native-canvas-video-result.png`
- `native-canvas-save-reload.png`

## Documentation And Handoff

Update:

- `REVIEW_HANDOFF.md`
- `docs/quiet-creative-os-canvas-completion-plan.md`
- a final sprint doc, preferably `docs/quiet-creative-os-native-canvas-complete-migration.md`

The final handoff must include:

- initial guard output;
- legacy Canvas audit checklist;
- what changed;
- exact commands and results;
- Playwright QA matrix and pass/fail result;
- screenshot paths;
- known residual risks, if any;
- explicit confirmation of no commit/push/merge/rebase and no new worktree.

## Completion Bar

Do not mark the goal complete unless all required verification passes.

If any user-facing legacy Canvas capability remains unmigrated, the correct outcome is not "complete". Continue implementing until it is complete, or stop only for a real external blocker such as missing paid credentials for live provider execution. Mocked provider tests are still required even when live credentials are missing.
