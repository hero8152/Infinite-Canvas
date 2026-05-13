# Repository Guidelines

## Project Structure & Module Organization

FastAPI app for AI image generation, chat, and an iframe canvas UI.

- `main.py` contains routes, WebSockets, persistence, and provider integrations.
- `static/` contains self-contained HTML pages plus `theme.js`, `theme.css`, and `design-system.css`.
- `workflows/` stores ComfyUI API workflow JSON files referenced by name.
- `packages/` contains Windows wheels.
- Runtime data is ignored: `API/.env`, `output/`, `data/`, `history.json`, and `global_config.json`.
- `docs/`, `DESIGN.md`, `README.md`, and `CLAUDE.md` document design and architecture.

## Build, Test, and Development Commands

```bash
python -m pip install -r requirements.txt
python main.py
```

Installs dependencies and starts `http://127.0.0.1:3000`.

```bash
python scripts/guardrails.py
```

Runs compile, workflow JSON, security, token-flow, and design checks.

```bash
python -m pip install --no-index --find-links=packages -r requirements.txt
run.bat
```

Uses bundled wheels for Windows setup. `安装依赖.bat` installs with online fallback.

Create `API/.env` before using external providers. Never commit API keys or generated outputs.

## Coding Style & Naming Conventions

Use Python 4-space indentation. Prefer Pydantic models and existing locks for JSON-backed state.

Frontend pages are plain HTML with inline JavaScript. Keep page-specific logic local unless behavior belongs in `static/theme.js` or shared CSS. Workflow overrides must preserve `{node_id: {field: value}}`.

## Design System Guardrails

Treat `DESIGN.md` as the source of truth for UI work. Preserve the Mistral-faithful style: cream grid paper, hard corners, pixel SVG icons, orange accents, black CTAs, no generic Lucide/Heroicons, no soft shadows, no pill controls, and no blue/purple/cyan drift. Prefer `static/design-system.css` before page-local CSS. For visual changes, scan for `rounded-full`, `rounded-2xl`, large `box-shadow`, and slate/blue classes.

## Testing Guidelines

There is no full test suite or build pipeline. Run `python scripts/guardrails.py` before handoff. For behavior changes, run `python main.py`, open `http://127.0.0.1:3000`, and verify the affected iframe plus related API paths. For UI/theme changes, check light and dark modes and keep `DESIGN.md` aligned.

## Commit & Pull Request Guidelines

Recent history uses concise, scoped messages such as `fix(dark): ...`, `fix(canvas): ...`, and `polish(canvas-dark+light): ...`. Start with a type, add a scope when useful, and describe the visible change.

Pull requests should include the problem, fix, verification notes, screenshots for UI changes, and any `API/.env` or workflow assumptions.

## Security & Configuration Tips

Treat `API/.env` as local-only secret storage. Validate changes against missing or empty provider keys, and avoid writing secrets, generated images, canvas data, or conversation history into tracked files.
