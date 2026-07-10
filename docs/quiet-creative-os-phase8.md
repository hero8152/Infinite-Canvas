# Quiet Creative OS Phase 8

## Summary

Phase 8 removes visible fallback clutter and retired tools from the Quiet Creative OS product shell.

- legacy fallback pages were removed from the product shell.
- Legacy fallback pages were removed from the product route registry and navigation.
- Native workspaces no longer show `Legacy ...` links.
- Flatlay and Batch try-on were retired from the shell.
- Direct visits to removed fallback routes normalize to the native route.
- Direct visits to retired Flatlay and Batch try-on routes normalize to Gallery.
- Canvas, Angle, API / Models, and ComfyUI remain first-class embedded routes.
- /legacy no longer represents the product shell and redirects to `/app`.
- No backend API schema changes were made; no backend API schema changes were made.
- `canvas.html` internals were not migrated; canvas.html internals were not migrated.
- Angle, API / Models, and ComfyUI internals were not migrated.

## Product Navigation

Desktop sidebar now contains:

Create:

- Generate
- Enhance
- Edit
- Online
- Angle

Workspace:

- Chat
- Gallery
- Canvas

System:

- API / Models
- ComfyUI

Mobile bottom nav remains focused on the high-frequency routes:

- Generate
- Enhance
- Edit
- Online
- Chat
- Gallery
- Canvas

Angle, API / Models, and ComfyUI remain available through desktop navigation and direct URLs.

## Removed Fallback Routes

The following route entries were removed from the product route registry:

- `/app/legacy-generate`
- `/app/legacy-enhance`
- `/app/legacy-edit`
- `/app/legacy-online`
- `/app/legacy-chat`
- `/app/legacy-gallery`

Direct access now normalizes:

- `/app/legacy-generate` -> `/app`
- `/app/legacy-enhance` -> `/app/enhance`
- `/app/legacy-edit` -> `/app/edit`
- `/app/legacy-online` -> `/app/online`
- `/app/legacy-chat` -> `/app/chat`
- `/app/legacy-gallery` -> `/app/gallery`

The old static fallback files remain on disk as dormant cleanup follow-up because removing static files is riskier than removing product routes.

## Retired Routes

Flatlay and Batch try-on were removed from app navigation and the product route registry.

- `/app/flatlay` normalizes to `/app/gallery`.
- `/app/batch-tryon` normalizes to `/app/gallery`.

`static/flatlay.html` and `static/batch-tryon.html` were not deleted. They are still referenced by backend APIs, gallery asset aggregation, and runtime data paths, so deletion is deferred to a backend cleanup phase.

## Preserved Embedded Routes

Canvas remains embedded temporarily and is the next major migration priority:

- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`

Angle remains embedded temporarily and should be migrated native later:

- `/app/angle` -> `/static/angle.html?v=20260514-cta`

API / Models and ComfyUI remain embedded temporarily and should be migrated native later:

- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

The React shell uses `EmbeddedWorkbench` and route kind `embedded` for these routes. They are not presented as fallback or legacy surfaces.

## Implementation Notes

- `frontend/src/app/routes.tsx` now exposes only product routes through `APP_ROUTES`.
- Removed direct route entries live only in `REMOVED_ROUTE_REDIRECTS`.
- `routeFromLocation()` maps removed paths to their destination route.
- `normalizedAppPathForLocation()` lets the shell replace removed URLs with canonical product URLs.
- `LegacyWorkbench` was replaced by `EmbeddedWorkbench`.
- iframe CSS was renamed from `qc-legacy-frame` to `qc-embedded-frame`.
- `/legacy` returns `RedirectResponse("/app")`.
- Creation Rail remains overlay-only and does not participate in shell grid layout.

## Verification

Required command verification:

```bash
npm run build
python scripts/guardrails.py
python main.py
```

Results:

- `npm run build`: passed.
- `python scripts/guardrails.py`: passed; guardrails also ran the frontend build.
- `python main.py`: passed after restarting the local development server so the `/legacy -> /app` redirect from `main.py` was loaded. The server listened on `http://127.0.0.1:3000`.

Browser QA coverage:

- `/` loads the new shell.
- `/app` loads the new shell.
- `/legacy` redirects or normalizes to `/app`.
- `/app/generate`, `/app/enhance`, `/app/edit`, `/app/online`, `/app/chat`, and `/app/gallery` are native and have no iframe.
- `/app/canvas` loads embedded Canvas.
- `/app/angle` loads embedded Angle.
- `/app/api-models` loads embedded API / Models.
- `/app/comfyui` loads embedded ComfyUI.
- `/app/legacy-*` routes do not load old iframes.
- `/app/flatlay` and `/app/batch-tryon` do not load old iframes.
- Flatlay and Batch try-on do not appear in sidebar or mobile nav.
- No visible `Legacy ...` labels remain in React product UI.
- Canvas, Angle, API / Models, and ComfyUI remain visible in desktop navigation.
- Creation Rail opens as overlay and does not resize the workspace.
- Mobile bottom nav remains usable.
- Light/dark theme persists.
- Native route console has no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase8-shell-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase8-shell-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase8-canvas-embedded-desktop.png`
- `docs/quiet-creative-os/screenshots/phase8-angle-embedded-desktop.png`
- `docs/quiet-creative-os/screenshots/phase8-system-routes-desktop.png`

## Known Risks

- Static Flatlay and Batch try-on files remain on disk because their backend and data paths still exist.
- Removed fallback routes are normalized in the React shell, so a direct first paint can briefly load the shell before URL replacement.
- Canvas, Angle, API / Models, and ComfyUI still depend on iframe/theme-message behavior until their native migrations are planned and verified.
